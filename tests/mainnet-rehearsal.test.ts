/**
 * Mainnet rehearsal with a real Safe v1.4.1 (2-of-3) as the vault owner.
 * Runs on a local chain with Arc Mainnet's chain ID. Set REHEARSAL_FORK_URL to run the same
 * flow against a fork of Arc Mainnet (Safe and a mock USDC are deployed fresh on the fork).
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ganache from 'ganache';
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeErrorResult,
  decodeEventLog,
  defineChain,
  encodeFunctionData,
  hashTypedData,
  zeroAddress,
  type Abi,
  type Address,
  type EIP1193Provider,
  type Hex,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import {
  authorizationTypes,
  combineSafeSignatures,
  idHash,
  itemsHash,
  safeMessageTypedData,
  type ExecutionItem,
} from '@splitt/core';
// @ts-expect-error The local compiler is a JavaScript CLI as well as a test helper.
import { compile } from '../scripts/compile-contracts.mjs';

const safeArtifact = (path: string) =>
  JSON.parse(
    readFileSync(
      `node_modules/@safe-global/safe-contracts/build/artifacts/contracts/${path}`,
      'utf8',
    ),
  ) as {
    abi: Abi;
    bytecode: Hex;
  };
const chain = defineChain({
  id: 5042,
  name: 'Arc Mainnet rehearsal',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['http://localhost'] } },
});
const unit = 1_000_000n;
const projectId = idHash('rehearsal-project');
const fullId = idHash('rehearsal-maya'),
  partialId = idHash('rehearsal-leo');

let provider: ReturnType<typeof ganache.provider>;
let client: ReturnType<typeof createPublicClient>;
let accounts: PrivateKeyAccount[];
let wallets: ReturnType<typeof createWalletClient>[];
let artifacts: any;
let safe: Address, vault: Address, token: Address;
let signers: PrivateKeyAccount[]; // the three Safe members
const safeAbi = safeArtifact('Safe.sol/Safe.json').abi;

async function deploy(i: number, abi: Abi, bytecode: Hex, args: unknown[] = []) {
  const hash = await wallets[i].deployContract({
    account: accounts[i],
    chain,
    abi,
    bytecode,
    args,
  });
  return (await client.waitForTransactionReceipt({ hash })).contractAddress!;
}
async function send(i: number, to: Address, abi: Abi, functionName: string, args: unknown[]) {
  const hash = await wallets[i].writeContract({
    account: accounts[i],
    chain,
    address: to,
    abi,
    functionName,
    args,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`${functionName} reverted`);
  return receipt;
}
const vaultAbi = () => artifacts['contracts/src/ProjectVaultV2.sol'].ProjectVaultV2.abi as Abi;
const tokenAbi = () => artifacts['contracts/test/MockUSDC.sol'].MockUSDC.abi as Abi;
const read = (address: Address, abi: Abi, functionName: string, args: unknown[] = []) =>
  client.readContract({ address, abi, functionName, args }) as Promise<any>;

/** Runs a vault call as the Safe: members sign the Safe transaction hash, anyone executes. */
async function asSafe(
  functionName: string,
  args: unknown[],
  by = [0, 1],
  target = vault,
  abi = vaultAbi(),
) {
  const data = encodeFunctionData({ abi, functionName, args });
  const nonce = await read(safe, safeAbi, 'nonce');
  const txHash = (await read(safe, safeAbi, 'getTransactionHash', [
    target,
    0n,
    data,
    0,
    0n,
    0n,
    0n,
    zeroAddress,
    zeroAddress,
    nonce,
  ])) as Hex;
  const sigs = Object.fromEntries(
    await Promise.all(
      by.map(async (i) => [signers[i].address, await signers[i].sign({ hash: txHash })]),
    ),
  );
  const signatures = combineSafeSignatures(sigs, by.length);
  return send(5, safe, safeAbi, 'execTransaction', [
    target,
    0n,
    data,
    0,
    0n,
    0n,
    0n,
    zeroAddress,
    zeroAddress,
    signatures,
  ]);
}

