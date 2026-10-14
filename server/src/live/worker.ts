import { randomUUID } from 'node:crypto';
import type { Hex } from 'viem';
import type { LiveRepository, Job } from './repository.js';
import type { ArcGateway } from './chain.js';
import { resolveBatch } from '../reconcile/resolve.js';
export type Operator = {
  submit(callData: Hex, idempotencyKey: string): Promise<string>;
  status(id: string): Promise<{ state?: string; txHash?: string } | undefined>;
};
const terminal = (job: Job) =>
  ['confirmed', 'failed', 'expired', 'invariant_violation'].includes(job.state);
export async function indexReceipts(
  repo: LiveRepository,
  chain: Pick<ArcGateway, 'head' | 'events'>,
) {
  const snapshot = await repo.snapshot();
  const from = BigInt(snapshot.nextBlock),
    head = await chain.head();
  if (from > head) return 0;
  const to = from + 499n < head ? from + 499n : head;
  const events = await chain.events(from, to);
  return repo.transaction((state) => {
    if (state.nextBlock !== snapshot.nextBlock) return 0;
    const known = new Set(state.events.map((e) => e.id));
    state.events.push(...events.filter((e) => !known.has(e.id)));
    state.nextBlock = String(to + 1n);
    return events.length;
  });
}
export async function workerTick(
  repo: LiveRepository,
  chain: Pick<ArcGateway, 'verify' | 'executed' | 'simulate' | 'receipt'>,
  operator: Operator,
  now = Date.now(),
) {
  await chain.verify();
  const leaseToken = randomUUID();
  const job = await repo.transaction((state) => {
    const next = state.jobs.find((j) => !terminal(j) && j.leaseUntil <= now);
    if (!next) return undefined;
    next.leaseUntil = now + 60000;
    next.leaseToken = leaseToken;
    next.attempts++;
    return next;
  });
  if (!job) return;
  const save = (update: (current: Job) => void) =>
    repo.transaction((state) => {
      const current = state.jobs.find((j) => j.id === job.id)!;
      if (current.leaseToken !== leaseToken) return;
      current.leaseUntil = 0;
      update(current);
      if (current.state === 'confirmed') {
        const plan = state.plans.find((p) => p.id === job.id);
        if (plan) plan.status = 'done';
      }
    });
  try {
    const flags = await chain.executed(job.approval.items.map((i) => i.executionId));
    const resolution = resolveBatch(flags, 'UNKNOWN');
    if (resolution === 'confirmed' || resolution === 'invariant_violation') {
      await save((j) => {
        j.state = resolution;
      });
      return;
    }
    if (job.providerId) {
      const status = await operator.status(job.providerId);
      const hash =
        status?.txHash && /^0x[0-9a-fA-F]{64}$/.test(status.txHash)
          ? (status.txHash as Hex)
          : undefined;
      const receipt = hash ? await chain.receipt(hash) : undefined;
      // Read replay flags again after polling: provider state alone cannot prove a payout.
      const freshFlags = await chain.executed(job.approval.items.map((i) => i.executionId));
      const outcome = resolveBatch(freshFlags, status?.state ?? 'UNKNOWN', receipt);
      await save((j) => {
        j.state = outcome === 'unresolved' ? 'pending' : outcome;
        if (hash) j.txHash = hash;
      });
      return;
    }
    if (!job.attempted) {
      if (BigInt(job.approval.message.deadline) <= BigInt(Math.floor(now / 1000))) {
        await save((j) => {
          j.state = 'expired';
        });
        return;
      }
      await chain.simulate(job.approval);
      // Commit intent before contacting Circle. A crash resumes the identical key and calldata.
      await repo.transaction((state) => {
        const j = state.jobs.find((j) => j.id === job.id)!;
        if (j.leaseToken !== leaseToken) throw new Error('Lease lost.');
        j.attempted = true;
        j.state = 'submitting';
      });
    }
    const providerId = await operator.submit(job.callData, job.id);
    await save((j) => {
      j.providerId = providerId;
      j.state = 'pending';
      delete j.lastError;
    });
  } catch {
    // Errors can contain credential headers. Store a safe message instead of raw SDK errors.
    await save((j) => {
      j.lastError = 'Attempt unresolved. Retry uses the same batch and idempotency key.';
      j.leaseUntil = now + 15000;
    });
  }
}
