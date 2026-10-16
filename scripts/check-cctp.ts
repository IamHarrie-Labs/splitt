import { readFile, writeFile } from 'node:fs/promises';
import { cctpGateway } from '../server/src/bridge/gateway.js';
const deployment = JSON.parse(
  await readFile(new URL('../docs/arc-deployment.json', import.meta.url), 'utf8'),
);
const owner = JSON.parse(
  await readFile(new URL('../docs/owner-wallet.json', import.meta.url), 'utf8'),
).address;
const readiness = await cctpGateway(deployment.vault, owner).preflight(owner, '1000000');
const report = {
  checkedAt: new Date().toISOString(),
  source: 'Base Sepolia',
  destination: 'Arc Testnet',
  payer: owner,
  vault: deployment.vault,
  amountMicro: '1000000',
  ...readiness,
  transferProven: false,
};
await writeFile(
  new URL('../docs/cctp-readiness.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report, null, 2));
