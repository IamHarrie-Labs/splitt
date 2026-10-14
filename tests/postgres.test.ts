import { PGlite, type PGliteInterface } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { Database, Queryable } from '../server/src/db/driver.js';
import { databaseId, PostgresStore } from '../server/src/db/postgres-store.js';
import { appendLedger, initialState } from '../server/src/store.js';
import { PostgresAuthRepository } from '../server/src/auth/repository.js';
import { buildApp } from '../server/src/app.js';
import { approvalTypedData } from '../server/src/approvals.js';
import { buildFacts, hashJson, validatePlan } from '@splitt/core';
import { demoNow } from '../server/src/store.js';

let pg: PGlite;
let db: Database;
const owner = privateKeyToAccount(generatePrivateKey());
let store: PostgresStore;
beforeAll(async () => {
  pg = new PGlite();
  const queryable = (client: Pick<PGliteInterface, 'query'>): Queryable => ({
    query: (text, values) => client.query(text, values),
  });
  db = {
    ...queryable(pg),
    transaction: (fn) => pg.transaction((tx) => fn(queryable(tx))),
    close: () => pg.close(),
  };
  for (let pass = 0; pass < 2; pass++) {
    await pg.exec(await readFile(new URL('../server/src/db/schema.sql', import.meta.url), 'utf8'));
    await pg.exec(await readFile(new URL('../server/src/db/runtime.sql', import.meta.url), 'utf8'));
  }
  store = await new PostgresStore(db, owner.address).init(initialState());
});
afterAll(async () => {
  await db?.close();
});
describe('Postgres repository on the embedded PostgreSQL engine', () => {
  it('applies migrations twice, seeds once and reopens a relational workspace', async () => {
    const reopened = await new PostgresStore(db, owner.address).init(initialState());
    const state = await reopened.snapshot();
    expect(state.projects).toHaveLength(2);
    expect(state.payments).toHaveLength(1);
    const project =
      state.projects.find((p) => p.name === 'Northstar brand launch') ??
      state.projects.find((p) => p.id === databaseId('northstar'))!;
    expect(project.balance).toBe('1200000000');
    expect(project.commitments).toHaveLength(2);
    expect(project.commitments.every((c) => c.acceptedAt === '2026-09-25')).toBe(true);
    expect((await pg.query('SELECT * FROM invoices')).rows).toHaveLength(2);
  });
  it('rolls back all relational changes when a money constraint fails', async () => {
    const before = await store.snapshot();
    await expect(
      store.transaction((s) => {
        appendLedger(s, s.projects[0].id, 'Must roll back', 'This row must never survive.');
        s.projects[0].balance = '-1';
      }),
    ).rejects.toThrow();
    expect(await store.snapshot()).toEqual(before);
  });
  it('serializes concurrent deposits across repository instances and preserves exact large integers', async () => {
    const another = new PostgresStore(db, owner.address);
    const id = databaseId('northstar');
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        (i % 2 ? another : store).transaction((s) => {
          const p = s.projects.find((p) => p.id === id)!;
          p.balance = (BigInt(p.balance) + 1n).toString();
          appendLedger(s, id, 'One micro-USDC', 'Concurrent writer.', '1');
        }),
      ),
    );
    expect((await store.snapshot()).projects.find((p) => p.id === id)?.balance).toBe('1200000005');
    await store.transaction((s) => {
      s.projects.find((p) => p.id === id)!.balance = '9007199254740993';
    });
    expect((await another.snapshot()).projects.find((p) => p.id === id)?.balance).toBe(
      '9007199254740993',
    );
    await store.transaction((s) => {
      s.projects.find((p) => p.id === id)!.balance = '1200000000';
    });
  });
  it('keeps audit rows append-only and isolates owners', async () => {
    const before = await store.snapshot();
    await expect(
      store.transaction((s) => {
        s.ledger[0].detail = 'Rewritten';
      }),
    ).rejects.toThrow('Audit entries');
    expect(await store.snapshot()).toEqual(before);
    const outsider = await new PostgresStore(
      db,
      '0x0000000000000000000000000000000000000009',
    ).init();
    expect((await outsider.snapshot()).projects).toEqual([]);
    await expect(
      outsider.transaction((s) => {
        s.projects.push(structuredClone(before.projects[0]));
      }),
    ).rejects.toThrow('another owner');
    expect(await store.snapshot()).toEqual(before);
  });
  it('persists login challenges, consumes once and revokes durable sessions', async () => {
    const auth = new PostgresAuthRepository(db);
    const reopened = new PostgresAuthRepository(db);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60000);
    await auth.putChallenge({
      nonce: 'db-test',
      wallet: owner.address,
      message: 'test',
      expiresAt,
    });
    expect((await reopened.challenge('db-test', now))?.message).toBe('test');
    const results = await Promise.all([
      auth.consume('db-test', now),
      reopened.consume('db-test', now),
    ]);
    expect(results.sort()).toEqual([false, true]);
    await auth.putSession({
      tokenHash: 'hash',
      wallet: owner.address,
      csrf: 'csrf',
      expiresAt,
      origin: 'http://localhost:3000',
    });
    expect((await reopened.session('hash', now))?.wallet).toBe(owner.address);
    await reopened.revoke('hash');
    expect(await auth.session('hash', now)).toBeUndefined();
  });
  it('runs authenticated planning, approval and fixture settlement entirely through relational storage', async () => {
    const app = await buildApp(store, false, {
      storage: 'postgres',
      auth: { owner: owner.address, repository: new PostgresAuthRepository(db) },
      approval: { owner: owner.address, vault: '0x0000000000000000000000000000000000000123' },
    });
    let cookie = '';
    let csrf = '';
    const post = (url: string, payload: Record<string, unknown> = {}) =>
      app.inject({
        method: 'POST',
        url,
        payload,
        headers: { origin: 'http://localhost:3000', cookie, 'x-splitt-csrf': csrf },
      });
    try {
      const challenge = (await post('/auth/challenge', { address: owner.address })).json();
      const login = await post('/auth/verify', {
        nonce: challenge.nonce,
        signature: await owner.signMessage({ message: challenge.message }),
      });
      cookie = String(login.headers['set-cookie']).split(';')[0];
      csrf = login.json().csrf;
      const proposed = await post(`/projects/${databaseId('northstar')}/replan`);
      expect(proposed.statusCode).toBe(200);
      const plan = proposed.json();
      const saved = (await store.snapshot()).plans.find((p) => p.id === plan.id)!;
      const project = (await store.snapshot()).projects.find((p) => p.id === saved.projectId)!;
      expect(buildFacts(project, demoNow())).toEqual(saved.facts);
      expect(
        validatePlan(saved.output, saved.facts, buildFacts(project, demoNow()), saved.baseline),
      ).toEqual(saved.validation);
      expect(hashJson(saved.output)).toBe(saved.planHash);
      expect(hashJson(saved.facts)).toBe(saved.factsHash);
      expect(BigInt(saved.validation.total)).toBeGreaterThan(0n);
      const prepared = await post(`/plans/${plan.id}/prepare`);
      expect(prepared.statusCode, prepared.body).toBe(200);
      const approval = prepared.json().approval;
      const signature = await owner.signTypedData(approvalTypedData(approval));
      expect((await post(`/plans/${plan.id}/approve`, { signature })).statusCode).toBe(200);
      expect((await post('/fixture/reset')).statusCode).toBe(409);
      expect((await post(`/plans/${plan.id}/simulate`)).statusCode).toBe(200);
      const reopened = new PostgresStore(db, owner.address);
      const state = await reopened.snapshot();
      expect(state.plans.at(-1)?.approval?.signature).toBe(signature);
      expect(state.plans.at(-1)?.status).toBe('done');
      expect(state.projects.find((p) => p.id === databaseId('northstar'))?.balance).toBe(
        '300000000',
      );
      expect((await pg.query('SELECT * FROM plan_items')).rows).toHaveLength(2);
    } finally {
      await app.close();
    }
  });
});
