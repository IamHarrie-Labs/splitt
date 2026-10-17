import { createPublicClient, http, keccak256, type Address, type Hex } from 'viem';
import { z } from 'zod';
import { addressSchema } from '@splitt/core';
import { SELF_SERVE, vaultCreation } from '../../../packages/core/src/selfserve.js';
import { arc, arcGateway } from '../live/chain.js';
import type { Database } from '../db/driver.js';
import { LivePostgresRepository, type LiveRepository, type LiveState } from '../live/repository.js';
export const registrationInput = z
  .object({ transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) })
  .strict();
export type RegisteredVault = {
  vault: Address;
  owner: Address;
  deployment_tx: Hex;
  deployment_block: string;
  code_hash: Hex;
  classification: 'controlled_test' | 'unverified_testnet';
};
export const policyError = (message: string, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
export function cappedWorkspace(repo: LiveRepository): LiveRepository {
  return {
    snapshot: () => repo.snapshot(),
    transaction: (fn) =>
      repo.transaction((state) => {
        const result = fn(state);
        if (
          state.projects.length > SELF_SERVE.maxProjects ||
          state.projects.some((p) => p.commitments.length > SELF_SERVE.maxContractors)
        )
          throw policyError(
            'The testnet preview supports one project and two contractors per vault.',
          );
        if (state.plans.length > 100)
          throw policyError('This preview workspace has reached its plan limit.');
        return result;
      }),
  };
}
export class VaultRegistry {
  client = createPublicClient({
    chain: arc,
    transport: http(process.env.ARC_RPC_URL ?? arc.rpcUrls.default.http[0], {
      timeout: 15000,
      retryCount: 0,
    }),
  });
  constructor(
    public db: Database,
    public operator: Address,
    public controlledOwners: string[] = [],
  ) {}
  async init() {
    await this.db.query(
      'CREATE TABLE IF NOT EXISTS arc_workspaces(scope text PRIMARY KEY,state jsonb NOT NULL)',
    );
    await this.db.query(
      `CREATE TABLE IF NOT EXISTS selfserve_vaults(vault text PRIMARY KEY,owner text NOT NULL UNIQUE,deployment_tx text NOT NULL UNIQUE,deployment_block text NOT NULL,code_hash text NOT NULL,classification text NOT NULL CHECK(classification IN ('controlled_test','unverified_testnet')),created_at timestamptz NOT NULL DEFAULT now())`,
    );
    return this;
  }
  async activity() {
    const rows = (
      await this.db.query<{
        classification: string;
        vaults: string;
        batches: string;
        paid_micro: string;
      }>(
        `SELECT v.classification,count(DISTINCT v.vault)::text AS vaults,count(j.job) FILTER(WHERE j.job->>'state'='confirmed')::text AS batches,coalesce(sum(CASE WHEN j.job->>'state'='confirmed' THEN (SELECT coalesce(sum((i->>'amount')::numeric),0) FROM jsonb_array_elements(j.job->'approval'->'items') i) ELSE 0 END),0)::text AS paid_micro FROM selfserve_vaults v LEFT JOIN arc_workspaces w ON w.scope='5042002:'||v.vault LEFT JOIN LATERAL jsonb_array_elements(coalesce(w.state->'jobs','[]'::jsonb)) j(job) ON true GROUP BY v.classification`,
      )
    ).rows;
    const group = (classification: string) => {
      const row = rows.find((r) => r.classification === classification);
      return {
        vaults: Number(row?.vaults ?? 0),
        confirmedBatches: Number(row?.batches ?? 0),
        paidMicro: row?.paid_micro ?? '0',
      };
    };
    return {
      controlledTests: group('controlled_test'),
      unverifiedTestnet: group('unverified_testnet'),
      verifiedBusinesses: 0,
    };
  }
  async list(owner?: string) {
    return (
      await this.db.query<RegisteredVault>(
        `SELECT vault,owner,deployment_tx,deployment_block,code_hash,classification FROM selfserve_vaults ${owner ? 'WHERE owner=$1' : ''} ORDER BY created_at`,
        owner ? [owner.toLowerCase()] : [],
      )
    ).rows;
  }
  async owned(vault: string, owner: string) {
    addressSchema.parse(vault);
    const found = (await this.list(owner)).find((v) => v.vault === vault.toLowerCase());
    if (!found) throw policyError('Vault not found in this wallet’s workspace.', 404);
    return found;
  }
  async verify(record: RegisteredVault) {
    await arcGateway(record.vault, record.owner, this.operator).verify();
    const code = await this.client.getCode({ address: record.vault });
    if (!code || keccak256(code) !== record.code_hash)
      throw policyError('Registered vault code changed. Sponsorship is disabled.', 409);
  }
  async register(owner: Address, input: unknown) {
    const { transactionHash } = registrationInput.parse(input);
    if ((await this.client.getChainId()) !== SELF_SERVE.chainId)
      throw policyError('Only Arc Testnet is allowed.');
    const [tx, receipt] = await Promise.all([
      this.client.getTransaction({ hash: transactionHash as Hex }),
      this.client.getTransactionReceipt({ hash: transactionHash as Hex }),
    ]);
    if (
      receipt.status !== 'success' ||
      tx.to !== null ||
      !receipt.contractAddress ||
      tx.from.toLowerCase() !== owner.toLowerCase() ||
      tx.input.toLowerCase() !== vaultCreation(owner, this.operator).toLowerCase()
    )
      throw policyError('This is not the exact Splitt vault deployment signed by this wallet.');
    const code = await this.client.getCode({ address: receipt.contractAddress });
    if (!code) throw policyError('Deployment bytecode is unavailable.');
    const record: RegisteredVault = {
      vault: receipt.contractAddress.toLowerCase() as Address,
      owner: owner.toLowerCase() as Address,
      deployment_tx: transactionHash as Hex,
      deployment_block: String(receipt.blockNumber),
      code_hash: keccak256(code),
      classification: this.controlledOwners.some((a) => a.toLowerCase() === owner.toLowerCase())
        ? 'controlled_test'
        : 'unverified_testnet',
    };
    await this.verify(record);
    return this.db.transaction(async (db) => {
      await db.query(`SELECT pg_advisory_xact_lock(hashtext('splitt-public-vault-registration'))`);
      const existing = (
        await db.query<RegisteredVault>(
          'SELECT * FROM selfserve_vaults WHERE owner=$1 OR vault=$2',
          [record.owner, record.vault],
        )
      ).rows;
      if (existing.length) {
        if (existing[0].vault === record.vault && existing[0].owner === record.owner)
          return existing[0];
        throw policyError('This wallet already has a registered testnet vault.', 409);
      }
      const count = (
        await db.query<{ count: string }>('SELECT count(*)::text AS count FROM selfserve_vaults')
      ).rows[0];
      if (Number(count.count) >= SELF_SERVE.maxVaults)
        throw policyError('The public preview has reached its vault limit.', 429);
      await db.query(
        'INSERT INTO selfserve_vaults(vault,owner,deployment_tx,deployment_block,code_hash,classification) VALUES($1,$2,$3,$4,$5,$6)',
        Object.values(record),
      );
      return record;
    });
  }
  async repository(record: RegisteredVault) {
    return cappedWorkspace(
      await new LivePostgresRepository(this.db, `5042002:${record.vault}`).init(
        record.deployment_block,
      ),
    );
  }
}
