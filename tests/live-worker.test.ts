import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { Database } from '../server/src/db/driver.js';
import { LivePostgresRepository, type Job } from '../server/src/live/repository.js';
import { indexReceipts, workerTick } from '../server/src/live/worker.js';
import { idHash } from '@splitt/core';
let pg: PGlite, db: Database, repo: LivePostgresRepository;
const owner = '0x1111111111111111111111111111111111111111' as const;
const now = 1_800_000_000_000;
const makeJob = (): Job => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  projectId: 'northstar',
  callData: '0x1234',
  state: 'queued',
  attempted: false,
  leaseUntil: 0,
  attempts: 0,
  approval: {
    domain: { name: 'Splitt', version: '1', chainId: 5042002, verifyingContract: owner },
    message: {
      planId: idHash('plan'),
      planHash: idHash('hash'),
      projectId: idHash('northstar'),
      projectVersion: '1',
      deadline: String(now / 1000 + 900),
      itemsHash: idHash('items'),
    },
    items: [
      { executionId: idHash('exec1'), commitmentId: idHash('c1'), amount: '700000000' },
      { executionId: idHash('exec2'), commitmentId: idHash('c2'), amount: '200000000' },
    ],
    signature: `0x${'11'.repeat(65)}`,
  },
});
beforeAll(async () => {
  pg = new PGlite();
  db = {
    query: (text, values) => pg.query(text, values),
    transaction: (fn) =>
      pg.transaction((tx) => fn({ query: (text, values) => tx.query(text, values) })),
    close: () => pg.close(),
  };
  repo = await new LivePostgresRepository(db, 'testnet:test').init('100');
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await repo.transaction((s) => {
    s.jobs = [makeJob()];
    s.events = [];
    s.nextBlock = '100';
  });
});
const gateway = () => ({
  verify: vi.fn(async () => {}),
  executed: vi.fn(async () => [false, false]),
  simulate: vi.fn(async () => {}),
  receipt: vi.fn(async () => undefined),
});
const provider = () => ({
  submit: vi.fn(async () => 'circle-1'),
  status: vi.fn(async () => ({ state: 'COMPLETE' })),
});
describe('durable Arc execution worker', () => {
  it('persists intent before submitting and reopens without changing the batch key', async () => {
    const chain = gateway(),
      circle = provider();
    circle.submit.mockImplementation(async (_data?: unknown, _key?: unknown) => {
      const stored = (await repo.snapshot()).jobs[0];
      expect(stored.attempted).toBe(true);
      expect(stored.state).toBe('submitting');
      return 'circle-1';
    });
    await workerTick(repo, chain, circle, now);
    const reopened = await new LivePostgresRepository(db, 'testnet:test').init('999');
    expect((await reopened.snapshot()).jobs[0].providerId).toBe('circle-1');
    expect(circle.submit).toHaveBeenCalledWith('0x1234', makeJob().id);
  });
  it('recovers a lost submission response with identical calldata and key', async () => {
    const chain = gateway(),
      circle = provider();
    circle.submit.mockRejectedValueOnce(new Error('timeout'));
    await workerTick(repo, chain, circle, now);
    await workerTick(repo, chain, circle, now + 20000);
    expect(circle.submit).toHaveBeenCalledTimes(2);
    expect(circle.submit.mock.calls[0]).toEqual(circle.submit.mock.calls[1]);
    expect(chain.simulate).toHaveBeenCalledTimes(1);
  });
  it('does not treat Circle COMPLETE as proof of payment', async () => {
    const chain = gateway(),
      circle = provider();
    await workerTick(repo, chain, circle, now);
    await workerTick(repo, chain, circle, now + 1000);
    expect((await repo.snapshot()).jobs[0].state).toBe('pending');
    expect(circle.submit).toHaveBeenCalledTimes(1);
  });
  it('confirms replay flags after a missing callback without submitting twice', async () => {
    const chain = gateway(),
      circle = provider();
    await workerTick(repo, chain, circle, now);
    chain.executed.mockResolvedValue([true, true]);
    await workerTick(repo, chain, circle, now + 1000);
    expect((await repo.snapshot()).jobs[0].state).toBe('confirmed');
    expect(circle.submit).toHaveBeenCalledTimes(1);
  });
  it('blocks partial execution as an invariant violation', async () => {
    const chain = gateway(),
      circle = provider();
    chain.executed.mockResolvedValue([true, false]);
    await workerTick(repo, chain, circle, now);
    expect((await repo.snapshot()).jobs[0].state).toBe('invariant_violation');
    expect(circle.submit).not.toHaveBeenCalled();
  });
  it('does not submit an expired authorization for the first time', async () => {
    const chain = gateway(),
      circle = provider();
    await workerTick(repo, chain, circle, now + 901000);
    expect((await repo.snapshot()).jobs[0].state).toBe('expired');
    expect(circle.submit).not.toHaveBeenCalled();
  });
  it('does not create a replacement after a timeout past expiry', async () => {
    await repo.transaction((s) => {
      s.jobs[0].attempted = true;
    });
    const chain = gateway(),
      circle = provider();
    await workerTick(repo, chain, circle, now + 901000);
    expect(circle.submit).toHaveBeenCalledWith('0x1234', makeJob().id);
  });
  it('requires successful simulation before first submission', async () => {
    const chain = gateway(),
      circle = provider();
    chain.simulate.mockRejectedValue(new Error('stale'));
    await workerTick(repo, chain, circle, now);
    expect(circle.submit).not.toHaveBeenCalled();
    expect((await repo.snapshot()).jobs[0].attempted).toBe(false);
  });
  it('leases a batch once across concurrent worker processes', async () => {
    const chain = gateway(),
      circle = provider();
    await Promise.all([workerTick(repo, chain, circle, now), workerTick(repo, chain, circle, now)]);
    expect(circle.submit).toHaveBeenCalledTimes(1);
  });
  it('fails closed when the owner/operator/network check fails', async () => {
    const chain = gateway(),
      circle = provider();
    chain.verify.mockRejectedValue(new Error('wrong network'));
    await expect(workerTick(repo, chain, circle, now)).rejects.toThrow('wrong network');
    expect(circle.submit).not.toHaveBeenCalled();
  });
});
describe('restart-safe receipt index', () => {
  it('stores events and cursor atomically, deduplicates overlap and never attributes a transfer', async () => {
    const event = {
      id: '5042002:tx:0',
      block: '100',
      txHash: idHash('tx'),
      name: 'Transfer',
      args: { value: '1200000000' },
      source: 'arc_testnet' as const,
    };
    const chain = { head: async () => 101n, events: async () => [event] };
    await indexReceipts(repo, chain);
    await repo.transaction((s) => {
      s.nextBlock = '100';
    });
    await indexReceipts(repo, chain);
    const state = await repo.snapshot();
    expect(state.events).toEqual([event]);
    expect(state.nextBlock).toBe('102');
    expect(state.projects).toHaveLength(0);
  });
  it('does not advance the cursor when RPC fails', async () => {
    const chain = {
      head: async () => 200n,
      events: async () => {
        throw new Error('rpc');
      },
    };
    await expect(indexReceipts(repo, chain)).rejects.toThrow('rpc');
    expect((await repo.snapshot()).nextBlock).toBe('100');
  });
});
