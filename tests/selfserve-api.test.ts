import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { idHash } from '@splitt/core';
import type { Database } from '../server/src/db/driver';
import { buildSelfServeApp } from '../server/src/selfserve/runtime';
vi.mock('../server/src/circle/operator', () => ({
  circleOperator: () => ({ verify: vi.fn(async () => {}), submit: vi.fn(), status: vi.fn() }),
}));
const alice = privateKeyToAccount(generatePrivateKey()),
  bob = privateKeyToAccount(generatePrivateKey()),
  operator = '0x3333333333333333333333333333333333333333' as const;
const a = '0x1111111111111111111111111111111111111111',
  b = '0x2222222222222222222222222222222222222222';
let pg: PGlite, db: Database, built: Awaited<ReturnType<typeof buildSelfServeApp>>;
beforeAll(async () => {
  pg = new PGlite();
  db = {
    query: (text, values) => pg.query(text, values),
    transaction: (fn) =>
      pg.transaction((tx) => fn({ query: (text, values) => tx.query(text, values) })),
    close: () => pg.close(),
  };
  await pg.exec(
    'CREATE TABLE auth_nonces(nonce text PRIMARY KEY,wallet_address text,message text,expires_at timestamptz,used_at timestamptz); CREATE TABLE auth_sessions(token_hash text PRIMARY KEY,wallet_address text,csrf_token text,expires_at timestamptz,origin text);',
  );
  built = await buildSelfServeApp(db, operator, 'http://localhost:3000', {
    startWorker: false,
    logger: false,
  });
  for (const [vault, owner] of [
    [a, alice.address],
    [b, bob.address],
  ])
    await db.query(
      'INSERT INTO selfserve_vaults(vault,owner,deployment_tx,deployment_block,code_hash,classification) VALUES($1,$2,$3,$4,$5,$6)',
      [vault, owner.toLowerCase(), idHash(vault), '100', idHash('code'), 'unverified_testnet'],
    );
  vi.spyOn(built.registry, 'verify').mockResolvedValue();
});
afterAll(async () => {
  await built.app.close();
  await db.close();
});
async function login(account: PrivateKeyAccount) {
  const challenge = (
    await built.app.inject({
      method: 'POST',
      url: '/auth/challenge',
      headers: { origin: 'http://localhost:3000' },
      payload: { address: account.address },
    })
  ).json();
  const result = await built.app.inject({
    method: 'POST',
    url: '/auth/verify',
    headers: { origin: 'http://localhost:3000' },
    payload: {
      nonce: challenge.nonce,
      signature: await account.signMessage({ message: challenge.message }),
    },
  });
  expect(result.statusCode).toBe(200);
  return {
    cookie: String(result.headers['set-cookie']).split(';')[0],
    'x-splitt-csrf': result.json().csrf,
    origin: 'http://localhost:3000',
  };
}
describe('multi-wallet HTTP boundaries', () => {
  it('exposes public chain configuration while keeping vault lists private', async () => {
    expect((await built.app.inject('/selfserve/config')).statusCode).toBe(200);
    expect((await built.app.inject('/selfserve/vaults')).statusCode).toBe(401);
    expect(
      (await built.app.inject({ url: '/selfserve/vaults', headers: await login(alice) }))
        .json()
        .map((v: { vault: string }) => v.vault),
    ).toEqual([a]);
    expect(
      (await built.app.inject({ url: '/selfserve/vaults', headers: await login(bob) }))
        .json()
        .map((v: { vault: string }) => v.vault),
    ).toEqual([b]);
  });
  it('cannot read or write another owner’s workspace, even with a valid signed session', async () => {
    const headers = await login(alice);
    expect(
      (await built.app.inject({ url: `/selfserve/vaults/${b}/workspace`, headers })).statusCode,
    ).toBe(404);
    expect(
      (
        await built.app.inject({
          method: 'POST',
          url: `/selfserve/vaults/${b}/plans/foreign/submit`,
          headers,
          payload: { signature: `0x${'11'.repeat(65)}` },
        })
      ).statusCode,
    ).toBe(404);
    expect(built.registry.verify).not.toHaveBeenCalled();
    const own = (
      await built.app.inject({ url: `/selfserve/vaults/${a}/workspace`, headers })
    ).json();
    expect(own.owner).toBe(alice.address.toLowerCase());
    expect(own.vault).toBe(a);
    expect(own.projects).toEqual([]);
  });
  it('enforces Origin and CSRF before any registration, planning or relay', async () => {
    const headers = await login(bob);
    expect(
      (
        await built.app.inject({
          method: 'POST',
          url: `/selfserve/vaults/${b}/projects`,
          headers: { ...headers, origin: 'https://attacker.example' },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await built.app.inject({
          method: 'POST',
          url: `/selfserve/vaults/${b}/plans/any/submit`,
          headers: { ...headers, 'x-splitt-csrf': '' },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
  });
});
