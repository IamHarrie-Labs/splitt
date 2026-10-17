import { readFile, writeFile } from 'node:fs/promises';
import { privateKeyToAccount } from 'viem/accounts';
import { parseSiweMessage } from 'viem/siwe';
import type { Hex, Address } from 'viem';
import type { PaymentNoteRecord } from '../server/src/agent/payment-notes.js';
import type { LiveState } from '../server/src/live/repository.js';
if (process.env.SPLITT_ANTHROPIC_SMOKE !== 'controlled-testnet-note')
  throw new Error('Explicit controlled-testnet-note smoke mode required.');
const base = 'http://127.0.0.1:4401',
  origin = 'https://splitt-dun.vercel.app';
const wallets = JSON.parse(
  await readFile(
    new URL('../server/.secrets/selfserve-proof-wallets.json', import.meta.url),
    'utf8',
  ),
);
const owner = privateKeyToAccount(wallets[0].privateKey as Hex);
let cookie = '',
  csrf = '';
async function api(path: string, body?: unknown) {
  const response = await fetch(base + path, {
    headers: {
      origin,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { 'x-splitt-csrf': csrf } : {}),
    },
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Hosted model check returned ${response.status}.`);
  return { result, response };
}
const challenge = (await api('/auth/challenge', { address: owner.address })).result,
  parsed = parseSiweMessage(challenge.message);
if (
  parsed.domain !== new URL(origin).host ||
  parsed.uri !== origin ||
  parsed.chainId !== 5042002 ||
  parsed.nonce !== challenge.nonce ||
  parsed.address?.toLowerCase() !== owner.address.toLowerCase()
)
  throw new Error('Unexpected authentication challenge.');
const verified = await api('/auth/verify', {
  nonce: challenge.nonce,
  signature: await owner.signMessage({ message: challenge.message }),
});
cookie = verified.response.headers.get('set-cookie')?.split(';')[0] ?? '';
csrf = verified.result.csrf;
if (!cookie) throw new Error('No signed-in session.');
try {
  const vaults = (await api('/selfserve/vaults')).result as {
    vault: Address;
    classification: string;
  }[];
  const vault = vaults[0];
  if (vault?.classification !== 'controlled_test')
    throw new Error('Only the builder-controlled proof vault is allowed.');
  const path = `/selfserve/vaults/${vault.vault}`,
    state = (await api(path + '/workspace')).result as LiveState;
  const project = state.projects[0],
    receipt = state.events.find(
      (e) =>
        e.name === 'PaymentReceived' &&
        e.args.amount === '1200000' &&
        e.args.projectId === project.onchainId,
    );
  if (!receipt) throw new Error('Expected historical controlled receipt missing.');
  const note = `${project.invoiceRef}: $1.20 received. The remaining $0.80 comes Friday.`;
  const result = (await api(path + '/payment-notes', { eventId: receipt.id, note }))
    .result as PaymentNoteRecord;
  const after = (await api(path + '/workspace')).result as LiveState;
  if (
    JSON.stringify(state.projects) !== JSON.stringify(after.projects) ||
    JSON.stringify(state.jobs) !== JSON.stringify(after.jobs)
  )
    throw new Error('Financial state changed during note analysis.');
  const report = {
    checkedAt: new Date().toISOString(),
    source: 'controlled_test',
    vault: vault.vault,
    receipt: receipt.txHash,
    status: result.status,
    model: result.model,
    fallbackUsed: result.fallbackUsed,
    modelAttempted: result.modelAttempted,
    modelIssues: result.modelIssues,
    issues: result.issues,
    remainderQuote: result.remainderQuote,
    financialStateUnchanged: true,
    newPaymentSent: false,
    ownerKeyStayedLocal: true,
    publicHttpsConnected: false,
    limitation:
      'A synthetic client note attached to an existing controlled testnet receipt through the private VPS tunnel. Not a business pilot, new payout or browser walkthrough.',
  };
  await writeFile(
    new URL('../docs/anthropic-hosted-note-proof.json', import.meta.url),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
  if (result.status !== 'suggested_match' || result.fallbackUsed) process.exitCode = 1;
} finally {
  await api('/auth/logout', {});
}
