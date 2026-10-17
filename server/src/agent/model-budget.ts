import type { Database } from '../db/driver.js';
export const MODEL_REQUEST_LIMITS = { perVaultPerDay: 8, globalPerDay: 40 } as const;
/** Reserve before every provider call, including correction requests and failures. */
export class ModelRequestBudget {
  constructor(private db: Database) {}
  async init() {
    await this.db.query(
      `CREATE TABLE IF NOT EXISTS model_request_reservations(id bigserial PRIMARY KEY,vault text NOT NULL,kind text NOT NULL,day date NOT NULL)`,
    );
    return this;
  }
  async reserve(vault: string, kind: 'allocation' | 'payment_note', now = new Date()) {
    return this.db.transaction(async (db) => {
      await db.query(`SELECT pg_advisory_xact_lock(hashtext('splitt-model-request-budget'))`);
      const day = now.toISOString().slice(0, 10);
      const row = (
        await db.query<{ total: string; own: string }>(
          'SELECT count(*)::text AS total,count(*) FILTER(WHERE vault=$1)::text AS own FROM model_request_reservations WHERE day=$2',
          [vault.toLowerCase(), day],
        )
      ).rows[0];
      if (
        Number(row.total) >= MODEL_REQUEST_LIMITS.globalPerDay ||
        Number(row.own) >= MODEL_REQUEST_LIMITS.perVaultPerDay
      )
        return false;
      await db.query('INSERT INTO model_request_reservations(vault,kind,day) VALUES($1,$2,$3)', [
        vault.toLowerCase(),
        kind,
        day,
      ]);
      return true;
    });
  }
}