/** The exact batch a Splitt owner approves, as the Safe members sign it. */
async function batch(plan: string, items: ExecutionItem[], version: bigint) {
  const block = await client.getBlock();
  const message = {
    planId: idHash(plan),
    planHash: idHash(`${plan}-facts`),
    projectId,
    projectVersion: version,
    deadline: block.timestamp + 900n,
    itemsHash: itemsHash(items),
  };
  const typed = {
    domain: { name: 'Splitt', version: '2', chainId: chain.id, verifyingContract: vault },
    types: authorizationTypes,
    primaryType: 'PlanAuthorization' as const,
    message,
  };
  const digest = hashTypedData(typed);
  const sign = async (who: number[]) =>
    combineSafeSignatures(
      Object.fromEntries(
        await Promise.all(
          who.map(async (i) => [
            signers[i].address,
            await signers[i].signTypedData(safeMessageTypedData(safe, chain.id, digest)),
          ]),
        ),
      ),
      who.length,
    );
  const { itemsHash: _, ...authorization } = message;
  return { typed, digest, sign, authorization, items };
}
async function revertName(from: Address, functionName: string, args: unknown[]) {
  try {
    await provider.request({
      method: 'eth_call',
      params: [
        { from, to: vault, data: encodeFunctionData({ abi: vaultAbi(), functionName, args }) },
        'latest',
      ],
    });
  } catch (error) {
    return decodeErrorResult({ abi: vaultAbi(), data: (error as { data: Hex }).data }).errorName;
  }
  return 'no revert';
}

beforeAll(async () => {
  artifacts = compile(true);
  provider = ganache.provider({
    logging: { quiet: true },
    chain: { chainId: 5042, hardfork: 'shanghai' },
    wallet: { totalAccounts: 9 },
    miner: { instamine: 'eager' },
    ...(process.env.REHEARSAL_FORK_URL ? { fork: { url: process.env.REHEARSAL_FORK_URL } } : {}),
  });
  const transport = custom(provider as unknown as EIP1193Provider);
  client = createPublicClient({ chain, transport, pollingInterval: 20 });
  accounts = (Object.values(provider.getInitialAccounts()) as { secretKey: Hex }[]).map((a) =>
    privateKeyToAccount(a.secretKey),
  );
  wallets = accounts.map((account) => createWalletClient({ account, chain, transport }));
  signers = [accounts[1], accounts[2], accounts[3]];

  const singleton = safeArtifact('Safe.sol/Safe.json');
  const factory = safeArtifact('proxies/SafeProxyFactory.sol/SafeProxyFactory.json');
  const handler = safeArtifact(
    'handler/CompatibilityFallbackHandler.sol/CompatibilityFallbackHandler.json',
  );
  const [singletonAt, factoryAt, handlerAt] = [
    await deploy(0, singleton.abi, singleton.bytecode),
    await deploy(0, factory.abi, factory.bytecode),
    await deploy(0, handler.abi, handler.bytecode),
  ];
  const setup = encodeFunctionData({
    abi: singleton.abi,
    functionName: 'setup',
    args: [
      signers.map((s) => s.address),
      2n,
      zeroAddress,
      '0x',
      handlerAt,
      zeroAddress,
      0n,
      zeroAddress,
    ],
  });
  const created = await send(0, factoryAt, factory.abi, 'createProxyWithNonce', [
    singletonAt,
    setup,
    1n,
  ]);
  safe = (
    created.logs
      .map((log) => {
        try {
          return decodeEventLog({ abi: factory.abi, data: log.data, topics: log.topics });
        } catch {
          return undefined;
        }
      })
      .find((e) => e?.eventName === 'ProxyCreation')!.args as unknown as { proxy: Address }
  ).proxy;

  const mock = artifacts['contracts/test/MockUSDC.sol'].MockUSDC;
  token = await deploy(0, mock.abi, `0x${mock.evm.bytecode.object}`);
  const v2 = artifacts['contracts/src/ProjectVaultV2.sol'].ProjectVaultV2;
  vault = await deploy(0, v2.abi, `0x${v2.evm.bytecode.object}`, [
    token,
    safe,
    accounts[4].address,
    86_400n,
  ]);
}, 120_000);
afterAll(async () => provider?.disconnect());

