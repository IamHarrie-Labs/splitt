/**
 * Deploys the audited ProjectVaultV2 to Arc Mainnet.
 *
 *   npm run mainnet:deploy               # dry run: every check, nothing sent
 *   npm run mainnet:deploy -- --broadcast
 *
 * Run it on your own machine. The deployer key only pays gas; the Safe is the owner.
 */
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient, defineChain, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
// @ts-expect-error The local compiler is a JavaScript CLI as well as a helper.
import { compile } from './compile-contracts.mjs';
import { MAINNET_CHAIN_ID, deployVault, planDeployment } from './mainnet-deploy.js';

const broadcast = process.argv.includes('--broadcast');
const key = process.env.DEPLOYER_PRIVATE_KEY;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key))
  throw new Error(
    'Set DEPLOYER_PRIVATE_KEY in your local shell. It pays gas only and is not the owner.',
  );
if (broadcast && process.env.SPLITT_DEPLOY_CONFIRM !== 'arc-mainnet')
  throw new Error('Set SPLITT_DEPLOY_CONFIRM=arc-mainnet to broadcast a mainnet deployment.');

const rpc = process.env.ARC_MAINNET_RPC_URL ?? 'https://rpc.mainnet.arc.io';
const chain = defineChain({
  id: MAINNET_CHAIN_ID,
  name: 'Arc Mainnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const client = createPublicClient({ chain, transport: http(rpc) });
const account = privateKeyToAccount(key as Hex);
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const artifact = compile(true)['contracts/src/ProjectVaultV2.sol'].ProjectVaultV2;
const manifest = JSON.parse(await readFile('docs/mainnet-candidate.json', 'utf8'));
const plan = await planDeployment(client, account.address, artifact, manifest, {
  owner: process.env.MAINNET_OWNER_ADDRESS?.trim(),
  operator: process.env.MAINNET_OPERATOR_ADDRESS?.trim(),
  payeeDelaySeconds: process.env.MAINNET_PAYEE_DELAY_SECONDS,
  auditReportUrl: process.env.MAINNET_AUDIT_REPORT_URL,
  releaseCommit: process.env.MAINNET_RELEASE_COMMIT?.trim(),
  headCommit: git('rev-parse', 'HEAD'),
  dirtyTree: git('status', '--porcelain') !== '',
});
console.log(JSON.stringify({ ...plan, args: plan.args?.map(String), broadcast }, null, 2));
if (!plan.ready) {
  console.error(`\nBlocked: ${plan.blockers.length} check(s) must pass before deploying.`);
  process.exit(2);
}
if (!broadcast) {
  console.log(
    '\nAll checks pass. Re-run with --broadcast and SPLITT_DEPLOY_CONFIRM=arc-mainnet to deploy.',
  );
  process.exit(0);
}

const journalFile = 'docs/mainnet-deployment.json';
let journal: Record<string, unknown> = {};
try {
  journal = JSON.parse(await readFile(journalFile, 'utf8'));
} catch {}
if (journal.txHash)
  throw new Error(
    `${journalFile} already records deployment ${journal.txHash}. Reconcile it first.`,
  );
const wallet = createWalletClient({ account, chain, transport: http(rpc) });
const result = await deployVault(client, wallet, artifact, plan, async (entry) => {
  journal = { ...journal, ...entry, recordedAt: new Date().toISOString() };
  await writeFile(journalFile, `${JSON.stringify(journal, null, 2)}\n`);
});
console.log(`
Deployed and verified: ${result.vault}
Explorer: https://explorer.arc.io/address/${result.vault}

Set these on the mainnet API, then run npm run mainnet:check:
  MAINNET_VAULT_ADDRESS=${result.vault}
  VAULT_ADDRESS=${result.vault}
  VAULT_DEPLOYMENT_BLOCK=${result.deploymentBlock}
  MAINNET_EXPECTED_RUNTIME_CODE_HASH=${result.runtimeCodeHash}
`);
