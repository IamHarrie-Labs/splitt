import { readFile, writeFile } from 'node:fs/promises';
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  erc20Abi,
  keccak256,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { parseSiweMessage } from 'viem/siwe';
import { idHash } from '@splitt/core';
import { arc, USDC, vaultAbi } from '../server/src/live/chain.js';
import { approvalTypedData } from '../server/src/approvals.js';
import type { BatchApproval } from '../server/src/store.js';
import type { LiveState } from '../server/src/live/repository.js';
import { assertPayoutMatchesReview } from '../web/app/start/payout-review.js';
import { vaultCreation } from '../packages/core/src/selfserve.js';

if (process.env.SPLITT_PUBLIC_PAYMENT_PROOF !== 'controlled-arc-testnet')
  throw new Error('Explicit controlled Arc Testnet proof mode required.');
const origin = 'https://www.usesplitt.xyz',
  base = origin + '/api';
const fresh = process.argv.includes('--fresh-vault');
let vault = '0x202a98767c9260f327e3e1905df9eede7a4b591c' as Address;
const operator = '0xd0c362f85bd5452246999a53639c6c9ac0437063';
const keys = JSON.parse(
  await readFile(
    new URL('../server/.secrets/selfserve-proof-wallets.json', import.meta.url),
    'utf8',
  ),
);
const owner = privateKeyToAccount(
  fresh
    ? JSON.parse(
        await readFile(new URL('../server/.secrets/owner-wallet.json', import.meta.url), 'utf8'),
      ).privateKey
    : (keys[1].privateKey as Hex),
);
if (
  owner.address.toLowerCase() !==
  (fresh
    ? '0x8be0633d4fd1e8828338d4bc779ddb7dd2121fd1'
    : '0xe6fba1b21a6ed911f8d4c7c2612ab20f9bc1f65a')
)
  throw new Error('Only the specifically authorized controlled owners are allowed.');
