import { readFile, writeFile } from 'node:fs/promises';
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  decodeFunctionData,
  erc20Abi,
  type Hex,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arc, arcGateway, USDC, vaultAbi } from '../server/src/live/chain.js';
import { connectDatabase } from '../server/src/db/driver.js';
import { LivePostgresRepository } from '../server/src/live/repository.js';
import { TestnetService } from '../server/src/live/service.js';
import { circleOperator } from '../server/src/circle/operator.js';
import { workerTick, indexReceipts } from '../server/src/live/worker.js';
import { approvalTypedData } from '../server/src/approvals.js';
if (process.env.SPLITT_PROOF_CONFIRM !== 'arc-testnet')
  throw new Error('Set SPLITT_PROOF_CONFIRM=arc-testnet to run the reviewed test scenario.');
const deployment = JSON.parse(
  await readFile(new URL('../docs/arc-deployment.json', import.meta.url), 'utf8'),
);
const local = JSON.parse(
  await readFile(new URL('../server/.secrets/owner-wallet.json', import.meta.url), 'utf8'),
);
const account = privateKeyToAccount(local.privateKey),
  chain = arcGateway(deployment.vault, account.address, deployment.operator);
await chain.verify();
const provider = circleOperator();
await provider.verify(deployment.operator);
const db = connectDatabase(process.env.DATABASE_URL!);
const file = new URL('../server/.secrets/testnet-proof-journal.json', import.meta.url);
let journal: {
  first?: string;
  second?: string;
  allowanceHash?: Hex;
  depositHash?: Hex;
  allowanceAttempted?: boolean;
  depositAttempted?: boolean;
  lostResponse?: { idempotencyKey: string; providerId: string; callData: Hex };
} = {};
try {
  journal = JSON.parse(await readFile(file, 'utf8'));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
}
const save = () => writeFile(file, JSON.stringify(journal), { mode: 0o600 });
try {
  const repo = await new LivePostgresRepository(
    db,
    `5042002:${deployment.vault.toLowerCase()}`,
  ).init(deployment.deploymentBlock);
  const service = new TestnetService(repo, chain, account.address, deployment.vault);
  const state = await repo.snapshot(),
    metadata = state.projects.find((p) => p.id === 'northstar');
  if (!metadata) throw new Error('Bootstrap the demo first.');
  const snapshot = await chain.project(metadata);
  const activation = Math.max(...snapshot.project.commitments.map((c) => c.activeAfter));
  if (snapshot.now.getTime() / 1000 < activation)
    throw new Error(
      `Contractor activation delay remains enforced until ${new Date(activation * 1000).toISOString()}. Nothing submitted.`,
    );
  const recoveryRequested = process.argv.includes('--recovery');
  if (recoveryRequested) {
    let running = false;
    try { running = (await fetch('http://127.0.0.1:4000/health', { signal: AbortSignal.timeout(1500) })).ok; } catch { /* No local competing worker. */ }
    if (running) throw new Error('Stop the local API/worker before the controlled lost-response proof. Nothing submitted.');
  }
  const proofProvider = {
    status: provider.status,
    async submit(callData: Hex, idempotencyKey: string) {
      const providerId = await provider.submit(callData, idempotencyKey);
      if (recoveryRequested && !journal.lostResponse && idempotencyKey === journal.first) {
        journal.lostResponse = { idempotencyKey, providerId, callData };
        await save();
        throw new Error('Controlled loss of an accepted provider response. Resume the same durable job.');
      }
      if (journal.lostResponse?.idempotencyKey === idempotencyKey && journal.lostResponse.providerId !== providerId)
        throw new Error('Provider idempotency result changed; inspect before continuing.');
      return providerId;
    },
  };
  async function stage(name: 'first' | 'second', expected: Record<string, string>) {
    if (!journal[name]) {
      const plan = await service.plan('northstar');
      const payments = Object.fromEntries(
        plan.output.items
          .filter((i) => i.action === 'pay')
          .map((i) => [i.commitment_id, i.amount_micro]),
      );
      if (JSON.stringify(payments) !== JSON.stringify(expected))
        throw new Error(
          'Allocation differs from the reviewed test scenario; inspect before signing.',
        );
      journal[name] = plan.id;
      await save();
    }
    const id = journal[name]!;
    if (!(await repo.snapshot()).jobs.some((j) => j.id === id)) {
      const { approval } = await service.prepare(id);
      const signature = await account.signTypedData(approvalTypedData(approval));
      await service.enqueue(id, { signature });
    }
    for (let attempt = 0; attempt < 72; attempt++) {
      await workerTick(repo, chain, proofProvider);
      await indexReceipts(repo, chain);
      const job = (await repo.snapshot()).jobs.find((j) => j.id === id)!;
      if (job.state === 'confirmed') return job;
      if (['failed', 'expired', 'invariant_violation'].includes(job.state))
        throw new Error('Batch needs owner review; do not create a replacement automatically.');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    throw new Error('Batch remains unresolved. Resume the same proof journal, not a new payment.');
  }
  const first = await stage('first', { amara: '700000', tobi: '200000' });
  const client = createPublicClient({
    chain: arc,
    transport: http(process.env.ARC_RPC_URL ?? arc.rpcUrls.default.http[0]),
  });
  const wallet = createWalletClient({
    account,
    chain: arc,
    transport: http(process.env.ARC_RPC_URL ?? arc.rpcUrls.default.http[0]),
  });
  const prepared = JSON.parse(
    await readFile(new URL('../docs/testnet-transactions.json', import.meta.url), 'utf8'),
  );
  if (prepared.scale !== '1000' || prepared.vault.toLowerCase() !== deployment.vault.toLowerCase())
    throw new Error('Proof requires the scaled 2-USDC scenario.');
  const remainderCall = decodeFunctionData({ abi: vaultAbi, data: prepared.remainder.data });
  if (
    remainderCall.functionName !== 'deposit' ||
    remainderCall.args[0] !== metadata.onchainId ||
    remainderCall.args[2] !== 800000n
  )
    throw new Error('Remainder calldata does not match the reviewed scenario.');
  async function ownerCall(kind: 'allowance' | 'deposit', to: Address, data: Hex) {
    const hashField = kind === 'allowance' ? 'allowanceHash' : 'depositHash',
      attemptedField = kind === 'allowance' ? 'allowanceAttempted' : 'depositAttempted';
    if (journal[attemptedField] && !journal[hashField])
      throw new Error('Owner transaction outcome unknown; reconcile before retrying.');
    if (!journal[hashField]) {
      journal[attemptedField] = true;
      await save();
      journal[hashField] = await wallet.sendTransaction({ to, data });
      await save();
    }
    if (
      (await client.waitForTransactionReceipt({ hash: journal[hashField]! })).status !== 'success'
    )
      throw new Error('Remainder transaction reverted.');
  }
  await ownerCall(
    'allowance',
    USDC,
    encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [deployment.vault, 800000n],
    }),
  );
  await ownerCall('deposit', deployment.vault, prepared.remainder.data);
  const second = await stage('second', { tobi: '300000' });
  const northstar = await service.fresh('northstar'),
    fieldwork = await service.fresh('fieldwork');
  if (northstar.project.balance !== '800000' || fieldwork.project.balance !== '1000000')
    throw new Error('Final balance/isolation invariant failed.');
  if (northstar.project.commitments.find(c => c.id === 'amara')?.paid !== '700000' || northstar.project.commitments.find(c => c.id === 'tobi')?.paid !== '500000')
    throw new Error('Final cumulative contractor amounts failed.');
  const firstProviderId = first.providerId ?? journal.lostResponse?.providerId;
  const firstStatus = firstProviderId ? await provider.status(firstProviderId) : undefined;
  const secondStatus = second.providerId ? await provider.status(second.providerId) : undefined;
  const firstHash = first.txHash ?? firstStatus?.txHash;
  const secondHash = second.txHash ?? secondStatus?.txHash;
  if (!firstHash || !/^0x[0-9a-fA-F]{64}$/.test(firstHash) || !secondHash || !/^0x[0-9a-fA-F]{64}$/.test(secondHash))
    throw new Error('Batch receipt hash pending; resume this proof journal.');
  for (const hash of [firstHash, secondHash]) {
    const receipt = await client.getTransactionReceipt({ hash: hash as Hex });
    if (receipt.status !== 'success' || receipt.to?.toLowerCase() !== deployment.vault.toLowerCase())
      throw new Error('Successful vault receipt required for each payout batch.');
  }
  if (recoveryRequested && (!journal.lostResponse || first.attempts < 2))
    throw new Error('Controlled response loss was not exercised; do not claim recovery proof.');
  const proof = {
    checkedAt: new Date().toISOString(),
    chainId: 5042002,
    vault: deployment.vault,
    source: 'testnet_demonstration',
    firstBatch: { id: first.id, providerId: first.providerId ?? journal.lostResponse?.providerId, txHash: firstHash },
    secondBatch: { id: second.id, providerId: second.providerId, txHash: secondHash },
    remainderTxHash: journal.depositHash,
    finalNorthstarBalance: '800000',
    fieldworkBalance: '1000000',
    realBusinesses: 0,
    realCustomerVolume: '0',
    recovery: journal.lostResponse ? { responseLossInjected: true, sameJobId: journal.lostResponse.idempotencyKey === first.id, sameCalldata: journal.lostResponse.callData === first.callData, attempts: first.attempts, cumulativePayoutsVerified: true } : null,
  };
  await writeFile(
    new URL('../docs/testnet-payout-proof.json', import.meta.url),
    JSON.stringify(proof, null, 2),
  );
  console.log(JSON.stringify(proof, null, 2));
} finally {
  await db.close();
}
