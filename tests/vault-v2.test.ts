import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import ganache from 'ganache';
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeErrorResult,
  defineChain,
  encodeFunctionData,
  type Address,
  type EIP1193Provider,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { authorizationTypes, idHash, itemsHash, type ExecutionItem } from '@splitt/core';
// @ts-expect-error The local compiler is a JavaScript CLI as well as a test helper.
import { compile } from '../scripts/compile-contracts.mjs';

const chain = defineChain({
  id: 5042,
  name: 'Local Arc mainnet-candidate harness',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['http://localhost'] } },
});
const unit = 1_000_000n;
const projectId = idHash('mainnet-candidate-project');
const commitmentId = idHash('mainnet-candidate-commitment');

let provider: ReturnType<typeof ganache.provider>;
let publicClient: ReturnType<typeof createPublicClient>;
let wallets: ReturnType<typeof createWalletClient>[];
let vault: Address;
let token: Address;
let vaultAbi: any;
let tokenAbi: any;
let snapshot: string;
let deploy: (file: string, name: string, args: unknown[]) => Promise<Address>;
let artifacts: any;

beforeAll(async () => {
  artifacts = compile();
  vaultAbi = artifacts['contracts/src/ProjectVaultV2.sol'].ProjectVaultV2.abi;
  tokenAbi = artifacts['contracts/test/MockUSDC.sol'].MockUSDC.abi;
  provider = ganache.provider({
    logging: { quiet: true },
    chain: { chainId: 5042, hardfork: 'shanghai' },
    wallet: { totalAccounts: 5 },
    miner: { instamine: 'eager' },
  });
  const transport = custom(provider as unknown as EIP1193Provider);
  publicClient = createPublicClient({ chain, transport, pollingInterval: 20 });
  wallets = (Object.values(provider.getInitialAccounts()) as { secretKey: string }[]).map(
    ({ secretKey }) =>
      createWalletClient({ account: privateKeyToAccount(secretKey as Hex), chain, transport }),
  );
  deploy = async (file: string, name: string, args: unknown[]) => {
    const artifact = artifacts[file][name];
    const hash = await wallets[0].deployContract({
      account: wallets[0].account!,
      chain,
      abi: artifact.abi,
      bytecode: `0x${artifact.evm.bytecode.object}`,
      args,
    });
    return (await publicClient.waitForTransactionReceipt({ hash })).contractAddress!;
  };
  token = await deploy('contracts/test/MockUSDC.sol', 'MockUSDC', []);
  vault = await deploy('contracts/src/ProjectVaultV2.sol', 'ProjectVaultV2', [
    token,
    wallets[0].account!.address,
    wallets[1].account!.address,
    300n,
  ]);
  await write(0, 'createProject', [projectId, 300n * unit, 1_000n * unit, 2_000n * unit]);
  await write(0, 'addCommitment', [
    commitmentId,
    projectId,
    wallets[2].account!.address,
    900n * unit,
    true,
  ]);
  await write(0, 'mint', [wallets[0].account!.address, 2_000n * unit], true);
  await write(0, 'approve', [vault, 2_000n * unit], true);
  await write(0, 'deposit', [projectId, idHash('invoice'), 1_200n * unit]);
  snapshot = (await provider.request({ method: 'evm_snapshot', params: [] })) as string;
});

beforeEach(async () => {
  await provider.request({ method: 'evm_revert', params: [snapshot] });
  snapshot = (await provider.request({ method: 'evm_snapshot', params: [] })) as string;
});

afterAll(async () => provider?.disconnect());

