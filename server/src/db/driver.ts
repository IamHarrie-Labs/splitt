import postgres from 'postgres';

export interface Queryable {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}
export interface Database extends Queryable {
  transaction<T>(fn: (db: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export function connectDatabase(url: string): Database {
  const sql = postgres(url, {
    max: 5,
    transform: { undefined: null },
    // Queryable receives serialized JSON strings, as does the PGlite adapter.
    // postgres.js otherwise serializes them again when the server infers JSONB.
    types: {
      json: {
        to: 114,
        from: [114, 3802],
        serialize: (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value)),
        parse: JSON.parse,
      },
    },
  });
  const wrap = (client: typeof sql | postgres.TransactionSql): Queryable => ({
    async query<T extends Record<string, unknown>>(text: string, values: unknown[] = []) {
      const rows = await client.unsafe(text, values as postgres.ParameterOrJSON<never>[]);
      return { rows: Array.from(rows) as unknown as T[] };
    },
  });
  return {
    ...wrap(sql),
    async transaction<T>(fn: (db: Queryable) => Promise<T>) {
      return (await sql.begin((tx) => fn(wrap(tx)))) as T;
    },
    close: () => sql.end(),
  };
}
