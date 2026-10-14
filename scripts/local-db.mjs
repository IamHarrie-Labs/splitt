import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import postgres from 'postgres';
const config = JSON.parse(
  await readFile(new URL('../server/.secrets/local-postgres.json', import.meta.url), 'utf8'),
);
const data = fileURLToPath(new URL('../server/.data/postgres/', import.meta.url));
const log = fileURLToPath(new URL('../server/.data/postgres.log', import.meta.url));
const bin = process.env.PG_BIN_DIR ?? 'C:/Program Files/PostgreSQL/17/bin';
const run = promisify(execFile);
const ctl = (args) =>
  run(path.join(bin, 'pg_ctl.exe'), ['-D', data, ...args], { windowsHide: true, timeout: 45000 });
const command = process.argv[2];
if (command === 'start') {
  await access(path.join(data, 'PG_VERSION'));
  let running = false;
  try {
    await ctl(['status']);
    running = true;
  } catch {}
  if (!running) await ctl(['-l', log, '-o', `-h 127.0.0.1 -p ${config.port}`, '-w', 'start']);
  console.log(`Splitt PostgreSQL is running on 127.0.0.1:${config.port}.`);
} else if (command === 'stop') {
  await ctl(['-m', 'fast', '-w', 'stop']);
  console.log('Stopped the isolated Splitt database.');
} else if (command === 'create') {
  const sql = postgres({
    host: config.host,
    port: config.port,
    username: config.user,
    password: config.password,
    database: 'postgres',
    max: 1,
  });
  try {
    const row = await sql`SELECT current_user AS role, current_setting('port') AS port`;
    if (row[0].role !== 'splitt_owner' || row[0].port !== '55432')
      throw new Error('Unexpected database target.');
    if (!(await sql`SELECT 1 FROM pg_database WHERE datname='splitt'`).length)
      await sql.unsafe('CREATE DATABASE splitt');
    console.log('Splitt database is ready.');
  } finally {
    await sql.end();
  }
} else throw new Error('Use start, stop or create.');
