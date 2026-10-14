import { readFile, writeFile } from 'node:fs/promises';
import { createPublicClient, http, erc20Abi, type Address } from 'viem';
import { arc, USDC, arcGateway } from '../server/src/live/chain.js';
const local = JSON.parse(
  await readFile(new URL('../docs/owner-wallet.json', import.meta.url), 'utf8'),
);
const client = createPublicClient({
  chain: arc,
  transport: http(process.env.ARC_RPC_URL ?? arc.rpcUrls.default.http[0], {
    timeout: 15000,
    retryCount: 0,
  }),
});
const owner = (process.env.OWNER_ADDRESS?.trim() || local.address) as Address;
const report: {
  checkedAt: string;
  owner: Address;
  chainId: number;
  nativeBalance?: string;
  erc20Balance?: string;
  ready: boolean;
  blockers: string[];
  payoutActivationAt?: string;
  payoutReady?: boolean;
} = { checkedAt: new Date().toISOString(), owner, chainId: 5042002, ready: false, blockers: [] };
try {
  if ((await client.getChainId()) !== 5042002) throw new Error('Wrong network');
  report.nativeBalance = String(await client.getBalance({ address: owner }));
  report.erc20Balance = String(
    await client.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [owner],
    }),
  );
  if (BigInt(report.nativeBalance) === 0n)
    report.blockers.push('Owner wallet needs testnet gas funding.');
} catch {
  report.blockers.push('Arc RPC funding verification did not complete.');
}
for (const field of [
  'VAULT_ADDRESS',
  'VAULT_DEPLOYMENT_BLOCK',
  'OPERATOR_ADDRESS',
  'CIRCLE_API_KEY',
  'CIRCLE_ENTITY_SECRET',
  'CIRCLE_WALLET_ID',
  'DATABASE_URL',
])
  if (!process.env[field]) report.blockers.push(`${field} not configured.`);
if (process.env.VAULT_ADDRESS && process.env.OPERATOR_ADDRESS) {
  try {
    await arcGateway(
      process.env.VAULT_ADDRESS as Address,
      owner,
      process.env.OPERATOR_ADDRESS as Address,
    ).verify();
  } catch {
    report.blockers.push('Vault deployment and ownership check did not pass.');
  }
}
report.ready = report.blockers.length === 0;
try {
  const bootstrap = JSON.parse(
    await readFile(new URL('../docs/testnet-bootstrap.json', import.meta.url), 'utf8'),
  );
  const activations = bootstrap.projects.flatMap((p: { commitments: { activeAfter: number }[] }) =>
    p.commitments.map((c) => c.activeAfter),
  );
  if (activations.length) {
    const latest = Math.max(...activations);
    report.payoutActivationAt = new Date(latest * 1000).toISOString();
    report.payoutReady = report.ready && Date.now() >= latest * 1000;
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
await writeFile(
  new URL('../docs/integration-readiness.json', import.meta.url),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
