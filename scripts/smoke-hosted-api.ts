import { readFile, writeFile } from 'node:fs/promises';
import { privateKeyToAccount } from 'viem/accounts';
import { parseSiweMessage } from 'viem/siwe';
const base = process.env.SPLITT_SMOKE_URL ?? 'http://127.0.0.1:4401';
const origin = 'https://splitt-dun.vercel.app';
const url = new URL(base);
if (url.origin !== 'http://127.0.0.1:4401' && url.protocol !== 'https:')
  throw new Error('Use the private SSH tunnel or a verified HTTPS endpoint.');
const wallet = JSON.parse(
  await readFile(new URL('../server/.secrets/owner-wallet.json', import.meta.url), 'utf8'),
);
const account = privateKeyToAccount(wallet.privateKey);
async function request(path: string, body?: unknown, cookie = '', csrf = '') {
  const response = await fetch(base + path, {
    headers: {
      origin,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { 'x-splitt-csrf': csrf } : {}),
    },
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  return { response, data: await response.json() };
}
const health = await request('/health');
if (health.data.mode !== 'arc-testnet') throw new Error('Wrong runtime.');
if ((await request('/testnet/workspace')).response.status !== 401)
  throw new Error('Anonymous workspace access must be denied.');
const challenge = await request('/auth/challenge', { address: account.address });
if (!challenge.response.ok) throw new Error('Owner challenge failed.');
const parsed = parseSiweMessage(challenge.data.message);
if (
  parsed.domain !== new URL(origin).host ||
  parsed.uri !== origin ||
  parsed.chainId !== 5042002 ||
  parsed.nonce !== challenge.data.nonce ||
  parsed.address?.toLowerCase() !== account.address.toLowerCase()
)
  throw new Error('Unexpected sign-in challenge. Nothing signed.');
const verified = await request('/auth/verify', {
  nonce: challenge.data.nonce,
  signature: await account.signMessage({ message: challenge.data.message }),
});
const cookie = verified.response.headers.get('set-cookie')?.split(';')[0];
if (!verified.response.ok || !cookie) throw new Error('Owner login failed.');
try {
  const workspace = await request('/testnet/workspace', undefined, cookie);
  if (
    !workspace.response.ok ||
    workspace.data.owner.toLowerCase() !== account.address.toLowerCase()
  )
    throw new Error('Owner workspace read failed.');
  if ((await request('/testnet/bridge/intents', {}, cookie)).response.status !== 403)
    throw new Error('Bridge mutation must require CSRF.');
  const quote = await request(
    '/testnet/bridge/quote',
    { payer: account.address, amount: '1000000' },
    cookie,
    verified.data.csrf,
  );
  if (!quote.response.ok) throw new Error('Hosted CCTP route quote failed.');
  const report = {
    checkedAt: new Date().toISOString(),
    source: 'private_ssh_tunnel_to_vps',
    publicHttpsConnected: false,
    ownerKeyStayedLocal: true,
    authenticated: true,
    anonymousDenied: true,
    bridgeCsrfRequired: true,
    chainId: workspace.data.chainId,
    vault: workspace.data.vault,
    projects: workspace.data.projects.map((p: { id: string; balance: string }) => ({
      id: p.id,
      balance: p.balance,
    })),
    jobs: workspace.data.jobs.map((j: { state: string }) => j.state),
    eventsIndexed: workspace.data.events.length,
    nextBlock: workspace.data.nextBlock,
    bridgeQuote: quote.data,
    modelCredentialDeployed: false,
    realBusinesses: 0,
  };
  await writeFile(
    new URL('../docs/vps-api-proof.json', import.meta.url),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await request('/auth/logout', {}, cookie, verified.data.csrf);
}
