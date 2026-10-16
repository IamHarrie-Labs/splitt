import { beforeEach, describe, expect, it, vi } from 'vitest';
import { baselinePlan, idHash } from '@splitt/core';
import { fixtureProjects } from '../server/src/fixtures.js';
import { draftReceipts } from '../server/src/agent/receipt-drafts.js';
import { TestnetService } from '../server/src/live/service.js';
import type { ArcGateway } from '../server/src/live/chain.js';
import type { LiveRepository, LiveState } from '../server/src/live/repository.js';
import { LivePostgresRepository } from '../server/src/live/repository.js';
import { PGlite } from '@electric-sql/pglite';
import type { Database } from '../server/src/db/driver.js';
const address = '0x1111111111111111111111111111111111111111' as const;
let state: LiveState, repo: LiveRepository, service: TestnetService;
const planner = vi.fn(async (facts) => ({
  output: baselinePlan(facts),
  model: 'test',
  fallbackUsed: false,
  attempts: 1,
  correctionCount: 0,
}));
beforeEach(() => {
  planner.mockClear();
  const project = fixtureProjects()[0];
  state = {
    nextBlock: '100',
    projects: [project],
    jobs: [],
    plans: [],
    events: [
      {
        id: 'receipt-1',
        block: '99',
        txHash: idHash('tx'),
        name: 'PaymentReceived',
        args: { projectId: project.onchainId, amount: '1200000000' },
        source: 'arc_testnet',
      },
    ],
  };
  let tail: Promise<unknown> = Promise.resolve();
  repo = {
    snapshot: async () => structuredClone(state),
    transaction: (fn) => {
      const work = tail.then(() => {
        const next = structuredClone(state);
        const result = fn(next);
        state = next;
        return structuredClone(result);
      });
      tail = work.catch(() => undefined);
      return work;
    },
  };
  const chain = {
    verify: async () => {},
    project: async () => ({
      project: structuredClone(state.projects[0]),
      now: new Date('2026-10-03T12:00:00Z'),
      block: '100',
    }),
  } as unknown as ArcGateway;
  service = new TestnetService(repo, chain, address, address, planner);
});
describe('receipt-driven draft worker', () => {
  it('persists completed receipts and notifications across a PostgreSQL repository reopen', async () => {
    const pg = new PGlite();
    const db: Database = {
      query: (text, values) => pg.query(text, values),
      transaction: (fn) =>
        pg.transaction((tx) => fn({ query: (text, values) => tx.query(text, values) })),
      close: () => pg.close(),
    };
    try {
      const stored = await new LivePostgresRepository(db, 'receipt-test').init('1');
      await stored.transaction((s) => Object.assign(s, structuredClone(state)));
      const chain = {
        verify: async () => {},
        project: async () => ({
          project: structuredClone(state.projects[0]),
          now: new Date('2026-10-03T12:00:00Z'),
          block: '100',
        }),
      } as unknown as ArcGateway;
      await draftReceipts(new TestnetService(stored, chain, address, address, planner), 1000);
      const reopened = await new LivePostgresRepository(db, 'receipt-test').init('999');
      await draftReceipts(new TestnetService(reopened, chain, address, address, planner), 2000);
      const persisted = await reopened.snapshot();
      expect(persisted.receiptDrafts?.[0].state).toBe('done');
      expect(persisted.notifications).toHaveLength(1);
      expect(persisted.plans).toHaveLength(1);
      expect(planner).toHaveBeenCalledTimes(1);
    } finally {
      await db.close();
    }
  });
  it('does not store a model result after its worker lease is replaced', async () => {
    planner.mockImplementationOnce(async (facts) => {
      state.receiptDrafts![0].leaseToken = 'replacement-worker';
      return {
        output: baselinePlan(facts),
        model: 'test',
        fallbackUsed: false,
        attempts: 1,
        correctionCount: 0,
      };
    });
    await draftReceipts(service, 1000);
    expect(state.plans).toHaveLength(0);
    expect(state.jobs).toHaveLength(0);
  });
  it('creates a validated draft and one in-app notification without a signing or payment job', async () => {
    await draftReceipts(service, 1000);
    expect(state.plans[0].status).toBe('awaiting_owner');
    expect(state.plans[0].validation.total).toBe('900000000');
    expect(state.plans[0].approval).toBeUndefined();
    expect(state.jobs).toEqual([]);
    expect(state.notifications).toHaveLength(1);
    expect(state.receiptDrafts?.[0].state).toBe('done');
  });
  it('deduplicates replayed receipts and reuses a draft for unchanged facts', async () => {
    await draftReceipts(service, 1000);
    await draftReceipts(service, 2000);
    state.events.push({ ...state.events[0], id: 'receipt-2' });
    await draftReceipts(service, 3000);
    expect(state.plans).toHaveLength(1);
    expect(state.notifications).toHaveLength(1);
    expect(planner).toHaveBeenCalledTimes(1);
  });
  it('leases work so concurrent workers cannot draft the same receipt', async () => {
    await Promise.all([draftReceipts(service, 1000), draftReceipts(service, 1000)]);
    expect(state.plans).toHaveLength(1);
    expect(planner).toHaveBeenCalledTimes(1);
  });
  it('recovers an abandoned lease after a restart', async () => {
    state.receiptDrafts = [
      {
        id: 'receipt-1',
        projectId: 'northstar',
        state: 'working',
        leaseUntil: 100,
        leaseToken: 'dead-worker',
        attempts: 1,
      },
    ];
    await draftReceipts(service, 200);
    expect(state.receiptDrafts[0].state).toBe('done');
    expect(state.receiptDrafts[0].attempts).toBe(2);
  });
  it('does not draft raw transfers or unknown projects', async () => {
    state.events[0].name = 'Transfer';
    state.events.push({
      ...state.events[0],
      id: 'unknown',
      name: 'PaymentReceived',
      args: { projectId: idHash('unknown'), amount: '10' },
    });
    await draftReceipts(service, 1000);
    expect(planner).not.toHaveBeenCalled();
  });
  it('never bypasses unresolved settlement and escalates after bounded retries', async () => {
    state.projects[0].paused = true;
    for (let i = 0; i < 5; i++) await draftReceipts(service, 1_000_000 * (i + 1));
    expect(state.plans).toHaveLength(0);
    expect(state.jobs).toHaveLength(0);
    expect(state.receiptDrafts?.[0].state).toBe('needs_review');
    expect(state.notifications?.[0].kind).toBe('receipt_needs_review');
  });
  it('rejects facts that change while a model is planning', async () => {
    planner.mockImplementationOnce(async (facts) => {
      const output = baselinePlan(facts);
      state.projects[0].balance = '100000000';
      return { output, model: 'test', fallbackUsed: false, attempts: 1, correctionCount: 0 };
    });
    await draftReceipts(service, 1000);
    expect(state.plans).toHaveLength(0);
    expect(state.receiptDrafts?.[0].state).toBe('pending');
  });
});
