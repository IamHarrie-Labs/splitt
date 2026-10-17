import { formatGwei, type Address, type Hex } from 'viem';
import { SELF_SERVE } from '../../../packages/core/src/selfserve.js';
import type { Database } from '../db/driver.js';
import { OperatorPolicyError } from '../live/worker.js';
import { randomUUID } from 'node:crypto';
export type GasQuote = { gasLimit: string; maxFeePerGas: string; maxPriorityFeePerGas: string };
const cost = (q: GasQuote) => BigInt(q.gasLimit) * BigInt(q.maxFeePerGas);
export class SponsorshipBudget {
  constructor(public db: Database) {}
  async init() {
    await this.db.query(
      `CREATE TABLE IF NOT EXISTS selfserve_gas_reservations(job_id text PRIMARY KEY,owner text NOT NULL,vault text NOT NULL,day date NOT NULL,budget_wei numeric(40,0) NOT NULL,gas_limit text NOT NULL,max_fee_per_gas text NOT NULL,priority_fee text NOT NULL)`,
    );
    return this;
  }
  async existing(owner: Address, vault: Address, jobId: string): Promise<GasQuote | undefined> {
    const prior = (
      await this.db.query<{
        owner: string;
        vault: string;
        gas_limit: string;
        max_fee_per_gas: string;
        priority_fee: string;
      }>('SELECT * FROM selfserve_gas_reservations WHERE job_id=$1', [jobId])
    ).rows[0];
    if (!prior) return undefined;
    if (prior.owner !== owner.toLowerCase() || prior.vault !== vault.toLowerCase())
      throw new OperatorPolicyError('Gas reservation belongs to another workspace.');
    return {
      gasLimit: prior.gas_limit,
      maxFeePerGas: prior.max_fee_per_gas,
      maxPriorityFeePerGas: prior.priority_fee,
    };
  }
  async status(owner: Address, now = new Date()) {
    const day = now.toISOString().slice(0, 10);
    const rows = (
      await this.db.query<{ owner: string; day: string; budget_wei: string }>(
        'SELECT owner,day::text,budget_wei::text FROM selfserve_gas_reservations',
      )
    ).rows;
    const today = rows.filter((row) => row.day === day);
    const wallet = today.filter((row) => row.owner === owner.toLowerCase());
    const sum = (entries: typeof rows) =>
      entries.reduce((total, row) => total + BigInt(row.budget_wei), 0n);
    const positive = (amount: bigint) => String(amount > 0n ? amount : 0n);
    return {
      remainingWalletSlots: Math.max(0, SELF_SERVE.walletDailyBatches - wallet.length),
      remainingWalletGasWei: positive(BigInt(SELF_SERVE.walletDailyGas) - sum(wallet)),
      serviceAvailable:
        today.length < SELF_SERVE.globalDailyBatches &&
        sum(today) < BigInt(SELF_SERVE.globalDailyGas) &&
        sum(rows) < BigInt(SELF_SERVE.lifetimeGas),
      resetsAt: new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString(),
    };
  }
  async reserve(owner: Address, vault: Address, jobId: string, quote: GasQuote, now = new Date()) {
    const requested = cost(quote),
      day = now.toISOString().slice(0, 10);
    if (
      requested <= 0n ||
      BigInt(quote.gasLimit) > 600000n ||
      BigInt(quote.maxPriorityFeePerGas) > BigInt(quote.maxFeePerGas)
    )
      throw new OperatorPolicyError('Gas estimate exceeds the testnet sponsorship policy.');
    return this.db.transaction(async (db) => {
      await db.query(`SELECT pg_advisory_xact_lock(hashtext('splitt-public-gas-budget'))`);
      const prior = (
        await db.query<{
          owner: string;
          vault: string;
          gas_limit: string;
          max_fee_per_gas: string;
          priority_fee: string;
        }>('SELECT * FROM selfserve_gas_reservations WHERE job_id=$1', [jobId])
      ).rows[0];
      if (prior) {
        if (prior.owner !== owner.toLowerCase() || prior.vault !== vault.toLowerCase())
          throw new OperatorPolicyError('Gas reservation belongs to another workspace.');
        return {
          gasLimit: prior.gas_limit,
          maxFeePerGas: prior.max_fee_per_gas,
          maxPriorityFeePerGas: prior.priority_fee,
        };
      }
      const rows = (
        await db.query<{ owner: string; day: string; budget_wei: string }>(
          'SELECT owner,day::text,budget_wei::text FROM selfserve_gas_reservations',
        )
      ).rows;
      const today = rows.filter((r) => r.day === day),
        wallet = today.filter((r) => r.owner === owner.toLowerCase());
      const sum = (rs: typeof rows) => rs.reduce((n, r) => n + BigInt(r.budget_wei), 0n);
      if (
        wallet.length >= SELF_SERVE.walletDailyBatches ||
        today.length >= SELF_SERVE.globalDailyBatches ||
        sum(wallet) + requested > BigInt(SELF_SERVE.walletDailyGas) ||
        sum(today) + requested > BigInt(SELF_SERVE.globalDailyGas) ||
        sum(rows) + requested > BigInt(SELF_SERVE.lifetimeGas)
      )
        throw new OperatorPolicyError(
          'Sponsored gas limit reached. Your funds remain in your vault.',
        );
      await db.query(
        'INSERT INTO selfserve_gas_reservations(job_id,owner,vault,day,budget_wei,gas_limit,max_fee_per_gas,priority_fee) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          jobId,
          owner.toLowerCase(),
          vault.toLowerCase(),
          day,
          String(requested),
          quote.gasLimit,
          quote.maxFeePerGas,
          quote.maxPriorityFeePerGas,
        ],
      );
      return quote;
    });
  }
  async replaceRejectedFee(
    owner: Address,
    vault: Address,
    jobId: string,
    prior: GasQuote,
    next: GasQuote,
  ) {
    if (
      next.gasLimit !== prior.gasLimit ||
      BigInt(next.maxFeePerGas) < BigInt(prior.maxFeePerGas) ||
      BigInt(next.maxPriorityFeePerGas) < BigInt(prior.maxPriorityFeePerGas) ||
      BigInt(next.maxPriorityFeePerGas) > BigInt(next.maxFeePerGas)
    )
      throw new Error('Rejected fee cannot be replaced within the existing gas policy.');
    return this.db.transaction(async (db) => {
      await db.query(`SELECT pg_advisory_xact_lock(hashtext('splitt-public-gas-budget'))`);
      const current = (
        await db.query<{
          owner: string;
          vault: string;
          gas_limit: string;
          max_fee_per_gas: string;
          priority_fee: string;
        }>('SELECT * FROM selfserve_gas_reservations WHERE job_id=$1', [jobId])
      ).rows[0];
      if (
        !current ||
        current.owner !== owner.toLowerCase() ||
        current.vault !== vault.toLowerCase() ||
        current.gas_limit !== prior.gasLimit
      )
        throw new Error('Original fee reservation not found.');
      if (
        current.max_fee_per_gas !== prior.maxFeePerGas ||
        current.priority_fee !== prior.maxPriorityFeePerGas
      )
        return {
          gasLimit: current.gas_limit,
          maxFeePerGas: current.max_fee_per_gas,
          maxPriorityFeePerGas: current.priority_fee,
        };
      const rows = (
        await db.query<{ owner: string; day: string; budget_wei: string }>(
          'SELECT owner,day::text,budget_wei::text FROM selfserve_gas_reservations',
        )
      ).rows;
      const day = new Date().toISOString().slice(0, 10),
        today = rows.filter((r) => r.day === day),
        wallet = today.filter((r) => r.owner === owner.toLowerCase());
      const sum = (items: typeof rows) =>
        items.reduce((total, r) => total + BigInt(r.budget_wei), 0n);
      if (
        cost(next) <= 0n ||
        wallet.length >= SELF_SERVE.walletDailyBatches ||
        today.length >= SELF_SERVE.globalDailyBatches ||
        sum(wallet) + cost(next) > BigInt(SELF_SERVE.walletDailyGas) ||
        sum(today) + cost(next) > BigInt(SELF_SERVE.globalDailyGas) ||
        sum(rows) + cost(next) > BigInt(SELF_SERVE.lifetimeGas)
      )
        // An older attempt may have been uncertain. Preserve the unresolved job.
        throw new Error('The fee replacement exceeds the remaining sponsorship budget.');
      await db.query(
        'INSERT INTO selfserve_gas_reservations(job_id,owner,vault,day,budget_wei,gas_limit,max_fee_per_gas,priority_fee) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          `${jobId}:rejected-fee:${randomUUID()}`,
          owner.toLowerCase(),
          vault.toLowerCase(),
          day,
          String(cost(next)),
          next.gasLimit,
          next.maxFeePerGas,
          next.maxPriorityFeePerGas,
        ],
      );
      // Keep the original cost reserved as well as the full new cost. Retries
      // still use the original Circle idempotency key and signed calldata.
      await db.query(
        'UPDATE selfserve_gas_reservations SET max_fee_per_gas=$2,priority_fee=$3 WHERE job_id=$1',
        [jobId, next.maxFeePerGas, next.maxPriorityFeePerGas],
      );
      return next;
    });
  }
}
export const circleFee = (q: GasQuote) => ({
  gasLimit: q.gasLimit,
  maxFee: formatGwei(BigInt(q.maxFeePerGas)),
  priorityFee: formatGwei(BigInt(q.maxPriorityFeePerGas)),
});
