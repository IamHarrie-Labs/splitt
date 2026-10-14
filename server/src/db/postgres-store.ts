import { createHash } from 'node:crypto';
import type { Project, PlanOutput } from '@splitt/core';
import type { State, StateStore, StoredPlan, LedgerEntry, Payment } from '../store.js';
import type { Database, Queryable } from './driver.js';

// Stable UUIDs let the existing sample identifiers be imported into relational tables.
export function databaseId(id: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    return id;
  const h = createHash('sha256').update(`splitt:${id}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export function databaseFixture(state: State): State {
  if (state.plans.length || state.ledger.length)
    throw new Error('Only fresh fixtures may be seeded.');
  const copy = structuredClone(state);
  for (const p of copy.projects) {
    p.id = databaseId(p.id);
    for (const c of p.commitments) {
      c.id = databaseId(c.id);
      c.projectId = p.id;
      if (c.dependsOn) c.dependsOn = databaseId(c.dependsOn);
    }
  }
  for (const p of copy.payments) {
    p.id = databaseId(p.id);
    if (p.projectId) p.projectId = databaseId(p.projectId);
  }
  return copy;
}
type Row = Record<string, any>;
const iso = (value: string | Date) => new Date(value).toISOString();
const date = (value: string | Date) => iso(value).slice(0, 10);

export class PostgresStore implements StateStore {
  readonly ownerId: string;
  constructor(
    private db: Database,
    private wallet: string,
  ) {
    this.wallet = wallet.toLowerCase();
    this.ownerId = databaseId(`owner:${this.wallet}`);
  }
  async init(seed?: State) {
    await this.db.transaction(async (tx) => {
      await tx.query(
        'INSERT INTO owners(id,wallet_address) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',
        [this.ownerId, this.wallet],
      );
      await tx.query('SELECT id FROM owners WHERE id=$1 FOR UPDATE', [this.ownerId]);
      const current = await this.read(tx);
      if (!current.projects.length && seed)
        await this.save(
          tx,
          { projects: [], plans: [], payments: [], ledger: [] },
          databaseFixture(seed),
        );
    });
    return this;
  }
  snapshot() {
    return this.db.transaction(async (tx) => {
      // Readers and writers share a workspace lock, so multi-table views are consistent.
      await tx.query('SELECT id FROM owners WHERE id=$1 FOR UPDATE', [this.ownerId]);
      return this.read(tx);
    });
  }
  transaction<T>(fn: (state: State) => T): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.query('SELECT id FROM owners WHERE id=$1 FOR UPDATE', [this.ownerId]);
      const prior = await this.read(tx);
      const next = structuredClone(prior);
      const result = fn(next);
      await this.save(tx, prior, next);
      return result;
    });
  }
  private async read(tx: Queryable): Promise<State> {
    const rows = (
      await tx.query<Row>(
        `SELECT p.*, i.reference,i.total_micro,i.received_micro FROM projects p JOIN invoices i ON i.project_id=p.id WHERE p.owner_id=$1 ORDER BY p.created_at,p.id`,
        [this.ownerId],
      )
    ).rows;
    const projects: Project[] = rows.map((p) => ({
      id: p.id,
      onchainId: p.onchain_id,
      name: p.name,
      client: p.client_name,
      clientWallet: p.client_wallet,
      invoiceRef: p.reference,
      invoiceTotal: String(p.total_micro),
      received: String(p.received_micro),
      balance: String(p.balance_micro),
      reserve: String(p.reserve_micro),
      perPayment: String(p.max_per_payment_micro),
      perDay: String(p.max_per_day_micro),
      spentToday: String(p.spent_today_micro),
      version: Number(p.policy_version),
      commitments: [],
      paused: p.paused,
      unresolved: p.unresolved,
      source: p.source,
    }));
    const commitments = (
      await tx.query<Row>(
        'SELECT c.* FROM commitments c JOIN projects p ON p.id=c.project_id WHERE p.owner_id=$1 ORDER BY c.id',
        [this.ownerId],
      )
    ).rows;
    for (const c of commitments)
      projects
        .find((p) => p.id === c.project_id)!
        .commitments.push({
          id: c.id,
          projectId: c.project_id,
          onchainId: c.onchain_id,
          name: c.payee_name,
          role: c.role,
          payee: c.payee_address,
          maximum: String(c.max_micro),
          paid: String(c.paid_micro),
          dueDate: date(c.due_date),
          deferUntil: c.defer_until ? date(c.defer_until) : null,
          accepted: c.work_status === 'accepted',
          acceptedAt: c.accepted_at ? iso(c.accepted_at).slice(0, 10) : '',
          partialAllowed: c.partial_allowed,
          blocksDelivery: c.blocks_next_delivery,
          activeAfter: Number(c.active_after),
          cancelled: c.status === 'cancelled',
          dependsOn: c.depends_on,
        });
    const plans: StoredPlan[] = (
      await tx.query<Row>(
        'SELECT x.* FROM plans x JOIN projects p ON p.id=x.project_id WHERE p.owner_id=$1 ORDER BY x.created_at,x.id',
        [this.ownerId],
      )
    ).rows.map((p) => ({
      id: p.id,
      projectId: p.project_id,
      facts: p.facts_json,
      factsHash: p.facts_hash,
      planHash: p.plan_hash,
      output: p.model_output_json,
      baseline: p.baseline_json as PlanOutput,
      validation: p.validator_report_json,
      fallbackUsed: p.fallback_used,
      model: p.model,
      status: p.status,
      createdAt: iso(p.created_at),
      ...(p.approval_json ? { approval: p.approval_json } : {}),
    }));
    const payments: Payment[] = (
      await tx.query<Row>(
        'SELECT * FROM inbound_payments WHERE owner_id=$1 ORDER BY received_at,id',
        [this.ownerId],
      )
    ).rows.map((p) => ({
      id: p.id,
      projectId: p.project_id,
      invoice: p.invoice_reference,
      payer: p.payer,
      amount: String(p.amount_micro),
      status: p.attribution,
      route: p.route,
      at: iso(p.received_at),
      source: p.source,
    }));
    const ledger: LedgerEntry[] = (
      await tx.query<Row>(
        'SELECT l.* FROM ledger l JOIN projects p ON p.id=l.project_id WHERE p.owner_id=$1 ORDER BY l.id',
        [this.ownerId],
      )
    ).rows.map((l) => ({
      id: l.public_id,
      projectId: l.project_id,
      at: iso(l.ts),
      event: l.event,
      detail: l.payload_json.detail,
      amount: l.payload_json.amount,
      previousHash: l.prev_hash,
      hash: l.hash,
      source: l.payload_json.source,
    }));
    return { projects, plans, payments, ledger };
  }
  private async save(tx: Queryable, prior: State, next: State) {
    // The ledger is append-only. Demo reset is intentionally unavailable on Postgres.
    if (prior.ledger.some((l, i) => JSON.stringify(l) !== JSON.stringify(next.ledger[i])))
      throw new Error('Audit entries cannot be changed or removed.');
    if (prior.projects.some((p) => !next.projects.some((n) => n.id === p.id)))
      throw new Error('Projects cannot be removed.');
    for (const p of next.projects) {
      const written = await tx.query(
        `INSERT INTO projects(id,owner_id,name,client_name,client_wallet,onchain_id,reserve_micro,max_per_payment_micro,max_per_day_micro,policy_version,source,balance_micro,spent_today_micro,paused,unresolved)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,client_name=EXCLUDED.client_name,client_wallet=EXCLUDED.client_wallet,reserve_micro=EXCLUDED.reserve_micro,max_per_payment_micro=EXCLUDED.max_per_payment_micro,max_per_day_micro=EXCLUDED.max_per_day_micro,policy_version=EXCLUDED.policy_version,balance_micro=EXCLUDED.balance_micro,spent_today_micro=EXCLUDED.spent_today_micro,paused=EXCLUDED.paused,unresolved=EXCLUDED.unresolved
        WHERE projects.owner_id=EXCLUDED.owner_id RETURNING id`,
        [
          p.id,
          this.ownerId,
          p.name,
          p.client,
          p.clientWallet,
          p.onchainId,
          p.reserve,
          p.perPayment,
          p.perDay,
          p.version,
          p.source,
          p.balance,
          p.spentToday,
          p.paused,
          p.unresolved,
        ],
      );
      if (written.rows.length !== 1) throw new Error('Project belongs to another owner.');
      await tx.query(
        `INSERT INTO invoices(id,project_id,reference,total_micro,received_micro,due_date,status) VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(project_id,reference) DO UPDATE SET total_micro=EXCLUDED.total_micro,received_micro=EXCLUDED.received_micro,status=EXCLUDED.status`,
        [
          databaseId(`invoice:${p.id}:${p.invoiceRef}`),
          p.id,
          p.invoiceRef,
          p.invoiceTotal,
          p.received,
          '2026-10-03',
          BigInt(p.received) >= BigInt(p.invoiceTotal)
            ? 'paid'
            : p.received === '0'
              ? 'open'
              : 'partial',
        ],
      );
      for (const c of p.commitments)
        await tx.query(
          `INSERT INTO commitments(id,project_id,onchain_id,payee_name,payee_address,max_micro,paid_micro,due_date,defer_until,partial_allowed,work_status,blocks_next_delivery,accepted_at,status,role,active_after)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT(id) DO UPDATE SET paid_micro=EXCLUDED.paid_micro,work_status=EXCLUDED.work_status,accepted_at=EXCLUDED.accepted_at,status=EXCLUDED.status`,
          [
            c.id,
            p.id,
            c.onchainId,
            c.name,
            c.payee,
            c.maximum,
            c.paid,
            c.dueDate,
            c.deferUntil,
            c.partialAllowed,
            c.accepted ? 'accepted' : 'pending',
            c.blocksDelivery,
            c.acceptedAt ? `${c.acceptedAt}T00:00:00.000Z` : null,
            c.cancelled ? 'cancelled' : 'active',
            c.role,
            c.activeAfter,
          ],
        );
    }
    for (const p of next.projects)
      for (const c of p.commitments)
        if (c.dependsOn)
          await tx.query('UPDATE commitments SET depends_on=$2 WHERE id=$1', [c.id, c.dependsOn]);
    for (const p of next.payments)
      await tx.query(
        `INSERT INTO inbound_payments(id,owner_id,project_id,tx_hash,log_index,chain_id,payer,amount_micro,route,attribution,source,invoice_reference,received_at)
      VALUES($1,$2,$3,$4,0,0,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET project_id=EXCLUDED.project_id,attribution=EXCLUDED.attribution,invoice_reference=EXCLUDED.invoice_reference`,
        [
          p.id,
          this.ownerId,
          p.projectId,
          `fixture:${p.id}`,
          p.payer,
          p.amount,
          p.route,
          p.status,
          p.source,
          p.invoice,
          p.at,
        ],
      );
    for (const p of next.plans) {
      await tx.query(
        `INSERT INTO plans(id,project_id,policy_version,facts_json,facts_hash,plan_hash,model,status,model_output_json,validator_report_json,fallback_used,created_at,baseline_json,approval_json,approval_deadline,owner_signature)
        VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13::jsonb,$14::jsonb,$15,$16)
        ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,approval_json=EXCLUDED.approval_json,approval_deadline=EXCLUDED.approval_deadline,owner_signature=EXCLUDED.owner_signature`,
        [
          p.id,
          p.projectId,
          p.facts.projectVersion,
          JSON.stringify(p.facts),
          p.factsHash,
          p.planHash,
          p.model,
          p.status,
          JSON.stringify(p.output),
          JSON.stringify(p.validation),
          p.fallbackUsed,
          p.createdAt,
          JSON.stringify(p.baseline),
          p.approval ? JSON.stringify(p.approval) : null,
          p.approval?.message.deadline ?? null,
          p.approval?.signature ?? null,
        ],
      );
      for (const item of p.output.items)
        await tx.query(
          `INSERT INTO plan_items(id,plan_id,commitment_id,action,amount_micro,reason_codes,fact_refs,explanation,exec_status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending') ON CONFLICT(plan_id,commitment_id) DO NOTHING`,
          [
            databaseId(`${p.id}:${item.commitment_id}`),
            p.id,
            item.commitment_id,
            item.action,
            item.amount_micro,
            item.reason_codes,
            item.fact_refs,
            item.explanation,
          ],
        );
    }
    for (const l of next.ledger.slice(prior.ledger.length))
      await tx.query(
        `INSERT INTO ledger(public_id,ts,project_id,event,payload_json,prev_hash,hash) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)`,
        [
          l.id,
          l.at,
          l.projectId,
          l.event,
          JSON.stringify({ detail: l.detail, amount: l.amount, source: l.source }),
          l.previousHash,
          l.hash,
        ],
      );
  }
}
