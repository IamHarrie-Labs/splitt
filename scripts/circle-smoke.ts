import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  createPublicClient,
  http,
  encodeFunctionData,
  parseAbi,
  type Address,
  type Hex,
} from 'viem';
import { circleOperator } from '../server/src/circle/operator.js';
import { arc, arcGateway } from '../server/src/live/chain.js';
const deployment = JSON.parse(
  await readFile(new URL('../docs/arc-deployment.json', import.meta.url), 'utf8'),
);
const chain = arcGateway(deployment.vault, deployment.owner, deployment.operator);
await chain.verify();
const operator = circleOperator();
await operator.verify(deployment.operator);
const data = encodeFunctionData({
  abi: parseAbi(['function owner() view returns (address)']),
  functionName: 'owner',
});
const file = new URL('../server/.secrets/circle-smoke.json', import.meta.url);
let state: { key: string; vault: Address; data: Hex; providerId?: string };
try {
  state = JSON.parse(await readFile(file, 'utf8'));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  state = { key: randomUUID(), vault: deployment.vault, data };
  await writeFile(file, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
}
if (state.vault !== deployment.vault || state.data !== data)
  throw new Error('Saved Circle probe uses another contract or call.');
if (!state.providerId) {
  state.providerId = await operator.submit(data, state.key);
  await writeFile(file, JSON.stringify(state), { mode: 0o600 });
}
const client = createPublicClient({
  chain: arc,
  transport: http(process.env.ARC_RPC_URL ?? arc.rpcUrls.default.http[0]),
});
let report: {
  vault: Address;
  providerId: string;
  state?: string;
  txHash?: string;
  receiptVerified: boolean;
  payout: boolean;
  checkedAt: string;
} = {
  vault: deployment.vault,
  providerId: state.providerId!,
  receiptVerified: false,
  payout: false,
  checkedAt: new Date().toISOString(),
};
for (let attempt = 0; attempt < 8; attempt++) {
  const status = await operator.status(state.providerId!);
  report.state = status?.state;
  report.txHash = status?.txHash;
  if (status?.txHash) {
    try {
      const hash = status.txHash as Hex;
      const receipt = await client.getTransactionReceipt({ hash });
      const tx = await client.getTransaction({ hash });
      if (
        receipt.status === 'success' &&
        tx.from.toLowerCase() === deployment.operator.toLowerCase() &&
        tx.to?.toLowerCase() === deployment.vault.toLowerCase() &&
        tx.input === data &&
        tx.value === 0n
      ) {
        report.receiptVerified = true;
        break;
      }
    } catch {}
  }
  if (['FAILED', 'DENIED', 'CANCELLED'].includes(status?.state ?? '')) break;
  await new Promise((resolve) => setTimeout(resolve, 4000));
}
report.checkedAt = new Date().toISOString();
await writeFile(
  new URL('../docs/circle-execution-proof.json', import.meta.url),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
