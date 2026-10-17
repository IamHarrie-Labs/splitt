import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { Database } from '../server/src/db/driver';
import { ModelRequestBudget } from '../server/src/agent/model-budget';
let pg: PGlite, db: Database, budget: ModelRequestBudget;
beforeAll(async () => {
  pg = new PGlite();
  db = {
    query: (text, values) => pg.query(text, values),
    transaction: (fn) =>
      pg.transaction((tx) => fn({ query: (text, values) => tx.query(text, values) })),
    close: () => pg.close(),
  };
  budget = await new ModelRequestBudget(db).init();
});
beforeEach(() => pg.exec('TRUNCATE model_request_reservations'));
afterAll(() => db.close());
it('reserves at most eight calls per vault across concurrent requests and repository reopen', async () => {
  const day = new Date('2026-10-17T12:00:00Z');
  const results = await Promise.all(
    Array.from({ length: 12 }, () => budget.reserve('vault-a', 'allocation', day)),
  );
  expect(results.filter(Boolean)).toHaveLength(8);
  const reopened = await new ModelRequestBudget(db).init();
  expect(await reopened.reserve('vault-a', 'payment_note', day)).toBe(false);
  expect(await reopened.reserve('vault-a', 'payment_note', new Date('2026-10-18T12:00:00Z'))).toBe(
    true,
  );
});
it('enforces a global daily limit across different vaults and operation types', async () => {
  const day = new Date('2026-10-17T12:00:00Z');
  for (let i = 0; i < 40; i++)
    expect(await budget.reserve(`vault-${i}`, i % 2 ? 'allocation' : 'payment_note', day)).toBe(
      true,
    );
  expect(await budget.reserve('new-vault', 'allocation', day)).toBe(false);
  expect((await db.query('SELECT * FROM model_request_reservations')).rows).toHaveLength(40);
});
