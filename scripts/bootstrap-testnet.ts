import { readFile, writeFile } from 'node:fs/promises';
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  erc20Abi,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arc, USDC, vaultAbi, arcGateway } from '../server/src/live/chain.js';
import { hashJson, idHash } from '@splitt/core';
import { connectDatabase } from '../server/src/db/driver.js';
import { LivePostgresRepository } from '../server/src/live/repository.js';
import { TestnetService } from '../server/src/live/service.js';
if (process.env.SPLITT_SETUP_CONFIRM !== 'arc-testnet')
  throw new Error('Testnet setup confirmation is required.');
const local = JSON.parse(
  await readFile(new URL('../server/.secrets/owner-wallet.json', import.meta.url), 'utf8'),
);
const account = privateKeyToAccount(local.privateKey);
const vault = process.env.VAULT_ADDRESS as Address,
  operator = process.env.OPERATOR_ADDRESS as Address;
if (!vault || !operator || !process.env.DATABASE_URL)
  throw new Error('Complete deployment, Circle and database configuration first.');
const chain = arcGateway(vault, account.address, operator);
await chain.verify();
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
if (
  prepared.vault.toLowerCase() !== vault.toLowerCase() ||
  prepared.owner.toLowerCase() !== account.address.toLowerCase() ||
  prepared.scale !== '1000'
)
  throw new Error('Expected the reviewed 2-USDC testnet scenario.');
const file = new URL('../server/.secrets/bootstrap-journal.json', import.meta.url);
type Entry = { fingerprint: Hex; hash?: Hex; attempted: boolean };
let journal: Record<string, Entry> = {};
try {
  journal = JSON.parse(await readFile(file, 'utf8'));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
}
const save = () => writeFile(file, JSON.stringify(journal, null, 2), { mode: 0o600 });
async function send(id: string, to: Address, data: Hex = '0x', value = 0n) {
  const fingerprint = hashJson({
    chainId: 5042002,
    from: account.address,
    to,
    data,
    value: String(value),
  });
  const prior = journal[id];
  if (prior && prior.fingerprint !== fingerprint)
    throw new Error('Transaction intent changed; reconcile before retrying.');
  if (prior?.attempted && !prior.hash)
    throw new Error('Transaction outcome unknown; inspect owner history before resending.');
  if (!prior?.hash) {
    journal[id] = { fingerprint, attempted: true };
    await save();
    const hash = await wallet.sendTransaction({ to, data, value });
    journal[id].hash = hash;
    await save();
  }
  const receipt = await client.waitForTransactionReceipt({ hash: journal[id].hash! });
  if (receipt.status !== 'success') throw new Error(`Testnet transaction ${id} reverted.`);
  console.log(
    JSON.stringify({ step: id, txHash: journal[id].hash, block: String(receipt.blockNumber) }),
  );
}
const operatorBalance = await client.getBalance({ address: operator });
if (journal.operator_gas?.hash) await send('operator_gas', operator, '0x', 1000000000000000000n);
else if (operatorBalance < 1000000000000000000n)
  await send('operator_gas', operator, '0x', 1000000000000000000n);
for (const [index, call] of (
  prepared.calls as { to: Address; data: Hex; sender: Address }[]
).entries()) {
  if (
    call.sender.toLowerCase() !== account.address.toLowerCase() ||
    ![vault.toLowerCase(), USDC.toLowerCase()].includes(call.to.toLowerCase())
  )
    throw new Error('Unexpected setup transaction destination.');
  await send(`setup_${index}`, call.to, call.data);
}
const metadata = JSON.parse(
  await readFile(new URL('../docs/testnet-projects.json', import.meta.url), 'utf8'),
);
const fieldwork = metadata.find((p: { id: string }) => p.id === 'fieldwork');
await send(
  'fieldwork_allowance',
  USDC,
  encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [vault, 1000000n] }),
);
await send(
  'fieldwork_deposit',
  vault,
  encodeFunctionData({
    abi: vaultAbi,
    functionName: 'deposit',
    args: [fieldwork.onchainId, idHash(fieldwork.invoiceRef), 1000000n],
  }),
);
const db = connectDatabase(process.env.DATABASE_URL);
try {
  const repo = await new LivePostgresRepository(db, `5042002:${vault.toLowerCase()}`).init(
    process.env.VAULT_DEPLOYMENT_BLOCK!,
  );
  const service = new TestnetService(repo, chain, account.address, vault);
  await repo.transaction((state) => {
    for (const project of state.projects)
      if (metadata.some((demo: { onchainId: string }) => demo.onchainId === project.onchainId))
        project.source = 'fixture';
  });
  for (const project of metadata) {
    if (!(await repo.snapshot()).projects.some((p) => p.id === project.id))
      await service.register(project);
  }
  const projects = await Promise.all(
    metadata.map(async (p: { id: string }) => {
      const live = await service.fresh(p.id);
      return {
        id: p.id,
        balance: live.project.balance,
        reserve: live.project.reserve,
        commitments: live.project.commitments.map((c) => ({
          id: c.id,
          payee: c.payee,
          activeAfter: c.activeAfter,
          eligibleAt: new Date(c.activeAfter * 1000).toISOString(),
        })),
      };
    }),
  );
  await writeFile(
    new URL('../docs/testnet-bootstrap.json', import.meta.url),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        vault,
        operator,
        scale: 1000,
        projects,
        transactions: Object.entries(journal).map(([step, e]) => ({ step, txHash: e.hash })),
        status:
          'Setup complete. Contractor activation delay remains enforced. Testnet demonstration only; no pilot adoption.',
      },
      null,
      2,
    ),
  );
  console.log(
    'Project registration and on-chain balances verified. Activation timestamps saved in docs/testnet-bootstrap.json.',
  );
} finally {
  await db.close();
}
