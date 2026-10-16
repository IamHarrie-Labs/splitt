import { readFile, writeFile } from 'node:fs/promises';
import { addressSchema } from '@splitt/core';
import type { Address } from 'viem';
import { connectDatabase } from '../server/src/db/driver.js';
import { LivePostgresRepository } from '../server/src/live/repository.js';
import { arcGateway } from '../server/src/live/chain.js';
import { importWorkspace, workspaceExport } from '../server/src/live/migration.js';
const [mode, path] = process.argv.slice(2);
if (!['export', 'import'].includes(mode) || !path)
  throw new Error('Usage: migrate-workspace.ts export|import PRIVATE_FILE');
const vault = addressSchema.parse(process.env.VAULT_ADDRESS) as Address,
  owner = addressSchema.parse(process.env.OWNER_ADDRESS) as Address,
  operator = addressSchema.parse(process.env.OPERATOR_ADDRESS) as Address;
if (!process.env.DATABASE_URL || !/^\d+$/.test(process.env.VAULT_DEPLOYMENT_BLOCK ?? ''))
  throw new Error('Missing database or deployment configuration.');
await arcGateway(vault, owner, operator).verify();
const scope = `5042002:${vault.toLowerCase()}`,
  db = connectDatabase(process.env.DATABASE_URL);
try {
  const repo = await new LivePostgresRepository(db, scope).init(
    process.env.VAULT_DEPLOYMENT_BLOCK!,
  );
  if (mode === 'export') {
    const exported = workspaceExport(scope, await repo.snapshot());
    await writeFile(path, JSON.stringify(exported), { mode: 0o600, flag: 'wx' });
    console.log(
      JSON.stringify({
        exported: true,
        projects: exported.state.projects.length,
        jobs: exported.state.jobs.length,
        events: exported.state.events.length,
        stateHash: exported.stateHash,
      }),
    );
  } else
    console.log(
      JSON.stringify(await importWorkspace(repo, JSON.parse(await readFile(path, 'utf8')), scope)),
    );
} finally {
  await db.close();
}
