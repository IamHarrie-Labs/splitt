import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
const root = new URL('../', import.meta.url);
const values = {
  ...parseEnv(await readFile(new URL('.env', root), 'utf8')),
  ...parseEnv(await readFile(new URL('.env.testnet.local', root), 'utf8')),
};
const required = [
  'CIRCLE_API_KEY',
  'CIRCLE_ENTITY_SECRET',
  'CIRCLE_WALLET_ID',
  'OWNER_ADDRESS',
  'VAULT_ADDRESS',
  'OPERATOR_ADDRESS',
  'VAULT_DEPLOYMENT_BLOCK',
];
if (required.some((key) => !values[key]))
  throw new Error('Missing required local testnet configuration; no deployment file written.');
const allowed = [...required, 'ARC_RPC_URL'];
const config = {
  POSTGRES_PASSWORD: randomBytes(32).toString('hex'),
  SPLITT_API_DOMAIN: 'pending.invalid',
  WEB_ORIGIN: 'https://splitt-dun.vercel.app',
  BASE_SEPOLIA_RPC_URL: 'https://sepolia.base.org',
  ...Object.fromEntries(allowed.filter((key) => values[key]).map((key) => [key, values[key]])),
};
if (Object.values(config).some((v) => /[\r\n]/.test(v)))
  throw new Error('Invalid multiline configuration.');
await mkdir(new URL('server/.secrets/', root), { recursive: true });
await writeFile(
  new URL('server/.secrets/vps.env', root),
  Object.entries(config)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n',
  { mode: 0o600, flag: 'wx' },
);
console.log(
  'Prepared private VPS configuration with required TEST operator credentials. No owner signing key or model token.',
);
