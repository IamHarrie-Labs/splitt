import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before running migrations.');
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  await sql.unsafe(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  await sql.unsafe(await readFile(new URL('./runtime.sql', import.meta.url), 'utf8'));
  console.log('Postgres schema applied.');
} finally {
  await sql.end();
}
