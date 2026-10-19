import type { Database } from '../db/driver.js';
import type { Project } from '@splitt/core';
import type { StoredPlan, BatchApproval } from '../store.js';
export type ChainEvent = {
  id: string;
  block: string;
  txHash: string;
  name: string;
  args: Record<string, string>;
  source: 'arc_testnet' | 'arc_mainnet';
};
export type Job = {
  id: string;
  projectId: string;
  approval: BatchApproval;
  callData: `0x${string}`;
  state:
    | 'queued'
    | 'submitting'
    | 'pending'
    | 'confirmed'
    | 'failed'
    | 'expired'
    | 'invariant_violation';
  providerId?: string;
  txHash?: string;
  attempted: boolean;
  leaseUntil: number;
  leaseToken?: string;
  attempts: number;
  lastError?: string;
};
export type LiveState = {
  nextBlock: string;
  events: ChainEvent[];
  projects: Project[];
  plans: StoredPlan[];
  jobs: Job[];
  receiptDrafts?: ReceiptDraft[];
  notifications?: OwnerNotification[];
  paymentNotes?: import('../agent/payment-notes.js').PaymentNoteRecord[];
  bridgeIntents?: import('../../../packages/core/src/cctp.js').BridgeIntent[];
};
export type ReceiptDraft = {
  id: string;
  projectId: string;
  state: 'pending' | 'working' | 'done' | 'needs_review';
  attempts: number;
  leaseUntil: number;
  leaseToken?: string;
  planId?: string;
  lastError?: string;
};
export type OwnerNotification = {
  id: string;
  projectId: string;
  planId?: string;
  kind: 'draft_ready' | 'receipt_needs_review' | 'receipt_no_action';
  message: string;
  createdAt: string;
  readAt?: string;
};
export interface LiveRepository {
  snapshot(): Promise<LiveState>;
  transaction<T>(fn: (state: LiveState) => T): Promise<T>;
}
export class LivePostgresRepository implements LiveRepository {
  constructor(
    private db: Database,
    private key: string,
  ) {}
  async init(deploymentBlock: string) {
    await this.db.query(
      `CREATE TABLE IF NOT EXISTS arc_workspaces (scope text PRIMARY KEY, state jsonb NOT NULL)`,
    );
    await this.db.query(
      'INSERT INTO arc_workspaces(scope,state) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING',
      [
        this.key,
        JSON.stringify({
          nextBlock: deploymentBlock,
          events: [],
          projects: [],
          plans: [],
          jobs: [],
        }),
      ],
    );
    return this;
  }
  async snapshot() {
    const result = await this.db.query<{ state: LiveState }>(
      'SELECT state FROM arc_workspaces WHERE scope=$1',
      [this.key],
    );
    if (!result.rows[0]) throw new Error('Testnet workspace is not initialized.');
    return structuredClone(result.rows[0].state);
  }
  async transaction<T>(fn: (state: LiveState) => T) {
    return this.db.transaction(async (db) => {
      const result = await db.query<{ state: LiveState }>(
        'SELECT state FROM arc_workspaces WHERE scope=$1 FOR UPDATE',
        [this.key],
      );
      if (!result.rows[0]) throw new Error('Testnet workspace is not initialized.');
      const state = structuredClone(result.rows[0].state);
      const value = fn(state);
      await db.query('UPDATE arc_workspaces SET state=$2::jsonb WHERE scope=$1', [
        this.key,
        JSON.stringify(state),
      ]);
      return structuredClone(value);
    });
  }
}