describe('Arc Mainnet rehearsal with a real 2-of-3 Safe owner', () => {
  it('runs the owner setup through Safe transactions', async () => {
    expect(await read(safe, safeAbi, 'getThreshold')).toBe(2n);
    expect((await read(vault, vaultAbi(), 'owner')).toLowerCase()).toBe(safe.toLowerCase());
    await asSafe('createProject', [projectId, 300n * unit, 1_000n * unit, 2_000n * unit]);
    await asSafe('addCommitment', [fullId, projectId, accounts[6].address, 700n * unit, false]);
    await asSafe('addCommitment', [partialId, projectId, accounts[7].address, 500n * unit, true]);
    await send(5, token, tokenAbi(), 'mint', [accounts[5].address, 2_000n * unit]);
    await send(5, token, tokenAbi(), 'approve', [vault, 2_000n * unit]);
    await send(5, vault, vaultAbi(), 'deposit', [projectId, idHash('invoice-1'), 1_200n * unit]);
    expect((await read(vault, vaultAbi(), 'projects', [projectId]))[0]).toBe(1_200n * unit);
    // A single Safe member cannot act alone.
    await expect(asSafe('pause', [], [0])).rejects.toThrow();
  });

  it('pays a batch only with two Safe signatures, and the API check agrees with the contract', async () => {
    await provider.request({ method: 'evm_increaseTime', params: [86_401] });
    await provider.request({ method: 'evm_mine', params: [] });
    const items = [
      { executionId: idHash('pay-maya'), commitmentId: fullId, amount: 700n * unit },
      { executionId: idHash('pay-leo'), commitmentId: partialId, amount: 200n * unit },
    ];
    const b = await batch('plan-1', items, 3n);
    expect(await read(vault, vaultAbi(), 'authorizationDigest', [b.authorization, items])).toBe(
      b.digest,
    );

    const one = await b.sign([2]);
    expect(await client.verifyTypedData({ ...b.typed, address: safe, signature: one })).toBe(false);
    expect(await revertName(accounts[4].address, 'payBatch', [b.authorization, one, items])).toBe(
      'InvalidSignature',
    );

    const two = await b.sign([2, 0]);
    expect(await client.verifyTypedData({ ...b.typed, address: safe, signature: two })).toBe(true);
    await send(4, vault, vaultAbi(), 'payBatch', [b.authorization, two, items]);
    expect(await read(token, tokenAbi(), 'balanceOf', [accounts[6].address])).toBe(700n * unit);
    expect(await read(token, tokenAbi(), 'balanceOf', [accounts[7].address])).toBe(200n * unit);
    expect((await read(vault, vaultAbi(), 'projects', [projectId]))[0]).toBe(300n * unit);
    // The same approval can never be used twice.
    expect(await revertName(accounts[4].address, 'payBatch', [b.authorization, two, items])).toBe(
      'Replay',
    );
  });

  it('pauses, revokes the operator, protects the reserve and hands ownership over in two steps', async () => {
    await asSafe('pause', []);
    const items = [
      { executionId: idHash('pay-leo-2'), commitmentId: partialId, amount: 100n * unit },
    ];
    await send(5, vault, vaultAbi(), 'deposit', [projectId, idHash('invoice-2'), 800n * unit]);
    const b = await batch('plan-2', items, 3n);
    expect(
      await revertName(accounts[4].address, 'payBatch', [
        b.authorization,
        await b.sign([0, 1]),
        items,
      ]),
    ).toBe('EnforcedPause');
    await asSafe('unpause', []);

    await asSafe('setOperator', [zeroAddress]);
    expect(
      await revertName(accounts[4].address, 'payBatch', [
        b.authorization,
        await b.sign([0, 1]),
        items,
      ]),
    ).toBe('NotOperator');
    await asSafe('setOperator', [accounts[4].address]);

    // Balance is 1,100 with a 300 reserve: 801 out is refused, 800 is allowed.
    await expect(asSafe('ownerWithdraw', [projectId, 801n * unit, safe])).rejects.toThrow();
    await asSafe('ownerWithdraw', [projectId, 800n * unit, safe]);
    expect((await read(vault, vaultAbi(), 'projects', [projectId]))[0]).toBe(300n * unit);

    const next = accounts[8].address;
    await asSafe('transferOwnership', [next]);
    expect((await read(vault, vaultAbi(), 'owner')).toLowerCase()).toBe(safe.toLowerCase());
    await send(8, vault, vaultAbi(), 'acceptOwnership', []);
    expect((await read(vault, vaultAbi(), 'owner')).toLowerCase()).toBe(next.toLowerCase());
  });
});
