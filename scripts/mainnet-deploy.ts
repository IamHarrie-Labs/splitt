import {
  getContractAddress,
  isAddress,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';

export const MAINNET_CHAIN_ID = 5042;
export const MIN_PAYEE_DELAY = 86_400n;
const USDC: Address = '0x3600000000000000000000000000000000000000';

export const v2ReadAbi = parseAbi([
  'function owner() view returns (address)',
  'function operator() view returns (address)',
  'function usdc() view returns (address)',
  'function minimumPayeeChangeDelay() view returns (uint64)',
  'function paused() view returns (bool)',
  'function eip712Domain() view returns (bytes1 fields,string name,string version,uint256 chainId,address verifyingContract,bytes32 salt,uint256[] extensions)',
]);

type ImmutableRefs = Record<string, { start: number; length: number }[]>;
export type V2Artifact = {
  abi: unknown[];
  evm: {
    bytecode: { object: string };
    deployedBytecode: { object: string; immutableReferences: ImmutableRefs };
  };
};
export type Manifest = { creationCodeHash: Hex; runtimeTemplateHash: Hex };

export type DeployInputs = {
  owner?: string;
  operator?: string;
  payeeDelaySeconds?: string;
  auditReportUrl?: string;
  /** Commit the auditor reviewed, and the commit and cleanliness of the checkout running this. */
  releaseCommit?: string;
  headCommit?: string;
  dirtyTree?: boolean;
};

export type DeployPlan = {
  ready: boolean;
  blockers: string[];
  chainId: number;
  deployer: Address;
  predictedVault?: Address;
  owner?: Address;
  operator?: Address;
  payeeDelaySeconds: string;
  creationCodeHash: Hex;
  args?: [Address, Address, Address, bigint];
};

/** Every check that must pass before a mainnet deployment is sent. Read-only. */
export async function planDeployment(
  client: PublicClient,
  deployer: Address,
  artifact: V2Artifact,
  manifest: Manifest,
  inputs: DeployInputs,
): Promise<DeployPlan> {
  const blockers: string[] = [];
  const chainId = await client.getChainId();
  if (chainId !== MAINNET_CHAIN_ID)
    blockers.push(`RPC is chain ${chainId}; mainnet deploys only to Arc Mainnet (5042).`);

  const owner = inputs.owner && isAddress(inputs.owner) ? inputs.owner : undefined;
  const operator = inputs.operator && isAddress(inputs.operator) ? inputs.operator : undefined;
  if (!owner) blockers.push('MAINNET_OWNER_ADDRESS must be the Safe (multisig) address.');
  else if (!(await client.getCode({ address: owner })))
    blockers.push(
      'MAINNET_OWNER_ADDRESS has no contract code; the mainnet owner must be a multisig.',
    );
  if (!operator)
    blockers.push('MAINNET_OPERATOR_ADDRESS must be the Circle ARC operator wallet address.');
  if (owner && operator && owner.toLowerCase() === operator.toLowerCase())
    blockers.push('Owner and operator must be different addresses.');
  if (owner && owner.toLowerCase() === deployer.toLowerCase())
    blockers.push('The deployer key must not be the owner.');

  const delay = inputs.payeeDelaySeconds?.trim() || String(MIN_PAYEE_DELAY);
  if (!/^\d+$/.test(delay) || BigInt(delay) < MIN_PAYEE_DELAY)
    blockers.push('MAINNET_PAYEE_DELAY_SECONDS must be at least 86400 (24 hours).');

  try {
    if (new URL(inputs.auditReportUrl ?? '').protocol !== 'https:') throw new Error();
  } catch {
    blockers.push('MAINNET_AUDIT_REPORT_URL must link to the published audit report (https).');
  }
  if (!inputs.releaseCommit || !/^[0-9a-f]{40}$/i.test(inputs.releaseCommit))
    blockers.push('MAINNET_RELEASE_COMMIT must be the audited 40-character commit.');
  else if (inputs.headCommit && inputs.headCommit !== inputs.releaseCommit)
    blockers.push('The checkout is not at MAINNET_RELEASE_COMMIT.');
  if (inputs.dirtyTree) blockers.push('The checkout has uncommitted changes.');

  const creationCodeHash = keccak256(`0x${artifact.evm.bytecode.object}`);
  if (creationCodeHash !== manifest.creationCodeHash)
    blockers.push('Compiled bytecode differs from docs/mainnet-candidate.json, the audited build.');
  if (keccak256(`0x${artifact.evm.deployedBytecode.object}`) !== manifest.runtimeTemplateHash)
    blockers.push('Compiled runtime template differs from docs/mainnet-candidate.json.');

  if ((await client.getBalance({ address: deployer })) === 0n)
    blockers.push('The deployer has no USDC for gas.');
  const nonce = await client.getTransactionCount({ address: deployer, blockTag: 'pending' });
  return {
    ready: blockers.length === 0,
    blockers,
    chainId,
    deployer,
    predictedVault: getContractAddress({ from: deployer, nonce: BigInt(nonce) }),
    owner,
    operator,
    payeeDelaySeconds: delay,
    creationCodeHash,
    args: owner && operator ? [USDC, owner, operator, BigInt(delay)] : undefined,
  };
}

/** True when `runtime` is the audited template with only its immutable slots filled in. */
export function matchesTemplate(runtime: Hex, template: string, refs: ImmutableRefs) {
  const bytes = Buffer.from(runtime.slice(2), 'hex');
  const expected = Buffer.from(template.replace(/^0x/, ''), 'hex');
  if (bytes.length !== expected.length) return false;
  for (const ranges of Object.values(refs))
    for (const { start, length } of ranges) bytes.fill(0, start, start + length);
  return bytes.equals(expected);
}

export type Journal = (entry: Record<string, unknown>) => Promise<void>;

/** Sends the deployment, journals it before waiting, then verifies code and every constructor value. */
export async function deployVault(
  client: PublicClient,
  wallet: WalletClient,
  artifact: V2Artifact,
  plan: DeployPlan,
  journal: Journal,
) {
  if (!plan.ready || !plan.args || !wallet.account)
    throw new Error('Deployment plan is not ready.');
  const hash = await wallet.deployContract({
    account: wallet.account,
    chain: wallet.chain,
    abi: artifact.abi,
    bytecode: `0x${artifact.evm.bytecode.object}`,
    args: plan.args,
  });
  await journal({ status: 'pending', txHash: hash, predictedVault: plan.predictedVault });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success' || !receipt.contractAddress)
    throw new Error('Deployment reverted.');
  const vault = receipt.contractAddress;
  const runtime = await client.getCode({ address: vault });
  if (!runtime) throw new Error('Deployed vault has no code.');
  const read = <T extends Parameters<typeof client.readContract>[0]['functionName']>(
    functionName: T,
  ) => client.readContract({ address: vault, abi: v2ReadAbi, functionName: functionName as never });
  const [owner, operator, usdc, delay, paused, domain] = (await Promise.all([
    read('owner'),
    read('operator'),
    read('usdc'),
    read('minimumPayeeChangeDelay'),
    read('paused'),
    read('eip712Domain'),
  ])) as [
    Address,
    Address,
    Address,
    bigint,
    boolean,
    readonly [Hex, string, string, bigint, Address, Hex, bigint[]],
  ];
  const [token, initialOwner, initialOperator, delaySeconds] = plan.args;
  const problems = [
    !matchesTemplate(
      runtime,
      artifact.evm.deployedBytecode.object,
      artifact.evm.deployedBytecode.immutableReferences,
    ) && 'runtime code differs from the audited template',
    owner.toLowerCase() !== initialOwner.toLowerCase() && 'owner',
    operator.toLowerCase() !== initialOperator.toLowerCase() && 'operator',
    usdc.toLowerCase() !== token.toLowerCase() && 'usdc',
    delay !== delaySeconds && 'payee delay',
    paused && 'vault starts paused',
    (domain[1] !== 'Splitt' ||
      domain[2] !== '2' ||
      domain[3] !== BigInt(plan.chainId) ||
      domain[4].toLowerCase() !== vault.toLowerCase()) &&
      'EIP-712 domain',
  ].filter(Boolean);
  const result = {
    status: problems.length ? 'verification_failed' : 'verified',
    problems,
    vault,
    txHash: hash,
    deploymentBlock: String(receipt.blockNumber),
    chainId: plan.chainId,
    owner,
    operator,
    payeeDelaySeconds: String(delay),
    runtimeCodeHash: keccak256(runtime),
    creationCodeHash: plan.creationCodeHash,
  };
  await journal(result);
  if (problems.length)
    throw new Error(`Deployed vault failed verification: ${problems.join(', ')}.`);
  return result;
}
