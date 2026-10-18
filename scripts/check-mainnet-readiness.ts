import { createPublicClient, erc20Abi, getAddress, http, isAddress, keccak256 } from 'viem';
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
const httpsUrl = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error();
    return url.toString();
  } catch {
    blockers.push(`${name} must be a valid HTTPS URL.`);
    return undefined;
  }
};
const auditReport = httpsUrl('MAINNET_AUDIT_REPORT_URL');
const releaseCommit = process.env.MAINNET_RELEASE_COMMIT?.trim();
const releaseApprovers = process.env.MAINNET_RELEASE_APPROVERS?.trim();
const expectedCodeHash = process.env.MAINNET_EXPECTED_RUNTIME_CODE_HASH?.trim();

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
if (owner && operator && owner === operator)
  blockers.push('Mainnet owner and Circle operator must be separate addresses.');
if (!process.env.MAINNET_CIRCLE_WALLET_ID)
  blockers.push('MAINNET_CIRCLE_WALLET_ID is unset; never reuse the testnet wallet ID.');
if (!auditReport)
  blockers.push(
    'MAINNET_AUDIT_REPORT_URL is missing or invalid; the candidate needs an independent audit.',
  );
if (!releaseCommit || !/^[0-9a-f]{40}$/i.test(releaseCommit))
  blockers.push('MAINNET_RELEASE_COMMIT must be the reviewed 40-character Git commit SHA.');
if (!releaseApprovers)
  blockers.push('MAINNET_RELEASE_APPROVERS is unset; record the human release approvers.');
if (!expectedCodeHash || !/^0x[0-9a-f]{64}$/i.test(expectedCodeHash))
  blockers.push('MAINNET_EXPECTED_RUNTIME_CODE_HASH must be the audited runtime bytecode hash.');
if (vault && chainId === 5042) {
  try {
    const code = await client.getCode({ address: vault });
    if (!code) blockers.push('MAINNET_VAULT_ADDRESS has no deployed code.');
    else if (expectedCodeHash && keccak256(code) !== expectedCodeHash.toLowerCase())
      blockers.push('The deployed vault runtime bytecode does not match the audited code hash.');
    const candidateAbi = [
      { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
      { type: 'function', name: 'operator', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
      { type: 'function', name: 'usdc', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
      { type: 'function', name: 'minimumPayeeChangeDelay', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] },
    ] as const;
    const [deployedOwner, deployedOperator, deployedUsdc, minimumDelay] = await Promise.all([
      client.readContract({ address: vault, abi: candidateAbi, functionName: 'owner' }),
      client.readContract({ address: vault, abi: candidateAbi, functionName: 'operator' }),
      client.readContract({ address: vault, abi: candidateAbi, functionName: 'usdc' }),
      client.readContract({ address: vault, abi: candidateAbi, functionName: 'minimumPayeeChangeDelay' }),
    ]);
    if (owner && deployedOwner !== owner) blockers.push('Deployed vault owner differs from MAINNET_OWNER_ADDRESS.');
    if (operator && deployedOperator !== operator) blockers.push('Deployed vault operator differs from MAINNET_OPERATOR_ADDRESS.');
    if (deployedUsdc.toLowerCase() !== USDC) blockers.push('Deployed vault token is not Arc Mainnet USDC.');
    if (minimumDelay < 86_400n) blockers.push('Mainnet payee activation delay must be at least 24 hours.');
  } catch {
    blockers.push('The configured mainnet V2 vault could not be fully verified through the RPC.');
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
      auditReport: auditReport ?? null,
      releaseCommit: releaseCommit ?? null,
      expectedRuntimeCodeHash: expectedCodeHash ?? null,
      ready: blockers.length === 0,
      blockers,
      note: 'Read-only preflight. It never deploys a contract, creates a wallet or moves USDC.',
    },
    null,
    2,
  ),
);

if (blockers.length) process.exitCode = 2;