const client = createPublicClient({ chain: arc, transport: http() });
const signer = createWalletClient({ account: owner, chain: arc, transport: http() });
if ((await client.getChainId()) !== 5042002) throw new Error('Wrong chain.');
const journalFile = new URL(
  fresh
    ? '../server/.secrets/public-onboarding-proof-journal.json'
    : '../server/.secrets/public-payment-proof-journal.json',
  import.meta.url,
);
type Journal = {
  vault?: Address;
  transactions: Record<string, { raw: Hex; hash: Hex }>;
  planId?: string;
  approval?: BatchApproval;
  signature?: Hex;
  payoutHash?: Hex;
};
let journal: Journal = { transactions: {} };
try {
  journal = JSON.parse(await readFile(journalFile, 'utf8'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const save = () => writeFile(journalFile, JSON.stringify(journal), { mode: 0o600 });
if (journal.vault) vault = journal.vault;
if (journal.payoutHash) {
  const completed = await client.getTransactionReceipt({ hash: journal.payoutHash });
  if (
    completed.status !== 'success' ||
    completed.to?.toLowerCase() !== vault ||
    completed.from.toLowerCase() !== operator
  )
    throw new Error('Completed proof receipt no longer matches the controlled vault.');
  console.log(JSON.stringify({ resumedConfirmed: journal.payoutHash, newPaymentSent: false }));
  process.exit(0);
}
async function transact(key: string, to: Address | undefined, data: Hex) {
  let entry = journal.transactions[key];
  if (!entry) {
    const request = await signer.prepareTransactionRequest({ account: owner, to, data, value: 0n });
    const raw = await signer.signTransaction(request);
    entry = { raw, hash: keccak256(raw) };
    journal.transactions[key] = entry;
    await save();
  }
  let receipt = await client.getTransactionReceipt({ hash: entry.hash }).catch(() => undefined);
  if (!receipt) {
    try {
      await client.sendRawTransaction({ serializedTransaction: entry.raw });
    } catch {
      if (!(await client.getTransaction({ hash: entry.hash }).catch(() => undefined)))
        throw new Error(
          'Submission uncertain. Resume this journal; do not create another transfer.',
        );
    }
    receipt = await client.waitForTransactionReceipt({ hash: entry.hash, timeout: 60000 });
  }
  if (
    receipt.status !== 'success' ||
    receipt.from.toLowerCase() !== owner.address.toLowerCase() ||
    receipt.to?.toLowerCase() !== to?.toLowerCase()
  )
    throw new Error('Controlled transaction failed or mismatched.');
  console.log(JSON.stringify({ stage: key, transaction: entry.hash }));
  return receipt;
}
let cookie = '',
  csrf = '';
async function api(path: string, body?: unknown): Promise<any> {
  const response = await fetch(base + path, {
    headers: {
      origin,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { 'x-splitt-csrf': csrf } : {}),
    },
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
    redirect: 'error',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      `Public proof endpoint returned ${response.status}; inspect the saved journal before retrying.`,
    );
  if (path === '/auth/verify') cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  return data;
}
const config = await api('/selfserve/config');
if (config.chainId !== 5042002 || config.operator.toLowerCase() !== operator)
  throw new Error('Unexpected API network/operator.');
const challenge = await api('/auth/challenge', { address: owner.address });
const parsed = parseSiweMessage(challenge.message);
if (
  parsed.domain !== new URL(origin).host ||
  parsed.uri !== origin ||
  parsed.chainId !== 5042002 ||
  parsed.nonce !== challenge.nonce ||
  parsed.address?.toLowerCase() !== owner.address.toLowerCase()
)
  throw new Error('Unexpected sign-in challenge; nothing signed.');
const login = await api('/auth/verify', {
  nonce: challenge.nonce,
  signature: await owner.signMessage({ message: challenge.message }),
});
csrf = login.csrf;
if (!cookie || !csrf) throw new Error('Missing authenticated session.');
try {
  if (fresh) {
    if (!journal.vault && (await api('/selfserve/vaults')).length)
      throw new Error(
        'Builder already has a registered vault. Do not deploy an unjournaled replacement.',
      );
    const deployed = await transact(
      'deployment',
      undefined,
      vaultCreation(owner.address, config.operator),
    );
    if (!deployed.contractAddress) throw new Error('Missing controlled deployment address.');
    vault = deployed.contractAddress;
    journal.vault = vault;
    await save();
    if (!(await api('/selfserve/vaults')).length)
      await api('/selfserve/vaults', { transactionHash: deployed.transactionHash });
  }
  const path = `/selfserve/vaults/${vault}`;
  const registered = (await api('/selfserve/vaults')).find(
    (entry: { vault: string }) => entry.vault.toLowerCase() === vault,
  );
  if (registered?.classification !== 'controlled_test')
    throw new Error('Only the existing controlled vault is allowed.');
  let state = (await api(path + '/workspace')) as LiveState;
  if (fresh && !state.projects.length) {
    const id = `public-launch-${owner.address.slice(2).toLowerCase()}`,
      date = new Date().toISOString().slice(0, 10);
    const cid = `${id}-contractor`;
    const p = {
      id,
      onchainId: idHash(id),
      name: 'Public preview proof',
      client: 'Controlled test',
      clientWallet: owner.address,
      invoiceRef: `PUB-${owner.address.slice(2, 10)}`,
      invoiceTotal: '2000000',
      commitments: [
        {
          id: cid,
          onchainId: idHash(cid),
          name: 'Controlled contractor',
          role: 'Preview test recipient',
          payee: '0x0D997325A206fae68EB4e92AdF00eac85d8864bf' as Address,
          maximum: '300000',
          dueDate: date,
          deferUntil: null,
          accepted: true,
          acceptedAt: date,
          blocksDelivery: true,
          partialAllowed: false,
          dependsOn: null,
        },
      ],
    };
    await transact(
      'project',
      vault,
      encodeFunctionData({
        abi: vaultAbi,
        functionName: 'createProject',
        args: [p.onchainId, 300000n, 5000000n, 10000000n],
      }),
    );
    await transact(
      'commitment',
      vault,
      encodeFunctionData({
        abi: vaultAbi,
        functionName: 'addCommitment',
        args: [idHash(cid), p.onchainId, p.commitments[0].payee, 300000n, false],
      }),
    );
    await api(path + '/projects', p);
    state = await api(path + '/workspace');
  }
  const project = state.projects[0];
  if (
    !project ||
    project.invoiceTotal !== '2000000' ||
    project.reserve !== '300000' ||
    (!journal.transactions.deposit &&
      (project.received !== (fresh ? '0' : '1200000') ||
        project.balance !== (fresh ? '0' : '300000')))
  )
    throw new Error('Controlled case changed; no new deposit authorized by this proof.');
  const activation = Math.max(...project.commitments.map((entry) => entry.activeAfter)) * 1000;
  if (activation > Date.now())
    console.log(
      JSON.stringify({
        stage: 'recipient-activation',
        readyAt: new Date(activation).toISOString(),
      }),
    );
  while (Date.now() < activation)
    await new Promise((resolve) => setTimeout(resolve, Math.min(5000, activation - Date.now())));
  const beforeOther = await client.readContract({
    address: '0x5c6a73d2626a94978364f5d6a3f00fda42148186',
    abi: vaultAbi,
    functionName: 'projects',
    args: [idHash('selfserve-proof-387565237cace460b9bea78f74dac3c26246f347')],
  });
  await transact(
    'approval',
    USDC,
    encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [vault, 800000n] }),
  );
  const deposit = await transact(
    'deposit',
    vault,
    encodeFunctionData({
      abi: vaultAbi,
      functionName: 'deposit',
      args: [project.onchainId, idHash(project.invoiceRef), 800000n],
    }),
  );
  let plan: LiveState['plans'][number] | undefined;
  for (let attempt = 0; attempt < 20; attempt++) {
    state = await api(path + '/workspace');
    const task = state.receiptDrafts?.find(
      (entry) => entry.id.includes(deposit.transactionHash) && entry.state === 'done',
    );
    plan = state.plans.find((entry) => entry.id === (journal.planId ?? task?.planId));
    if (plan) break;
    await new Promise((resolve) => setTimeout(resolve, 6000));
  }
  if (!plan)
    throw new Error('Automatic draft pending. Resume this journal without another deposit.');
  const payments = plan.output.items.filter(
    (entry) => entry.action === 'pay' && BigInt(entry.amount_micro) > 0n,
  );
  const remaining = project.commitments.find(
    (entry) => BigInt(entry.maximum) - BigInt(entry.paid) === 300000n,
  );
  if (
    payments.length !== 1 ||
    payments[0].amount_micro !== '300000' ||
    payments[0].commitment_id !== remaining?.id
  )
    throw new Error(
      'Proposal differs from the reviewed 0.3 USDC remainder. Nothing signed; inspect the proposal.',
    );
  journal.planId = plan.id;
  await save();
  console.log(
    JSON.stringify({
      stage: 'automatic-draft',
      model: plan.model,
      fallbackUsed: plan.fallbackUsed,
      planId: plan.id,
    }),
  );
  if (!state.jobs.some((job) => job.id === plan!.id)) {
    if (!journal.approval) {
      journal.approval = (await api(`${path}/plans/${plan.id}/prepare`, {})).approval;
      await save();
    }
    assertPayoutMatchesReview(journal.approval!, vault, state.projects[0], plan);
    if (!journal.signature) {
      journal.signature = await owner.signTypedData(approvalTypedData(journal.approval!));
      await save();
    }
    await api(`${path}/plans/${plan.id}/submit`, { signature: journal.signature });
  }
  let job: LiveState['jobs'][number] | undefined;
  for (let attempt = 0; attempt < 24; attempt++) {
    state = await api(path + '/workspace');
    job = state.jobs.find((entry) => entry.id === plan!.id);
    if (job?.state === 'confirmed' && job.txHash) break;
    if (job && ['failed', 'expired', 'invariant_violation'].includes(job.state))
      throw new Error(`Payout ${job.state}; do not create another intent.`);
    await new Promise((resolve) => setTimeout(resolve, 6000));
  }
  if (job?.state !== 'confirmed' || !job.txHash)
    throw new Error(
      'Existing payout unresolved. Resume the journal, do not resubmit a new payment.',
    );
  const receipt = await client.getTransactionReceipt({ hash: job.txHash as Hex });
  const other = await client.readContract({
    address: '0x5c6a73d2626a94978364f5d6a3f00fda42148186',
    abi: vaultAbi,
    functionName: 'projects',
    args: [idHash('selfserve-proof-387565237cace460b9bea78f74dac3c26246f347')],
  });
  if (
    receipt.status !== 'success' ||
    receipt.from.toLowerCase() !== operator ||
    receipt.to?.toLowerCase() !== vault ||
    state.projects[0].balance !== (fresh ? '500000' : '800000') ||
    other[0] !== beforeOther[0]
  )
    throw new Error('Settlement or project isolation check failed.');
  journal.payoutHash = job.txHash as Hex;
  await save();
  const report = {
    checkedAt: new Date().toISOString(),
    origin,
    apiThroughPublicFrontend: true,
    chainId: 5042002,
    source: 'controlled_test',
    realBusinesses: 0,
    vault,
    owner: owner.address,
    depositHash: deposit.transactionHash,
    automaticReceiptDraft: true,
    manualReplanUsed: false,
    planId: plan.id,
    model: plan.model,
    fallbackUsed: plan.fallbackUsed,
    independentlyCheckedPayout: true,
    payoutHash: job.txHash,
    paidMicro: '300000',
    finalProjectBalanceMicro: fresh ? '500000' : '800000',
    newVaultDeployed: fresh,
    otherProjectBalanceUnchanged: true,
    privateKeysStayedLocal: true,
    browserQaCompleted: false,
    limitation:
      'Controlled API and on-chain payout through the public frontend rewrite. Not browser interaction footage, a real business pilot or mainnet funds.',
  };
  await writeFile(
    new URL(
      fresh ? '../docs/public-onboarding-proof.json' : '../docs/public-payment-proof.json',
      import.meta.url,
    ),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
} finally {
  await api('/auth/logout', {});
}
