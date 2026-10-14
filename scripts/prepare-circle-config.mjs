import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const secretFile = new URL('../server/.secrets/circle-entity.json', import.meta.url);
let secret;
try {
  secret = JSON.parse(await readFile(secretFile, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  secret = { entitySecret: randomBytes(32).toString('hex'), registered: false };
  await writeFile(secretFile, JSON.stringify(secret), { flag: 'wx', mode: 0o600 });
}
const owner = JSON.parse(
  await readFile(new URL('../docs/owner-wallet.json', import.meta.url), 'utf8'),
).address;
const config = `SPLITT_MODE=arc-testnet\nSPLITT_STORAGE=postgres\nSPLITT_TESTNET_CONFIRM=arc-testnet\nOWNER_ADDRESS=${owner}\n`;
await writeFile(new URL('../.env.testnet.local', import.meta.url), config, {
  flag: 'wx',
  mode: 0o600,
}).catch((error) => {
  if (error.code !== 'EEXIST') throw error;
});
console.log(
  'Prepared the local Circle entity secret and testnet settings. The secret is NOT registered with Circle yet. No wallet or API key was created.',
);
