import { readFile, writeFile } from 'node:fs/promises';
import { privateKeyToAccount } from 'viem/accounts';
const local = JSON.parse(
  await readFile(new URL('../server/.secrets/owner-wallet.json', import.meta.url), 'utf8'),
);
const account = privateKeyToAccount(local.privateKey);
const headers = { origin: 'http://localhost:3000', 'content-type': 'application/json' };
const base = 'http://127.0.0.1:4000';
async function read(path: string, init: RequestInit = {}) {
  const r = await fetch(base + path, { ...init, headers: { ...headers, ...init.headers } });
  const data = await r.json();
  if (!r.ok) throw new Error(`Testnet API ${path} returned ${r.status}.`);
  return { data, response: r };
}
const health = (await read('/health')).data;
if (health.mode !== 'arc-testnet') throw new Error('Testnet runtime is not enabled.');
const challenge = (
  await read('/auth/challenge', {
    method: 'POST',
    body: JSON.stringify({ address: account.address }),
  })
).data;
const signature = await account.signMessage({ message: challenge.message });
const verified = await read('/auth/verify', {
  method: 'POST',
  body: JSON.stringify({ nonce: challenge.nonce, signature }),
});
const cookie = verified.response.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('Owner session cookie missing.');
const workspace = (await read('/testnet/workspace', { headers: { cookie } })).data;
const northstar = workspace.projects.find((p: { id: string }) => p.id === 'northstar'),
  fieldwork = workspace.projects.find((p: { id: string }) => p.id === 'fieldwork');
if (northstar.balance !== '1200000' || fieldwork.balance !== '1000000')
  throw new Error('Unexpected testnet project balances.');
const readyAt = Math.max(
  ...northstar.commitments.map((c: { activeAfter: number }) => c.activeAfter),
);
const report = {
  checkedAt: new Date().toISOString(),
  mode: health.mode,
  authenticated: true,
  vault: workspace.vault,
  northstarBalance: northstar.balance,
  fieldworkBalance: fieldwork.balance,
  eventsIndexed: workspace.events.length,
  nextBlock: workspace.nextBlock,
  payoutActivationAt: new Date(readyAt * 1000).toISOString(),
};
await read('/auth/logout', {
  method: 'POST',
  body: '{}',
  headers: { cookie, 'x-splitt-csrf': verified.data.csrf },
});
await writeFile(
  new URL('../docs/testnet-api-proof.json', import.meta.url),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
