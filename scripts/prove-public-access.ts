import { readFile, writeFile } from 'node:fs/promises';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { parseSiweMessage } from 'viem/siwe';
import type { Hex } from 'viem';
import type { LiveState } from '../server/src/live/repository.js';

if (process.env.SPLITT_PUBLIC_PROOF !== 'arc-testnet')
  throw new Error('Explicit arc-testnet public proof mode required.');
const origin = 'https://splitt-dun.vercel.app',
  base = origin + '/api';
const stored = JSON.parse(
  await readFile(
    new URL('../server/.secrets/selfserve-proof-wallets.json', import.meta.url),
    'utf8',
  ),
) as { privateKey: Hex }[];
const accounts = stored.slice(0, 2).map((wallet) => privateKeyToAccount(wallet.privateKey));
accounts.push(privateKeyToAccount(generatePrivateKey())); // Unfunded fresh account; authentication only.
async function request(path: string, body?: unknown, cookie = '', csrf = '', from = origin) {
  const response = await fetch(base + path, {
    headers: {
      origin: from,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { 'x-splitt-csrf': csrf } : {}),
    },
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
    redirect: 'error',
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}
const sessions: { cookie: string; csrf: string; vault?: string }[] = [];
const results: object[] = [];
try {
  if ((await request('/selfserve/vaults')).response.status !== 401)
    throw new Error('Anonymous access allowed.');
  if (
    (
      await request(
        '/auth/challenge',
        { address: accounts[0].address },
        '',
        '',
        'https://untrusted.example',
      )
    ).response.status !== 403
  )
    throw new Error('Foreign origin accepted.');
  for (const [index, account] of accounts.entries()) {
    const c = await request('/auth/challenge', { address: account.address });
    if (!c.response.ok) throw new Error(`Challenge failed: ${c.response.status}`);
    const message = parseSiweMessage(c.data.message);
    if (
      message.domain !== new URL(origin).host ||
      message.uri !== origin ||
      message.chainId !== 5042002 ||
      message.nonce !== c.data.nonce ||
      message.address?.toLowerCase() !== account.address.toLowerCase()
    )
      throw new Error('Unexpected SIWE challenge; nothing signed.');
    const signature = await account.signMessage({ message: c.data.message });
    const verified = await request('/auth/verify', { nonce: c.data.nonce, signature });
    const header = verified.response.headers.get('set-cookie') ?? '';
    if (
      !verified.response.ok ||
      !/HttpOnly/i.test(header) ||
      !/Secure/i.test(header) ||
      !/SameSite=Strict/i.test(header) ||
      !/Path=\/api(?:;|$)/i.test(header)
    )
      throw new Error('Public secure session verification failed.');
    const session = {
      cookie: header.split(';')[0],
      csrf: verified.data.csrf,
      vault: undefined as string | undefined,
    };
    sessions.push(session);
    const replay = await request('/auth/verify', { nonce: c.data.nonce, signature });
    if (replay.response.status !== 401) throw new Error('Challenge replay accepted.');
    const list = await request('/selfserve/vaults', undefined, session.cookie);
    if (!list.response.ok || !Array.isArray(list.data))
      throw new Error('Authenticated vault list failed.');
    if (index === 2) {
      if (list.data.length !== 0) throw new Error('Fresh account sees another wallet vault.');
      results.push({
        source: 'fresh_unfunded_authentication_test',
        emptyVaultList: true,
        secureSession: true,
        replayDenied: true,
      });
      continue;
    }
    const vault = list.data[0];
    if (
      vault?.classification !== 'controlled_test' ||
      vault.owner.toLowerCase() !== account.address.toLowerCase()
    )
      throw new Error('Expected owned controlled vault missing.');
    session.vault = vault.vault;
    const snapshot = await request(
      `/selfserve/vaults/${vault.vault}/workspace`,
      undefined,
      session.cookie,
    );
    if (!snapshot.response.ok)
      throw new Error(`Workspace unavailable: ${snapshot.response.status}`);
    const state = snapshot.data as LiveState;
    const denied = await request(
      `/selfserve/vaults/${vault.vault}/receipts/refresh`,
      {},
      session.cookie,
    );
    if (denied.response.status !== 403) throw new Error('Mutation without CSRF accepted.');
    results.push({
      source: 'controlled_test',
      wallet: account.address,
      vault: vault.vault,
      secureSession: true,
      replayDenied: true,
      csrfRequired: true,
      balanceMicro: state.projects[0]?.balance,
      confirmedBatches: state.jobs.filter((job) => job.state === 'confirmed').length,
    });
  }
  for (const [index, session] of sessions.entries()) {
    const foreign = sessions[index === 0 ? 1 : 0].vault!;
    const response = await request(
      `/selfserve/vaults/${foreign}/workspace`,
      undefined,
      session.cookie,
    );
    if (response.response.status !== 404) throw new Error('Cross-wallet vault access allowed.');
  }
  const report = {
    checkedAt: new Date().toISOString(),
    origin,
    publicHttpsApiConnected: true,
    anonymousDenied: true,
    foreignOriginDenied: true,
    crossWalletDenied: true,
    results,
    newPaymentSent: false,
    privateKeysStayedLocal: true,
    browserQaCompleted: false,
    limitation:
      'Real signed HTTP authentication through the public frontend API using two controlled owners and one fresh unfunded account. Existing payout history only; not a browser walkthrough, new payment or business adoption.',
  };
  await writeFile(
    new URL('../docs/public-access-proof.json', import.meta.url),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
} finally {
  for (const session of sessions) await request('/auth/logout', {}, session.cookie, session.csrf);
}
