import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const secrets = new URL('../server/.secrets/', import.meta.url);
await mkdir(secrets, { recursive: true });
const configFile = new URL('local-postgres.json', secrets);
let config;
try {
  config = JSON.parse(await readFile(configFile, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  config = {
    user: 'splitt_owner',
    password: randomBytes(32).toString('hex'),
    host: '127.0.0.1',
    port: 55432,
    database: 'splitt',
  };
  await writeFile(configFile, JSON.stringify(config), { flag: 'wx', mode: 0o600 });
}
await writeFile(new URL('postgres-password.txt', secrets), config.password, { mode: 0o600 });
const file = new URL('../.env', import.meta.url);
let contents;
try {
  contents = await readFile(file, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  contents = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
}
const value = `postgres://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`;
contents = /^DATABASE_URL=.*$/m.test(contents)
  ? contents.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${value}`)
  : contents + `\nDATABASE_URL=${value}\n`;
await writeFile(file, contents, { mode: 0o600 });
console.log(
  'Configured local database credentials in ignored files. Credentials were not displayed.',
);
