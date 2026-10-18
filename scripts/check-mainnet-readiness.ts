import { createPublicClient, erc20Abi, getAddress, http, isAddress } from 'viem';
import { arc } from 'viem/chains';

const USDC = '0x3600000000000000000000000000000000000000' as const;
const RPC = process.env.ARC_MAINNET_RPC_URL ?? 'https://rpc.mainnet.arc.io';
const address = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  if (!isAddress(value)) throw new Error(`${name} is not a valid EVM address.`);
  return getAddress(value);
};

const client = createPublicClient({
  chain: arc,
  transport: http(RPC, { timeout: 15_000, retryCount: 1 }),
});
const owner = address('MAINNET_OWNER_ADDRESS');
const operator = address('MAINNET_OPERATOR_ADDRESS');
const vault = address('MAINNET_VAULT_ADDRESS');
const blockers: string[] = [];

let chainId: number | null = null;
let blockNumber: bigint | null = null;
let decimals: number | null = null;
try {
  [chainId, blockNumber, decimals] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    client.readContract({ address: USDC, abi: erc20Abi, functionName: 'decimals' }),
  ]);
  if (chainId !== 5042) blockers.push(`RPC returned chain ${chainId}; expected Arc Mainnet 5042.`);
  if (decimals !== 6)
    blockers.push(`USDC ERC-20 interface returned ${decimals} decimals; expected 6.`);
} catch {
  blockers.push('Arc Mainnet RPC check failed; verify DNS, egress and the configured endpoint.');
}
if (!owner)
  blockers.push(
    'MAINNET_OWNER_ADDRESS is unset; use a reviewed multisig or policy-controlled owner.',
  );
if (!operator)
  blockers.push('MAINNET_OPERATOR_ADDRESS is unset; provision a separate Circle ARC wallet.');
if (!process.env.MAINNET_CIRCLE_WALLET_ID)
  blockers.push('MAINNET_CIRCLE_WALLET_ID is unset; never reuse the testnet wallet ID.');
if (!process.env.MAINNET_AUDIT_REPORT_URL)
  blockers.push(
    'MAINNET_AUDIT_REPORT_URL is unset; the current contract has not completed an independent audit.',
  );
if (!process.env.MAINNET_RELEASE_APPROVAL)
  blockers.push(
    'MAINNET_RELEASE_APPROVAL is unset; record the reviewed release commit and approvers.',
  );
if (vault && chainId === 5042) {
  try {
    const code = await client.getCode({ address: vault });
    if (!code) blockers.push('MAINNET_VAULT_ADDRESS has no deployed code.');
  } catch {
    blockers.push('The configured mainnet vault could not be verified through the RPC.');
  }
} else blockers.push('MAINNET_VAULT_ADDRESS is unset; deployment has not occurred.');

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      network: 'Arc Mainnet',
      chainId,
      blockNumber: blockNumber === null ? null : String(blockNumber),
      rpc: RPC,
      usdc: USDC,
      erc20Decimals: decimals,
      owner: owner ?? null,
      operator: operator ?? null,
      vault: vault ?? null,
      ready: blockers.length === 0,
      blockers,
      note: 'Read-only preflight. It never deploys a contract, creates a wallet or moves USDC.',
    },
    null,
    2,
  ),
);

if (blockers.length) process.exitCode = 2;