async function write(index: number, functionName: string, args: unknown[], isToken = false) {
  const hash = await wallets[index].writeContract({
    account: wallets[index].account!,
    chain,
    address: isToken ? token : vault,
    abi: isToken ? tokenAbi : vaultAbi,
    functionName,
    args,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('Transaction reverted');
  return receipt;
}

async function read(functionName: string, args: unknown[], isToken = false): Promise<any> {
  return publicClient.readContract({
    address: isToken ? token : vault,
    abi: isToken ? tokenAbi : vaultAbi,
    functionName,
    args,
  });
}

async function expectRevert(index: number, functionName: string, args: unknown[], name: string) {
  let data: Hex | undefined;
  try {
    await provider.request({
      method: 'eth_call',
      params: [
        {
          from: wallets[index].account!.address,
          to: vault,
          data: encodeFunctionData({ abi: vaultAbi, functionName, args }),
        },
        'latest',
      ],
    });
  } catch (error) {
    data = (error as { data: Hex }).data;
  }
  expect(data).toBeDefined();
  expect(decodeErrorResult({ abi: vaultAbi, data: data! }).errorName).toBe(name);
}

async function approval(item: ExecutionItem, plan: string, signer = 0) {
  const block = await publicClient.getBlock();
  const message = {
    planId: idHash(plan),
    planHash: idHash(`${plan}-facts`),
    projectId,
    projectVersion: 2n,
    deadline: block.timestamp + 600n,
    itemsHash: itemsHash([item]),
  };
  const signature = await wallets[signer].signTypedData({
    account: wallets[signer].account!,
    domain: { name: 'Splitt', version: '2', chainId: chain.id, verifyingContract: vault },
    types: authorizationTypes,
    primaryType: 'PlanAuthorization',
    message,
  });
  const { itemsHash: _, ...authorization } = message;
  return [authorization, signature, [item]];
}

describe('ProjectVaultV2 mainnet candidate', () => {
  it('uses an immutable nonzero payee delay', async () => {
    expect(await read('minimumPayeeChangeDelay', [])).toBe(300n);
    expect(vaultAbi.some((entry: { name?: string }) => entry.name === 'setPayeeChangeDelay')).toBe(
      false,
    );
  });

  it('prevents the owner from withdrawing through the protected reserve', async () => {
    await expectRevert(
      0,
      'ownerWithdraw',
      [projectId, 901n * unit, wallets[0].account!.address],
      'ReserveBreach',
    );
    await write(0, 'ownerWithdraw', [projectId, 900n * unit, wallets[0].account!.address]);
    expect((await read('projects', [projectId]))[0]).toBe(300n * unit);
  });

  it('rejects payment before recipient activation and settles after the delay', async () => {
    const item = { executionId: idHash('delayed-payment'), commitmentId, amount: 100n * unit };
    const args = await approval(item, 'delayed-plan');
    await expectRevert(1, 'payBatch', args, 'IneligibleCommitment');
    await provider.request({ method: 'evm_increaseTime', params: [301] });
    await provider.request({ method: 'evm_mine', params: [] });
    await write(1, 'payBatch', args);
    expect(await read('balanceOf', [wallets[2].account!.address], true)).toBe(100n * unit);
  });

  it('preserves conservation across varied valid payments', async () => {
    await provider.request({ method: 'evm_increaseTime', params: [301] });
    await provider.request({ method: 'evm_mine', params: [] });
    for (const [index, amount] of [17n, 23n, 31n, 43n].entries()) {
      const item = {
        executionId: idHash(`conservation-${index}`),
        commitmentId,
        amount: amount * unit,
      };
      await write(1, 'payBatch', await approval(item, `conservation-plan-${index}`));
      expect(await read('totalAccounted', [])).toBe(await read('balanceOf', [vault], true));
      expect((await read('projects', [projectId]))[0]).toBeGreaterThanOrEqual(300n * unit);
    }
  });

  it('stops operator payouts while paused and resumes only after the owner unpauses', async () => {
    await provider.request({ method: 'evm_increaseTime', params: [301] });
    await provider.request({ method: 'evm_mine', params: [] });
    const item = { executionId: idHash('paused-payment'), commitmentId, amount: 25n * unit };
    const args = await approval(item, 'paused-plan');
    await write(0, 'pause', []);
    await expectRevert(1, 'payBatch', args, 'EnforcedPause');
    await write(0, 'unpause', []);
    await write(1, 'payBatch', args);
    expect(await read('balanceOf', [wallets[2].account!.address], true)).toBe(25n * unit);
  });

  it('lets the owner revoke the operator without changing custody', async () => {
    await write(0, 'setOperator', ['0x0000000000000000000000000000000000000000']);
    expect(await read('operator', [])).toBe('0x0000000000000000000000000000000000000000');
    expect(await read('totalAccounted', [])).toBe(1_200n * unit);
    const item = { executionId: idHash('revoked-payment'), commitmentId, amount: 25n * unit };
    await expectRevert(1, 'payBatch', await approval(item, 'revoked-plan'), 'NotOperator');
  });

  it('requires the next owner to accept a two-step ownership transfer', async () => {
    const nextOwner = wallets[3].account!.address;
    await write(0, 'transferOwnership', [nextOwner]);
    expect(await read('owner', [])).toBe(wallets[0].account!.address);
    expect(await read('pendingOwner', [])).toBe(nextOwner);
    await write(3, 'acceptOwnership', []);
    expect(await read('owner', [])).toBe(nextOwner);
    expect(await read('pendingOwner', [])).toBe('0x0000000000000000000000000000000000000000');
  });

  it('accepts plans signed through an ERC-1271 multisig owner', async () => {
    const multisig = await deploy('contracts/test/MockMultisigOwner.sol', 'MockMultisigOwner', [
      wallets[3].account!.address,
    ]);
    const multisigAbi = artifacts['contracts/test/MockMultisigOwner.sol'].MockMultisigOwner.abi;
    await write(0, 'transferOwnership', [multisig]);
    const hash = await wallets[3].writeContract({
      account: wallets[3].account!,
      chain,
      address: multisig,
      abi: multisigAbi,
      functionName: 'execute',
      args: [vault, encodeFunctionData({ abi: vaultAbi, functionName: 'acceptOwnership' })],
    });
    expect((await publicClient.waitForTransactionReceipt({ hash })).status).toBe('success');
    expect((await read('owner', [])).toLowerCase()).toBe(multisig.toLowerCase());
    await provider.request({ method: 'evm_increaseTime', params: [301] });
    await provider.request({ method: 'evm_mine', params: [] });
    const item = { executionId: idHash('multisig-payment'), commitmentId, amount: 40n * unit };
    await expectRevert(1, 'payBatch', await approval(item, 'multisig-plan', 0), 'InvalidSignature');
    await expectRevert(1, 'payBatch', await approval(item, 'multisig-plan', 4), 'InvalidSignature');
    await write(1, 'payBatch', await approval(item, 'multisig-plan', 3));
    expect(await read('balanceOf', [wallets[2].account!.address], true)).toBe(40n * unit);
  });
});
