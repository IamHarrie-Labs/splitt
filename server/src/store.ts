import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { hashJson, type Facts, type PlanOutput, type Project, type Validation } from '@splitt/core';
import { fixtureProjects } from './fixtures.js';
export type StoredPlan = {
  id: string;
  projectId: string;
  facts: Facts;
  factsHash: string;
  planHash: string;
  output: PlanOutput;
  baseline: PlanOutput;
  validation: Validation;
  fallbackUsed: boolean;
  model: string;
  status: 'awaiting_owner' | 'done' | 'unresolved' | 'stale' | 'no_action';
  createdAt: string;
  approval?: BatchApproval;
};
export type BatchApproval = {
  domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` };
  message: {
    planId: `0x${string}`;
    planHash: `0x${string}`;
    projectId: `0x${string}`;
    projectVersion: string;
    deadline: string;
    itemsHash: `0x${string}`;
  };
  items: { executionId: `0x${string}`; commitmentId: `0x${string}`; amount: string }[];
  signature?: `0x${string}`;
  signedAt?: string;
  /** Safe owner signatures collected so far, keyed by lowercase signer address. */
  cosignatures?: Record<string, `0x${string}`>;
};
export type LedgerEntry = {
  id: string;
  projectId: string;
  at: string;
  event: string;
  detail: string;
  amount: string;
  previousHash: string;
  hash: string;
  source: 'fixture';
};
export type Payment = {
  id: string;
  projectId: string | null;
  invoice: string;
  payer: string;
  amount: string;
  status: 'confirmed' | 'ambiguous' | 'rejected';
  route: 'deposit' | 'transfer';
  at: string;
  source: 'fixture';
};
export type State = {
  projects: Project[];
  plans: StoredPlan[];
  payments: Payment[];
  ledger: LedgerEntry[];
};
export interface StateStore {
  snapshot(): State | Promise<State>;
  transaction<T>(fn: (state: State) => T): Promise<T>;
}
export const demoNow = () => new Date('2026-10-03T12:00:00.000Z');
export function initialState(): State {
  return {
    projects: fixtureProjects(),
    plans: [],
    payments: [
      {
        id: 'fixture-inbound-1',
        projectId: 'northstar',
        invoice: 'NS-2026-041',
        payer: fixtureProjects()[0].clientWallet,
        amount: '1200000000',
        status: 'confirmed',
        route: 'deposit',
        at: '2026-10-03T09:42:00.000Z',
        source: 'fixture',
      },
    ],
    ledger: [],
  };
}
export function appendLedger(
  state: State,
  projectId: string,
  event: string,
  detail: string,
  amount = '0',
) {
  const entry = {
    id: randomUUID(),
    projectId,
    at: new Date().toISOString(),
    event,
    detail,
    amount,
    previousHash: state.ledger.at(-1)?.hash ?? '0x' + '0'.repeat(64),
    source: 'fixture' as const,
  };
  state.ledger.push({ ...entry, hash: hashJson(entry) });
}
export class FixtureStore {
  private state = initialState();
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private file?: string) {}
  async init() {
    if (this.file) {
      try {
        this.state = JSON.parse(await readFile(this.file, 'utf8'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        await this.persist();
      }
    }
    return this;
  }
  snapshot() {
    return structuredClone(this.state);
  }
  async transaction<T>(fn: (state: State) => T): Promise<T> {
    const work = this.tail.then(async () => {
      const next = this.snapshot();
      const result = fn(next);
      await this.persist(next);
      this.state = next;
      return structuredClone(result);
    });
    this.tail = work.catch(() => undefined);
    return work;
  }
  private async persist(state = this.state) {
    if (!this.file) return;
    const file = resolve(this.file);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file + '.tmp', JSON.stringify(state, null, 2));
    await rename(file + '.tmp', file);
  }
}
