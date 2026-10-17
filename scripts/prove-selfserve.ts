import { readFile, writeFile } from 'node:fs/promises';
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  erc20Abi,
  keccak256,
  parseEther,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { parseSiweMessage } from 'viem/siwe';
import { idHash } from '@splitt/core';
import { arc, vaultAbi, USDC } from '../server/src/live/chain.js';
import { vaultCreation } from '../packages/core/src/selfserve.js';
import { approvalTypedData } from '../server/src/approvals.js';
import type { BatchApproval } from '../server/src/store.js';
import type { LiveState } from '../server/src/live/repository.js';
if (process.env.SPLITT_SELF_SERVE_PROOF !== 'arc-testnet')
  throw new Error(
    'Set SPLITT_SELF_SERVE_PROOF=arc-testnet for this controlled testnet-only proof.',
  );
const mode = process.argv[2];
if (!['setup', 'settle'].includes(mode)) throw new Error('Choose setup or settle.');
const base = process.env.SPLITT_SMOKE_URL ?? 'http://127.0.0.1:4401',
  origin = 'https://splitt-dun.vercel.app';
if (base !== 'http://127.0.0.1:4401')
  throw new Error('This reviewed proof uses only the private VPS SSH tunnel.');
const client = createPublicClient({
  chain: arc,
  transport: http(process.env.ARC_RPC_URL ?? arc.rpcUrls.default.http[0]),
});
if ((await client.getChainId()) !== 5042002) throw new Error('Only Arc Testnet is allowed.');
const files = new URL('../server/.secrets/', import.meta.url);
const wallets = JSON.parse(
  await readFile(new URL('selfserve-proof-wallets.json', files), 'utf8'),
) as { address: Address; privateKey: Hex }[];
const accounts = wallets.map((w) => privateKeyToAccount(w.privateKey));
const funding = privateKeyToAccount(
  JSON.parse(await readFile(new URL('owner-wallet.json', files), 'utf8')).privateKey,
);
const payees = JSON.parse(
  await readFile(new URL('../docs/testnet-projects.json', import.meta.url), 'utf8'),
)[0].commitments.map((c: { payee: Address }) => c.payee) as Address[];
const journalFile = new URL('selfserve-proof-journal.json', files);
type Journal = {
  transactions: Record<string, { raw: Hex; hash: Hex }>;
  vaults: Record<string, Address>;
  plans: Record<string, string>;
  evidence: Record<string, unknown>;
};
let journal: Journal = { transactions: {}, vaults: {}, plans: {}, evidence: {} };
try {
  journal = JSON.parse(await readFile(journalFile, 'utf8'));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
}
const save = () => writeFile(journalFile, JSON.stringify(journal), { mode: 0o600 });
async function transact(
  account: PrivateKeyAccount,
  key: string,
  to: Address | undefined,
  data: Hex = '0x',
  value = 0n,
) {
  let signed = journal.transactions[key];
  if (!signed) {
    const signer = createWalletClient({ account, chain: arc, transport: http() });
    const request = await signer.prepareTransactionRequest({ account, to, data, value });
    const raw = await signer.signTransaction(request);
    signed = { raw, hash: keccak256(raw) };
    journal.transactions[key] = signed;
    await save();
  }
  let receipt = await client.getTransactionReceipt({ hash: signed.hash }).catch(() => undefined);
  if (!receipt) {
    try {
      await client.sendRawTransaction({ serializedTransaction: signed.raw });
    } catch {
      const exists = await client.getTransaction({ hash: signed.hash }).catch(() => undefined);
      if (!exists)
        throw new Error(
          `Submission uncertain for ${key}; resume the same journal, never create another intent.`,
        );
    }
    receipt = await client.waitForTransactionReceipt({ hash: signed.hash, timeout: 60000 });
  }
  if (receipt.status !== 'success')
    throw new Error(`Controlled transaction reverted: ${key}, ${signed.hash}.`);
  console.log(JSON.stringify({ step: key, hash: signed.hash }));
  return receipt;
}
async function request(
  path: string,
  body?: unknown,
  cookie = '',
  csrf = '',
  attempt = 0,
): Promise<{ data: any; response: Response }> {
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
  const data = await response.json();
  if (body === undefined && [429, 500, 503].includes(response.status) && attempt < 3) {
    await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
    return request(path, body, cookie, csrf, attempt + 1);
  }
  if (!response.ok)
    throw new Error(
      `Proof API ${path} returned ${response.status}: ${data.message ?? 'request rejected'}`,
    );
  return { data, response };
}
const config = (await request('/selfserve/config')).data;
if (config.chainId !== 5042002) throw new Error('Wrong API network.');
async function login(account: PrivateKeyAccount) {
  const challenge = (await request('/auth/challenge', { address: account.address })).data,
    parsed = parseSiweMessage(challenge.message);
  if (
    parsed.domain !== new URL(origin).host ||
    parsed.chainId !== 5042002 ||
    parsed.nonce !== challenge.nonce ||
    parsed.address?.toLowerCase() !== account.address.toLowerCase()
  )
    throw new Error('Unexpected authentication challenge.');
  const result = await request('/auth/verify', {
    nonce: challenge.nonce,
    signature: await account.signMessage({ message: challenge.message }),
  });
  const cookie = result.response.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Missing owner session.');
  return {
    api: async (path: string, body?: unknown) =>
      (await request(path, body, cookie, result.data.csrf)).data,
    logout: () => request('/auth/logout', {}, cookie, result.data.csrf),
  };
}
type Workspace = LiveState & { vault: Address; owner: Address };
function metadata(account: PrivateKeyAccount, index: number) {
  const id = `selfserve-proof-${account.address.slice(2).toLowerCase()}`,
    date = new Date().toISOString().slice(0, 10);
  return {
    id,
    onchainId: idHash(id),
    name: `Controlled self-serve test ${index + 1}`,
    client: 'Builder-owned test wallet',
    clientWallet: account.address,
    invoiceRef: `SS-${account.address.slice(2, 10)}`,
    invoiceTotal: '2000000',
    commitments: payees.map((payee, i) => ({
      id: `${id}:${i}`,
      onchainId: idHash(`${id}:${i}`),
      name: `Controlled recipient ${i + 1}`,
      role: 'Test contractor',
      payee,
      maximum: i === 0 ? '700000' : '500000',
      dueDate: date,
      deferUntil: null,
      accepted: true,
      acceptedAt: date,
      blocksDelivery: i === 0,
      partialAllowed: i === 1,
      dependsOn: null,
    })),
  };
}
if (mode === 'setup') {
  const remaining = accounts.filter((a) => !journal.transactions[`fund:${a.address}`]).length;
  if (
    (await client.getBalance({ address: funding.address })) <
    parseEther(String(remaining * 3)) + parseEther('0.5')
  )
    throw new Error(
      'Insufficient existing Arc test USDC for the reviewed funding and gas reserve.',
    );
  for (const [index, account] of accounts.entries()) {
    await transact(funding, `fund:${account.address}`, account.address, '0x', parseEther('3'));
    const deployed = await transact(
      account,
      `deploy:${account.address}`,
      undefined,
      vaultCreation(account.address, config.operator),
    );
    if (!deployed.contractAddress) throw new Error('Vault deployment missing.');
    journal.vaults[account.address] = deployed.contractAddress;
    await save();
    const session = await login(account);
    try {
      const registered = await session.api('/selfserve/vaults');
      if (!registered.length)
        await session.api('/selfserve/vaults', { transactionHash: deployed.transactionHash });
      const vault = deployed.contractAddress,
        p = metadata(account, index);
      await transact(
        account,
        `project:${account.address}`,
        vault,
        encodeFunctionData({
          abi: vaultAbi,
          functionName: 'createProject',
          args: [p.onchainId, 300000n, 5000000n, 10000000n],
        }),
      );
      for (const c of p.commitments)
        await transact(
          account,
          `commitment:${c.id}`,
          vault,
          encodeFunctionData({
            abi: vaultAbi,
            functionName: 'addCommitment',
            args: [c.onchainId, p.onchainId, c.payee, BigInt(c.maximum), c.partialAllowed],
          }),
        );
      const workspace = (await session.api(`/selfserve/vaults/${vault}/workspace`)) as Workspace;
      if (!workspace.projects.length) await session.api(`/selfserve/vaults/${vault}/projects`, p);
      const fresh = (await session.api(`/selfserve/vaults/${vault}/workspace`)) as Workspace;
      journal.evidence[`activation:${account.address}`] = Math.max(
        ...fresh.projects[0].commitments.map((c) => c.activeAfter),
      );
      await save();
      console.log(
        JSON.stringify({
          owner: account.address,
          vault,
          activationAt: new Date(
            Number(journal.evidence[`activation:${account.address}`]) * 1000,
          ).toISOString(),
        }),
      );
    } finally {
      await session.logout();
    }
  }
} else {
  const latest = Math.max(
    ...accounts.map((a) => Number(journal.evidence[`activation:${a.address}`] ?? Infinity)),
  );
  if (Date.now() / 1000 < latest)
    throw new Error(
      `Recipient activation is still enforced until ${new Date(latest * 1000).toISOString()}. No deposit or payout submitted.`,
    );
  async function stage(account: PrivateKeyAccount, index: number, remainder = false) {
    const session = await login(account),
      vault = journal.vaults[account.address],
      p = metadata(account, index),
      tag = `${account.address}:${remainder ? 'remainder' : 'first'}`,
      amount = remainder ? 800000n : 1200000n;
    try {
      const completed = journal.evidence[tag] as { payoutHash?: Hex } | undefined;
      if (completed?.payoutHash) {
        const confirmed = await client.getTransactionReceipt({ hash: completed.payoutHash });
        if (confirmed.status !== 'success' || confirmed.to?.toLowerCase() !== vault.toLowerCase())
          throw new Error('Prior proof payout no longer matches its vault.');
        console.log(JSON.stringify({ stage: tag, resumedConfirmed: completed.payoutHash }));
        return;
      }
      const receipt = await transact(
        account,
        `approve:${tag}`,
        USDC,
        encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [vault, amount] }),
      );
      const deposited = await transact(
        account,
        `deposit:${tag}`,
        vault,
        encodeFunctionData({
          abi: vaultAbi,
          functionName: 'deposit',
          args: [p.onchainId, idHash(p.invoiceRef), amount],
        }),
      );
      let workspace: Workspace | undefined;
      let plan = undefined as LiveState['plans'][number] | undefined;
      for (let i = 0; i < 12; i++) {
        workspace = (await session.api(`/selfserve/vaults/${vault}/workspace`)) as Workspace;
        const task = workspace.receiptDrafts?.find(
          (t) => t.id.includes(deposited.transactionHash) && t.state === 'done',
        );
        plan = task && workspace.plans.find((p) => p.id === task.planId);
        if (plan && workspace.jobs.find((j) => j.id === plan!.id)?.state !== 'expired') break;
        plan = undefined;
        await new Promise((r) => setTimeout(r, 5000));
      }
      if (
        !plan ||
        (plan.status !== 'awaiting_owner' && !workspace!.jobs.some((j) => j.id === plan!.id))
      )
        throw new Error('No automatic payable draft yet. Resume without another deposit.');
      const expected = remainder ? ['0', '300000'] : ['700000', '200000'];
      if (plan.output.items.map((i) => i.amount_micro).join(',') !== expected.join(','))
        throw new Error('Allocation differs from the reviewed controlled case. Nothing signed.');
      journal.plans[tag] = plan.id;
      await save();
      if (!workspace!.jobs.some((j) => j.id === plan!.id)) {
        const { approval } = (await session.api(
          `/selfserve/vaults/${vault}/plans/${plan.id}/prepare`,
          {},
        )) as { approval: BatchApproval };
        if (approval.domain.verifyingContract.toLowerCase() !== vault.toLowerCase())
          throw new Error('Wrong vault authorization.');
        await session.api(`/selfserve/vaults/${vault}/plans/${plan.id}/submit`, {
          signature: await account.signTypedData(approvalTypedData(approval)),
        });
      }
      let job = undefined as LiveState['jobs'][number] | undefined;
      for (let i = 0; i < 12; i++) {
        workspace = (await session.api(`/selfserve/vaults/${vault}/workspace`)) as Workspace;
        job = workspace.jobs.find((j) => j.id === plan!.id);
        if (job?.state === 'confirmed' && job.txHash) break;
        if (job?.state === 'failed' || job?.state === 'invariant_violation')
          throw new Error(`Controlled payout ${job.state}: ${job.lastError}`);
        await new Promise((r) => setTimeout(r, 5000));
      }
      if (job?.state !== 'confirmed' || !job.txHash)
        throw new Error('Payout unresolved. Resume the existing job and journal.');
      const paidReceipt = await client.getTransactionReceipt({ hash: job.txHash as Hex });
      if (
        paidReceipt.status !== 'success' ||
        paidReceipt.to?.toLowerCase() !== vault.toLowerCase() ||
        paidReceipt.from.toLowerCase() !== config.operator.toLowerCase()
      )
        throw new Error(
          'The payout receipt does not match the registered vault and Circle operator.',
        );
      journal.evidence[tag] = {
        vault,
        owner: account.address,
        depositHash: deposited.transactionHash,
        planId: plan.id,
        receiptTrigger: true,
        model: plan.model,
        fallbackUsed: plan.fallbackUsed,
        validationPassed: plan.validation.ok,
        payoutHash: job.txHash,
        projectBalance: workspace!.projects[0].balance,
        payments: plan.output.items.map((i) => ({
          commitmentId: i.commitment_id,
          amount: i.amount_micro,
        })),
      };
      await save();
      console.log(
        JSON.stringify({ stage: tag, payout: job.txHash, balance: workspace!.projects[0].balance }),
      );
    } finally {
      await session.logout();
    }
  }
  for (const [i, account] of accounts.entries()) await stage(account, i);
  await stage(accounts[0], 0, true);
  const finalBalances: string[] = [];
  for (const account of accounts) {
    const session = await login(account);
    try {
      const own = (await session.api(
        `/selfserve/vaults/${journal.vaults[account.address]}/workspace`,
      )) as Workspace;
      finalBalances.push(own.projects[0].balance);
      const foreign = journal.vaults[accounts.find((a) => a.address !== account.address)!.address];
      let denied = false;
      try {
        await session.api(`/selfserve/vaults/${foreign}/workspace`);
      } catch (e) {
        denied = String(e).includes('404');
      }
      if (!denied) throw new Error('Cross-wallet isolation check failed.');
    } finally {
      await session.logout();
    }
  }
  if (finalBalances.join(',') !== '800000,300000')
    throw new Error('Unexpected final project balances or cross-vault isolation.');
  const report = {
    checkedAt: new Date().toISOString(),
    chainId: 5042002,
    classification: 'controlled_test',
    freshWallets: 2,
    realBusinesses: 0,
    realCustomerVolume: '0',
    maximumInitialFundingUsdc: '6',
    finalProjectBalances: finalBalances,
    crossWalletAccessDenied: true,
    setupIntervention:
      'The first vault metadata was registered through the same deployed TestnetService during diagnosis of API failures. The second vault used the authenticated HTTP registration flow. This report is API/chain evidence, not an uninterrupted browser walkthrough.',
    evidence: journal.evidence,
    limitation:
      'API and chain execution proof through a private SSH tunnel. Not a browser interaction recording, public HTTPS proof or business adoption.',
  };
  await writeFile(
    new URL('../docs/selfserve-testnet-proof.json', import.meta.url),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify({ complete: true, freshWallets: 2, realBusinesses: 0 }));
}
