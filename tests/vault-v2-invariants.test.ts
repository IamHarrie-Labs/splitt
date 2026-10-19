/**
 * Randomised operation sequences against ProjectVaultV2, checking accounting invariants after
 * every step. The seed is fixed so a failure reproduces; set VAULT_FUZZ_SEED and VAULT_FUZZ_STEPS
 * to explore further.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ganache from 'ganache';
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  type Abi,
  type Address,
  type EIP1193Provider,
  type Hex,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { authorizationTypes, idHash, itemsHash } from '@splitt/core';
// @ts-expect-error The local compiler is a JavaScript CLI as well as a test helper.
import { compile } from '../scripts/compile-contracts.mjs';

const chain = defineChain({
  id: 5042,
  name: 'Local invariant harness',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['http://localhost'] } },
});
const SEED = Number(process.env.VAULT_FUZZ_SEED ?? 20261019);
const STEPS = Number(process.env.VAULT_FUZZ_STEPS ?? 60);
const unit = 1_000_000n;
const projects = [idHash('fuzz-a'), idHash('fuzz-b')];
// [id, project, payee account index, max, partial allowed]
const commitments: [Hex, Hex, number, bigint, boolean][] = [
  [idHash('fuzz-c1'), projects[0], 2, 400n * unit, true],
  [idHash('fuzz-c2'), projects[0], 3, 300n * unit, false],
  [idHash('fuzz-c3'), projects[1], 4, 600n * unit, true],
];

let provider: ReturnType<typeof ganache.provider>;
let client: ReturnType<typeof createPublicClient>;
let accounts: PrivateKeyAccount[];
let wallets: ReturnType<typeof createWalletClient>[];
let vault: Address, token: Address, vaultAbi: Abi, tokenAbi: Abi;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const read = (address: Address, abi: Abi, functionName: string, args: unknown[] = []) =>
  client.readContract({ address, abi, functionName, args }) as Promise<any>;
async function tx(i: number, address: Address, abi: Abi, functionName: string, args: unknown[]) {
  try {
    const hash = await wallets[i].writeContract({
      account: accounts[i],
      chain,
      address,
      abi,
      functionName,
      args,
      gas: 3_000_000n,
    });
    return (await client.waitForTransactionReceipt({ hash })).status === 'success';
  } catch {
    return false;
  }
}
async function snapshot() {
  const [total, balance, unattributed] = await Promise.all([
    read(vault, vaultAbi, 'totalAccounted'),
    read(token, tokenAbi, 'balanceOf', [vault]),
    read(vault, vaultAbi, 'unattributed'),
  ]);
  const ps = await Promise.all(projects.map((p) => read(vault, vaultAbi, 'projects', [p])));
  const cs = await Promise.all(
    commitments.map(([id]) => read(vault, vaultAbi, 'commitments', [id])),
  );
  const received = await Promise.all(
    commitments.map(([, , payee]) => read(token, tokenAbi, 'balanceOf', [accounts[payee].address])),
  );
  const day = (await client.getBlock()).timestamp / 86_400n;
  const spent = await Promise.all(
    projects.map((p) => read(vault, vaultAbi, 'spentOnDay', [p, day])),
  );
  return { total, balance, unattributed, ps, cs, received, spent };
}
type Snap = Awaited<ReturnType<typeof snapshot>>;
function checkInvariants(s: Snap, step: string) {
  const at = ` (after ${step})`;
  expect(s.balance >= s.total, `vault holds what it accounts for${at}`).toBe(true);
  expect(s.unattributed, `unattributed is the surplus${at}`).toBe(s.balance - s.total);
  expect(s.total, `totalAccounted equals the project balances${at}`).toBe(
    s.ps.reduce((sum: bigint, p: any) => sum + p[0], 0n),
  );
  s.cs.forEach((c: any, i: number) =>
    expect(c[3] <= c[2], `commitment ${i} never overpaid${at}`).toBe(true),
  );
  const paid = s.cs.reduce((sum: bigint, c: any) => sum + c[3], 0n);
  expect(
    s.received.reduce((a: bigint, b: bigint) => a + b, 0n),
    `payees received exactly what was paid${at}`,
  ).toBe(paid);
  s.spent.forEach((spent: bigint, i: number) =>
    expect(spent <= s.ps[i][3], `daily cap held for project ${i}${at}`).toBe(true),
  );
}

beforeAll(async () => {
  const artifacts = compile();
  vaultAbi = artifacts['contracts/src/ProjectVaultV2.sol'].ProjectVaultV2.abi;
  tokenAbi = artifacts['contracts/test/MockUSDC.sol'].MockUSDC.abi;
  provider = ganache.provider({
    logging: { quiet: true },
    chain: { chainId: 5042, hardfork: 'shanghai' },
    wallet: { totalAccounts: 6 },
    miner: { instamine: 'eager' },
  });
  const transport = custom(provider as unknown as EIP1193Provider);
  client = createPublicClient({ chain, transport, pollingInterval: 20 });
  accounts = (Object.values(provider.getInitialAccounts()) as { secretKey: Hex }[]).map((a) =>
    privateKeyToAccount(a.secretKey),
  );
  wallets = accounts.map((account) => createWalletClient({ account, chain, transport }));
  const deploy = async (name: string, file: string, args: unknown[]) => {
    const a = artifacts[file][name];
    const hash = await wallets[0].deployContract({
      account: accounts[0],
      chain,
      abi: a.abi,
      bytecode: `0x${a.evm.bytecode.object}`,
      args,
    });
    return (await client.waitForTransactionReceipt({ hash })).contractAddress!;
  };
  token = await deploy('MockUSDC', 'contracts/test/MockUSDC.sol', []);
  vault = await deploy('ProjectVaultV2', 'contracts/src/ProjectVaultV2.sol', [
    token,
    accounts[0].address,
    accounts[1].address,
    60n,
  ]);
  await tx(0, vault, vaultAbi, 'createProject', [
    projects[0],
    200n * unit,
    350n * unit,
    500n * unit,
  ]);
  await tx(0, vault, vaultAbi, 'createProject', [
    projects[1],
    100n * unit,
    600n * unit,
    600n * unit,
  ]);
  for (const [id, project, payee, max, partial] of commitments)
    await tx(0, vault, vaultAbi, 'addCommitment', [
      id,
      project,
      accounts[payee].address,
      max,
      partial,
    ]);
  await tx(5, token, tokenAbi, 'mint', [accounts[5].address, 1_000_000n * unit]);
  await tx(5, token, tokenAbi, 'approve', [vault, 1_000_000n * unit]);
  await provider.request({ method: 'evm_increaseTime', params: [61] });
  await provider.request({ method: 'evm_mine', params: [] });
}, 120_000);
afterAll(async () => provider?.disconnect());

describe('ProjectVaultV2 invariants under random operation sequences', () => {
  it(`holds every accounting invariant across ${STEPS} random steps (seed ${SEED})`, async () => {
    const r = rng(SEED);
    const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
    const amount = (max: number) => BigInt(1 + Math.floor(r() * max)) * unit;
    const outcomes: Record<string, { ok: number; reverted: number }> = {};
    let n = 0;
    checkInvariants(await snapshot(), 'setup');
    for (let step = 0; step < STEPS; step++) {
      const before = await snapshot();
      const project = pick([0, 1]);
      const op = pick([
        'deposit',
        'deposit',
        'stray',
        'attribute',
        'pay',
        'pay',
        'pay',
        'withdraw',
        'policy',
        'block',
        'day',
      ]);
      let ok = true;
      if (op === 'deposit')
        ok = await tx(5, vault, vaultAbi, 'deposit', [
          projects[project],
          idHash(`inv-${step}`),
          amount(300),
        ]);
      else if (op === 'stray') ok = await tx(5, token, tokenAbi, 'transfer', [vault, amount(100)]);
      else if (op === 'attribute')
        ok = await tx(0, vault, vaultAbi, 'attribute', [
          idHash(`attr-${step}`),
          projects[project],
          idHash(`inv-${step}`),
          amount(120),
          idHash('evidence'),
        ]);
      else if (op === 'withdraw')
        ok = await tx(0, vault, vaultAbi, 'ownerWithdraw', [
          projects[project],
          amount(400),
          accounts[0].address,
        ]);
      else if (op === 'policy')
        ok = await tx(0, vault, vaultAbi, 'setPolicy', [
          projects[project],
          amount(250),
          350n * unit,
          700n * unit,
        ]);
      else if (op === 'block')
        ok = await tx(0, token, tokenAbi, 'blockAddress', [
          accounts[pick([2, 3, 4])].address,
          r() < 0.5,
        ]);
      else if (op === 'day') {
        await provider.request({ method: 'evm_increaseTime', params: [86_400] });
        await provider.request({ method: 'evm_mine', params: [] });
      } else {
        const options = commitments.filter((c) => c[1] === projects[project]);
        const chosen = r() < 0.4 && options.length > 1 ? options : [pick(options)];
        const items = chosen.map(([id]) => ({
          executionId: idHash(`exec-${n++}`),
          commitmentId: id,
          amount: amount(350),
        }));
        const block = await client.getBlock();
        const version = (await read(vault, vaultAbi, 'projects', [projects[project]]))[4] as bigint;
        const message = {
          planId: idHash(`plan-${step}`),
          planHash: idHash(`plan-${step}-facts`),
          projectId: projects[project],
          projectVersion: r() < 0.1 ? version - 1n : version, // occasionally stale
          deadline: block.timestamp + 600n,
          itemsHash: itemsHash(items),
        };
        const signature = await accounts[0].signTypedData({
          domain: { name: 'Splitt', version: '2', chainId: chain.id, verifyingContract: vault },
          types: authorizationTypes,
          primaryType: 'PlanAuthorization',
          message,
        });
        const { itemsHash: _, ...authorization } = message;
        ok = await tx(1, vault, vaultAbi, 'payBatch', [authorization, signature, items]);
      }
      const after = await snapshot();
      outcomes[op] ??= { ok: 0, reverted: 0 };
      outcomes[op][ok ? 'ok' : 'reverted']++;
      checkInvariants(after, `step ${step}: ${op}`);
      if (!ok) {
        // A reverted call changes nothing: no partial batch, no half-applied withdrawal.
        expect(after.total, `revert left accounting untouched at step ${step}`).toBe(before.total);
        expect(after.cs, `revert left commitments untouched at step ${step}`).toEqual(before.cs);
        expect(after.received, `revert moved no funds at step ${step}`).toEqual(before.received);
      }
      if (ok && (op === 'pay' || op === 'withdraw'))
        expect(
          after.ps[project][0] >= after.ps[project][1],
          `reserve held after ${op} at step ${step}`,
        ).toBe(true);
    }
    // The sequence must actually exercise both success and rejection paths.
    expect(outcomes.pay?.ok, 'some payouts succeeded').toBeGreaterThan(0);
    expect(outcomes.pay?.reverted, 'some payouts were rejected').toBeGreaterThan(0);
    expect(outcomes.withdraw?.ok ?? 0, 'some withdrawals succeeded').toBeGreaterThan(0);
  }, 600_000);
});
