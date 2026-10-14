import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import ganache from 'ganache';
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  hashTypedData,
  encodeFunctionData,
  decodeErrorResult,
  type Address,
  type Hex,
  type EIP1193Provider,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { authorizationTypes, idHash, itemsHash, type ExecutionItem } from '@splitt/core';
// @ts-expect-error The local compiler is a JavaScript CLI as well as a test helper.
import { compile } from '../scripts/compile-contracts.mjs';
const chain = defineChain({
  id: 5042002,
  name: 'Local Arc test harness',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['http://localhost'] } },
});
const unit = 1000000n;
const pid = idHash('P1');
const p2 = idHash('P2');
const a = idHash('A');
const b = idHash('B');
let artifacts: ReturnType<typeof compile>;
let provider: ReturnType<typeof ganache.provider>;
let publicClient: ReturnType<typeof createPublicClient>;
let wallets: ReturnType<typeof createWalletClient>[];
let vault: Address;
let token: Address;
let vaultAbi: any;
let tokenAbi: any;
let snapshot: string;
beforeAll(() => {
  artifacts = compile();
  vaultAbi = artifacts['contracts/src/ProjectVault.sol'].ProjectVault.abi;
  tokenAbi = artifacts['contracts/test/MockUSDC.sol'].MockUSDC.abi;
});
beforeAll(async () => {
  provider = ganache.provider({
    logging: { quiet: true },
    chain: { chainId: 5042002, hardfork: 'shanghai' },
    wallet: { totalAccounts: 5 },
    miner: { instamine: 'eager' },
  });
  const transport = custom(provider as unknown as EIP1193Provider);
  publicClient = createPublicClient({ chain, transport, pollingInterval: 20 });
  wallets = (Object.values(provider.getInitialAccounts()) as { secretKey: string }[]).map(
    (account) =>
      createWalletClient({
        account: privateKeyToAccount(account.secretKey as Hex),
        chain,
        transport,
      }),
  );
  const deploy = async (name: string, file: string, args: unknown[]) => {
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
  token = await deploy('MockUSDC', 'contracts/test/MockUSDC.sol', []);
  vault = await deploy('ProjectVault', 'contracts/src/ProjectVault.sol', [
    token,
    wallets[0].account!.address,
    wallets[1].account!.address,
    0n,
  ]);
  await write(0, 'createProject', [pid, 300n * unit, 1000n * unit, 1500n * unit]);
  await write(0, 'createProject', [p2, 100n * unit, 1000n * unit, 1500n * unit]);
  await write(0, 'addCommitment', [a, pid, wallets[2].account!.address, 700n * unit, false]);
  await write(0, 'addCommitment', [b, pid, wallets[3].account!.address, 500n * unit, true]);
  await write(0, 'mint', [wallets[0].account!.address, 3000n * unit], true);
  await write(0, 'approve', [vault, 3000n * unit], true);
  await write(0, 'deposit', [pid, idHash('invoice'), 1200n * unit]);
  await write(0, 'deposit', [p2, idHash('invoice2'), 1000n * unit]);
  snapshot = (await provider.request({ method: 'evm_snapshot', params: [] })) as string;
});
beforeEach(async () => {
  await provider.request({ method: 'evm_revert', params: [snapshot] });
  snapshot = (await provider.request({ method: 'evm_snapshot', params: [] })) as string;
});
afterAll(async () => {
  await provider?.disconnect();
});
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
async function signed(
  items: ExecutionItem[],
  overrides: Record<string, unknown> = {},
  signerIndex = 0,
) {
  const block = await publicClient.getBlock();
  const auth = {
    planId: idHash('plan'),
    planHash: idHash('facts and plan'),
    projectId: pid,
    projectVersion: 3n,
    deadline: block.timestamp + 3600n,
    ...overrides,
  } as { planId: Hex; planHash: Hex; projectId: Hex; projectVersion: bigint; deadline: bigint };
  const message = { ...auth, itemsHash: itemsHash(items) };
  const domain = { name: 'Splitt', version: '1', chainId: chain.id, verifyingContract: vault };
  const signature = await wallets[signerIndex].signTypedData({
    account: wallets[signerIndex].account!,
    domain,
    types: authorizationTypes,
    primaryType: 'PlanAuthorization',
    message,
  });
  return {
    args: [auth, signature, items],
    digest: hashTypedData({
      domain,
      types: authorizationTypes,
      primaryType: 'PlanAuthorization',
      message,
    }),
  };
}
const batch = (): ExecutionItem[] => [
  { executionId: idHash('execA'), commitmentId: a, amount: 700n * unit },
  { executionId: idHash('execB'), commitmentId: b, amount: 200n * unit },
];
async function expectRevert(index: number, functionName: string, args: unknown[], name: string) {
  let revertData: Hex | undefined;
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
    revertData = (error as { data: Hex }).data;
  }
  expect(revertData, 'Expected an EVM revert with custom error data').toBeDefined();
  expect(decodeErrorResult({ abi: vaultAbi, data: revertData! }).errorName).toBe(name);
}
describe('ProjectVault on a local EVM', () => {
  it('matches TypeScript and Solidity EIP-712 hashes and settles atomically', async () => {
    const signature = await signed(batch());
    expect(await read('authorizationDigest', [signature.args[0], batch()])).toBe(signature.digest);
    await write(1, 'payBatch', signature.args);
    expect((await read('projects', [pid]))[0]).toBe(300n * unit);
    expect((await read('projects', [p2]))[0]).toBe(1000n * unit);
    expect(await read('totalAccounted', [])).toBe(1300n * unit);
    expect(await read('balanceOf', [wallets[2].account!.address], true)).toBe(700n * unit);
  });
  it('rejects replayed plan and execution IDs', async () => {
    const s = await signed(batch());
    await write(1, 'payBatch', s.args);
    await expectRevert(1, 'payBatch', s.args, 'Replay');
  });
  it('rejects operator-created owner authorization', async () => {
    const s = await signed(batch(), {}, 1);
    await expectRevert(1, 'payBatch', s.args, 'InvalidSignature');
  });
  it('rejects a signature after any amount changes', async () => {
    const items = batch();
    const s = await signed(items);
    items[1].amount = 250n * unit;
    await expectRevert(1, 'payBatch', s.args, 'InvalidSignature');
  });
  it('rejects expired and stale approvals', async () => {
    const expired = await signed(batch(), { deadline: 1n });
    await expectRevert(1, 'payBatch', expired.args, 'ExpiredAuthorization');
    const s = await signed(batch());
    await write(0, 'setPolicy', [pid, 300n * unit, 1000n * unit, 1500n * unit]);
    await expectRevert(1, 'payBatch', s.args, 'StalePlan');
  });
  it('rejects reserve breach and forbidden partial payments', async () => {
    const items = batch();
    items[1].amount = 300n * unit;
    await expectRevert(1, 'payBatch', (await signed(items)).args, 'ReserveBreach');
    items[0].amount = 600n * unit;
    await expectRevert(1, 'payBatch', (await signed(items)).args, 'PartialForbidden');
  });
  it('cannot use another project or pay a foreign commitment', async () => {
    const s = await signed(batch(), { projectId: p2, projectVersion: 1n });
    await expectRevert(1, 'payBatch', s.args, 'WrongProject');
  });
  it('rejects duplicated items in a batch', async () => {
    const items = [batch()[0], batch()[0]];
    await expectRevert(1, 'payBatch', (await signed(items)).args, 'InvalidBatch');
  });
  it('rolls back every payment if the second recipient is blocklisted', async () => {
    await write(0, 'blockAddress', [wallets[3].account!.address, true], true);
    const s = await signed(batch());
    const hash = await wallets[1].writeContract({
      account: wallets[1].account!,
      chain,
      address: vault,
      abi: vaultAbi,
      functionName: 'payBatch',
      args: s.args,
      gas: 6000000n,
    });
    expect((await publicClient.waitForTransactionReceipt({ hash })).status).toBe('reverted');
    expect(await read('balanceOf', [wallets[2].account!.address], true)).toBe(0n);
    expect((await read('commitments', [a]))[3]).toBe(0n);
    expect(await read('executedPlan', [idHash('plan')])).toBe(false);
    expect(await read('executed', [idHash('execA')])).toBe(false);
    expect((await read('projects', [pid]))[0]).toBe(1200n * unit);
  });
  it('attributes direct transfers once without double accounting', async () => {
    await write(0, 'transfer', [vault, 100n * unit], true);
    expect(await read('unattributed', [])).toBe(100n * unit);
    const args = [idHash('arrival'), pid, idHash('invoice'), 100n * unit, idHash('evidence')];
    await write(0, 'attribute', args);
    await expectRevert(0, 'attribute', args, 'Replay');
    expect(await read('unattributed', [])).toBe(0n);
    expect(await read('totalAccounted', [])).toBe(await read('balanceOf', [vault], true));
  });
  it('respects pause, revocation, commitment cancellation, and activation delay', async () => {
    const s = await signed(batch());
    await write(0, 'setOperator', ['0x0000000000000000000000000000000000000000']);
    await expectRevert(1, 'payBatch', s.args, 'NotOperator');
    await write(0, 'setOperator', [wallets[1].account!.address]);
    await write(0, 'pause', []);
    await expectRevert(1, 'payBatch', s.args, 'EnforcedPause');
    await write(0, 'unpause', []);
    await write(0, 'setPayeeChangeDelay', [86400n]);
    const cid = idHash('delayed');
    await write(0, 'addCommitment', [cid, pid, wallets[4].account!.address, unit, true]);
    const items = [{ executionId: idHash('delayedexec'), commitmentId: cid, amount: unit }];
    await expectRevert(
      1,
      'payBatch',
      (await signed(items, { projectVersion: 4n })).args,
      'IneligibleCommitment',
    );
  });
  it('operator cannot withdraw funds or alter policy', async () => {
    await expectRevert(
      1,
      'ownerWithdraw',
      [pid, unit, wallets[1].account!.address],
      'OwnableUnauthorizedAccount',
    );
    await expectRevert(
      1,
      'setPolicy',
      [pid, 0n, 1000n * unit, 1500n * unit],
      'OwnableUnauthorizedAccount',
    );
  });
  it('enforces caps after policy reduction without arithmetic underflow', async () => {
    await write(1, 'payBatch', (await signed(batch())).args);
    await write(0, 'deposit', [pid, idHash('remainder'), 500n * unit]);
    await write(0, 'setPolicy', [pid, 300n * unit, 300n * unit, 500n * unit]);
    const items = [{ executionId: idHash('fresh'), commitmentId: b, amount: 100n * unit }];
    await expectRevert(
      1,
      'payBatch',
      (await signed(items, { planId: idHash('freshplan'), projectVersion: 4n })).args,
      'DailyCapExceeded',
    );
  });
  it('keeps accounting exact through partial payments and owner recovery', async () => {
    const originalP2 = (await read('projects', [p2]))[0];
    for (let i = 0; i < 5; i++) {
      const amount = BigInt(13 + i * 7) * unit;
      const items = [{ executionId: idHash(`part-${i}`), commitmentId: b, amount }];
      await write(1, 'payBatch', (await signed(items, { planId: idHash(`plan-${i}`) })).args);
      const p1Balance = (await read('projects', [pid]))[0];
      expect(p1Balance).toBeGreaterThanOrEqual(300n * unit);
      expect(await read('totalAccounted', [])).toBe(p1Balance + originalP2);
      expect(await read('balanceOf', [vault], true)).toBe(await read('totalAccounted', []));
    }
    await write(0, 'ownerWithdraw', [pid, 900n * unit, wallets[0].account!.address]);
    const p1Balance = (await read('projects', [pid]))[0];
    expect(p1Balance).toBeLessThan(300n * unit);
    expect((await read('projects', [p2]))[0]).toBe(originalP2);
    expect(await read('totalAccounted', [])).toBe(p1Balance + originalP2);
  });
});
