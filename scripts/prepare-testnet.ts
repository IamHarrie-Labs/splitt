import { readFile, writeFile } from 'node:fs/promises';
import { encodeFunctionData, erc20Abi, type Address } from 'viem';
import { fixtureProjects } from '../server/src/fixtures.js';
import { vaultAbi, USDC } from '../server/src/live/chain.js';
import { addressSchema, idHash } from '@splitt/core';
const owner = addressSchema.parse(
  process.env.OWNER_ADDRESS?.trim() ||
    JSON.parse(await readFile(new URL('../docs/owner-wallet.json', import.meta.url), 'utf8'))
      .address,
) as Address;
const vault = addressSchema.parse(process.env.VAULT_ADDRESS) as Address;
const projects = fixtureProjects();
const scale = BigInt(process.env.SPLITT_TESTNET_SCALE ?? '1000');
if (scale !== 1n && scale !== 1000n) throw new Error('Testnet scale must be 1 or 1000.');
for (const project of projects) {
  for (const field of [
    'invoiceTotal',
    'received',
    'balance',
    'reserve',
    'perPayment',
    'perDay',
    'spentToday',
  ] as const)
    project[field] = String(BigInt(project[field]) / scale);
  for (const commitment of project.commitments) {
    commitment.maximum = String(BigInt(commitment.maximum) / scale);
    commitment.paid = String(BigInt(commitment.paid) / scale);
  }
}
const payees = JSON.parse(
  await readFile(new URL('../docs/test-payees.json', import.meta.url), 'utf8'),
) as { name: string; address: Address }[];
for (const project of projects)
  for (const commitment of project.commitments) {
    const wallet = payees.find((p) => p.name === commitment.id);
    if (!wallet) throw new Error('Generate test payee wallets before preparing the scenario.');
    commitment.payee = wallet.address;
  }
const calls: { purpose: string; to: Address; data: `0x${string}`; sender: Address }[] = [];
for (const p of projects) {
  calls.push({
    purpose: `Create ${p.name}`,
    to: vault,
    sender: owner,
    data: encodeFunctionData({
      abi: vaultAbi,
      functionName: 'createProject',
      args: [p.onchainId, BigInt(p.reserve), BigInt(p.perPayment), BigInt(p.perDay)],
    }),
  });
  for (const c of p.commitments)
    calls.push({
      purpose: `Approve obligation to ${c.name}`,
      to: vault,
      sender: owner,
      data: encodeFunctionData({
        abi: vaultAbi,
        functionName: 'addCommitment',
        args: [c.onchainId, p.onchainId, c.payee, BigInt(c.maximum), c.partialAllowed],
      }),
    });
}
// These are a test scenario, not a real agency or adoption evidence.
const northstar = projects[0];
calls.push({
  purpose: 'Approve the exact test invoice amount for Northstar deposits',
  to: USDC,
  sender: owner,
  data: encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [vault, BigInt(northstar.invoiceTotal)],
  }),
});
calls.push({
  purpose: 'Deposit the initial 60% of the test invoice (after setup)',
  to: vault,
  sender: owner,
  data: encodeFunctionData({
    abi: vaultAbi,
    functionName: 'deposit',
    args: [northstar.onchainId, idHash(northstar.invoiceRef), 1200000000n / scale],
  }),
});
const remainder = {
  purpose: 'Deposit the remaining 40% AFTER first settlement',
  to: vault,
  sender: owner,
  data: encodeFunctionData({
    abi: vaultAbi,
    functionName: 'deposit',
    args: [northstar.onchainId, idHash(northstar.invoiceRef), 800000000n / scale],
  }),
};
const metadata = projects.map((p) => ({
  id: p.id,
  onchainId: p.onchainId,
  name: p.name,
  client: p.client,
  clientWallet: owner,
  invoiceRef: p.invoiceRef,
  invoiceTotal: p.invoiceTotal,
  commitments: p.commitments.map((c) => ({
    id: c.id,
    onchainId: c.onchainId,
    name: c.name,
    role: c.role,
    payee: c.payee,
    maximum: c.maximum,
    dueDate: c.dueDate,
    deferUntil: c.deferUntil,
    accepted: c.accepted,
    acceptedAt: c.acceptedAt,
    blocksDelivery: c.blocksDelivery,
    partialAllowed: c.partialAllowed,
    dependsOn: c.dependsOn,
  })),
}));
await writeFile(
  new URL('../docs/testnet-transactions.json', import.meta.url),
  JSON.stringify(
    {
      chainId: 5042002,
      scale: String(scale),
      owner,
      vault,
      calls,
      remainder,
      warning:
        'Review and execute in order using your wallet. No transaction was sent. Respect vault payee activation delay before planning.',
    },
    null,
    2,
  ),
);
await writeFile(
  new URL('../docs/testnet-projects.json', import.meta.url),
  JSON.stringify(metadata, null, 2),
);
console.log('Prepared wallet transaction data and project metadata in docs. Nothing sent.');
