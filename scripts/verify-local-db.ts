import { connectDatabase } from '../server/src/db/driver.js';
import { LivePostgresRepository } from '../server/src/live/repository.js';
import { writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { privateKeyToAccount } from 'viem/accounts';
import { PostgresStore } from '../server/src/db/postgres-store.js';
import { initialState } from '../server/src/store.js';
import { buildApp } from '../server/src/app.js';
import { PostgresAuthRepository } from '../server/src/auth/repository.js';
if (!process.env.DATABASE_URL) throw new Error('Database configuration missing.');
const db = connectDatabase(process.env.DATABASE_URL);
const phase = process.argv[2] ?? 'write';
try {
  const connection = (
    await db.query<{ port: string; version: string; database: string }>(
      "SELECT current_setting('port') AS port, version(), current_database() AS database",
    )
  ).rows[0];
  if (connection.port !== '55432' || connection.database !== 'splitt')
    throw new Error('Wrong database target.');
  const key = 'setup-proof:postgres-17';
  await db
    .query(
      "UPDATE arc_workspaces SET state=(state#>>'{}')::jsonb WHERE scope=$1 AND jsonb_typeof(state)='string'",
      [key],
    )
    .catch((error) => {
      if (error.code !== '42P01') throw error;
    });
  const repo = await new LivePostgresRepository(db, key).init('0');
  if (phase === 'write') {
    await repo.transaction((s) => {
      s.nextBlock = '100';
    });
    const second = new LivePostgresRepository(db, key);
    await Promise.all([
      repo.transaction((s) => {
        s.nextBlock = String(BigInt(s.nextBlock) + 1n);
      }),
      second.transaction((s) => {
        s.nextBlock = String(BigInt(s.nextBlock) + 1n);
      }),
    ]);
    try {
      await repo.transaction((s) => {
        s.nextBlock = '999';
        throw new Error('Rollback test');
      });
    } catch {}
  }
  const state = await repo.snapshot();
  if (state.nextBlock !== '102')
    throw new Error('Persistence, transaction locking or rollback failed.');
  if (state.events.length || state.jobs.length || state.projects.length)
    throw new Error('Proof scope must not contain payment activity.');
  const localWallet = JSON.parse(
    await readFile(new URL('../server/.secrets/owner-wallet.json', import.meta.url), 'utf8'),
  );
  const account = privateKeyToAccount(localWallet.privateKey);
  const fixtureStore = await new PostgresStore(db, account.address).init(initialState());
  const app = await buildApp(fixtureStore, false, {
    storage: 'postgres',
    auth: { owner: account.address, repository: new PostgresAuthRepository(db) },
  });
  try {
    const headers = { origin: 'http://localhost:3000' };
    const challenge = await app.inject({
      method: 'POST',
      url: '/auth/challenge',
      headers,
      payload: { address: account.address },
    });
    if (challenge.statusCode !== 200) throw new Error('Owner challenge failed.');
    const body = challenge.json();
    const signature = await account.signMessage({ message: body.message });
    const verified = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      headers,
      payload: { nonce: body.nonce, signature },
    });
    if (verified.statusCode !== 200) throw new Error('Owner authentication failed.');
    const cookie = verified.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const workspace = await app.inject({
      method: 'GET',
      url: '/workspace',
      headers: { ...headers, cookie },
    });
    const project = workspace
      .json()
      .projects.find((p: { name: string }) => p.name === 'Northstar brand launch');
    if (!project) throw new Error('Fixture project missing.');
    const plan = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/replan`,
      headers: { ...headers, cookie, 'x-splitt-csrf': verified.json().csrf },
    });
    if (plan.statusCode !== 200) throw new Error('Relational planning failed.');
    const persisted = (await fixtureStore.snapshot()).plans.find((p) => p.id === plan.json().id);
    if (!persisted || typeof persisted.facts !== 'object' || !Array.isArray(persisted.output.items))
      throw new Error('JSONB plan serialization failed.');
  } finally {
    await app.close();
  }
  const report = {
    checkedAt: new Date().toISOString(),
    engine: connection.version,
    database: connection.database,
    port: Number(connection.port),
    phase,
    transactionLocks: true,
    rollback: true,
    persistentCursor: state.nextBlock,
    restartVerified: phase === 'read',
    realPaymentActivity: false,
  };
  await writeFile(
    new URL('../docs/postgres-verification.json', import.meta.url),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.close();
}
