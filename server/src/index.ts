import { buildApp } from './app.js';
import { FixtureStore } from './store.js';
import { fileURLToPath } from 'node:url';
import { addressSchema } from '@splitt/core';
import type { Address } from 'viem';
import { connectDatabase } from './db/driver.js';
import { PostgresStore } from './db/postgres-store.js';
import { PostgresAuthRepository } from './auth/repository.js';
import { initialState, type StateStore } from './store.js';
const mode = process.env.SPLITT_MODE ?? 'fixture';
if (mode === 'arc-testnet') {
  const { startTestnet } = await import('./live/runtime.js');
  await startTestnet();
} else {
  if (mode !== 'fixture')
    throw new Error(
      'Live mode is not enabled. Complete Arc indexing, deployment and Circle execution first.',
    );
  const storage = process.env.SPLITT_STORAGE ?? 'file';
  if (!['file', 'postgres'].includes(storage))
    throw new Error('SPLITT_STORAGE must be file or postgres.');
  const owner = process.env.OWNER_ADDRESS
    ? (addressSchema.parse(process.env.OWNER_ADDRESS) as Address)
    : undefined;
  const vault = process.env.VAULT_ADDRESS
    ? (addressSchema.parse(process.env.VAULT_ADDRESS) as Address)
    : undefined;
  if (vault && !owner) throw new Error('Set OWNER_ADDRESS before enabling batch signing.');
  const db =
    storage === 'postgres'
      ? connectDatabase(
          process.env.DATABASE_URL ||
            (() => {
              throw new Error('Set DATABASE_URL for Postgres storage.');
            })(),
        )
      : undefined;
  let store: StateStore;
  if (db) {
    if (!owner)
      throw new Error('Postgres workspaces require OWNER_ADDRESS and signed owner authentication.');
    store = await new PostgresStore(db, owner).init(initialState());
  } else {
    store = await new FixtureStore(
      fileURLToPath(new URL('../.data/fixture.json', import.meta.url)),
    ).init();
  }
  const app = await buildApp(store, true, {
    storage: storage as 'file' | 'postgres',
    auth: owner
      ? { owner, repository: db ? new PostgresAuthRepository(db) : undefined }
      : undefined,
    approval: owner && vault ? { owner, vault } : undefined,
  });
  if (db) app.addHook('onClose', async () => db.close());
  await app.listen({ port: Number(process.env.PORT ?? 4000), host: '127.0.0.1' });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => void app.close());
}
