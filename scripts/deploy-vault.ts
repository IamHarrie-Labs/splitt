import { readFile, writeFile } from 'node:fs/promises';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isAddress,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
if (process.env.SPLITT_DEPLOY_CONFIRM !== 'arc-testnet')
  throw new Error(
    'Set SPLITT_DEPLOY_CONFIRM=arc-testnet to enable this testnet-only deployment command.',
  );
const localWallet = !process.env.DEPLOYER_PRIVATE_KEY
  ? JSON.parse(
      await readFile(new URL('../server/.secrets/owner-wallet.json', import.meta.url), 'utf8'),
    )
  : undefined;
const key = process.env.DEPLOYER_PRIVATE_KEY ?? localWallet?.privateKey;
const owner = process.env.OWNER_ADDRESS?.trim() || localWallet?.address;
const operator = process.env.OPERATOR_ADDRESS;
if (
  !key ||
  !/^0x[0-9a-fA-F]{64}$/.test(key) ||
  !owner ||
  !operator ||
  !isAddress(owner) ||
  !isAddress(operator)
)
  throw new Error(
    'Provide DEPLOYER_PRIVATE_KEY, OWNER_ADDRESS and OPERATOR_ADDRESS through your local environment.',
  );
const rpc = process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.io';
const chain = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const publicClient = createPublicClient({ chain, transport: http(rpc) });
if ((await publicClient.getChainId()) !== chain.id)
  throw new Error('Deployment refuses non-Arc-testnet networks.');
const artifact = JSON.parse(
  await readFile(new URL('../artifacts/ProjectVault.json', import.meta.url), 'utf8'),
);
const wallet = createWalletClient({
  account: privateKeyToAccount(key as Hex),
  chain,
  transport: http(rpc),
});
const pendingFile = new URL('../server/.secrets/vault-deployment-pending.json', import.meta.url);
let pending: { hash: Hex; owner: string; operator: string } | undefined;
try {
  pending = JSON.parse(await readFile(pendingFile, 'utf8'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
if (
  pending &&
  (pending.owner.toLowerCase() !== owner.toLowerCase() ||
    pending.operator.toLowerCase() !== operator.toLowerCase())
)
  throw new Error(
    'Existing deployment intent uses different wallets. Reconcile it before deploying.',
  );
const hash =
  pending?.hash ??
  (await wallet.deployContract({
    abi: artifact.abi,
    bytecode: `0x${artifact.evm.bytecode.object}`,
    args: ['0x3600000000000000000000000000000000000000', owner, operator, 86400n],
  }));
if (!pending)
  await writeFile(pendingFile, JSON.stringify({ hash, owner, operator }), {
    flag: 'wx',
    mode: 0o600,
  });
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== 'success') throw new Error('Deployment reverted.');
if (!receipt.contractAddress) throw new Error('Deployment receipt is missing a contract address.');
await writeFile(
  new URL('../docs/arc-deployment.json', import.meta.url),
  JSON.stringify(
    {
      vault: receipt.contractAddress,
      deploymentBlock: String(receipt.blockNumber),
      txHash: hash,
      chainId: chain.id,
      owner,
      operator,
      source: 'arc_testnet',
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      vault: receipt.contractAddress,
      deploymentBlock: receipt.blockNumber.toString(),
      txHash: hash,
      chainId: chain.id,
      explorer: `https://explorer.testnet.arc.io/tx/${hash}`,
    },
    null,
    2,
  ),
);
const envFile = new URL('../.env', import.meta.url);
let envContents = await readFile(envFile, 'utf8');
for (const [name, value] of Object.entries({
  VAULT_ADDRESS: receipt.contractAddress,
  VAULT_DEPLOYMENT_BLOCK: String(receipt.blockNumber),
})) {
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  envContents = pattern.test(envContents)
    ? envContents.replace(pattern, `${name}=${value}`)
    : envContents + `\n${name}=${value}\n`;
}
await writeFile(envFile, envContents, { mode: 0o600 });
