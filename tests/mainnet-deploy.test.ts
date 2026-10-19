import { beforeAll, describe, expect, it } from 'vitest';
import ganache from 'ganache';
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  keccak256,
  type Address,
  type EIP1193Provider,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
// @ts-expect-error The local compiler is a JavaScript CLI as well as a test helper.
import { compile } from '../scripts/compile-contracts.mjs';
import {
  deployVault,
  matchesTemplate,
  planDeployment,
  type V2Artifact,
} from '../scripts/mainnet-deploy.js';

const chain = defineChain({
  id: 5042,
  name: 'Local Arc mainnet rehearsal',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['http://localhost'] } },
});
const commit = 'a'.repeat(40);
let client: ReturnType<typeof createPublicClient>;
let wallets: ReturnType<typeof createWalletClient>[];
let artifact: V2Artifact;
let manifest: { creationCodeHash: Hex; runtimeTemplateHash: Hex };
let safe: Address;

beforeAll(async () => {
  const artifacts = compile(true);
  artifact = artifacts['contracts/src/ProjectVaultV2.sol'].ProjectVaultV2;
  manifest = {
    creationCodeHash: keccak256(`0x${artifact.evm.bytecode.object}`),
    runtimeTemplateHash: keccak256(`0x${artifact.evm.deployedBytecode.object}`),
  };
  const provider = ganache.provider({
    logging: { quiet: true },
    chain: { chainId: 5042, hardfork: 'shanghai' },
    wallet: { totalAccounts: 3 },
    miner: { instamine: 'eager' },
  });
  const transport = custom(provider as unknown as EIP1193Provider);
  client = createPublicClient({ chain, transport, pollingInterval: 20 });
  wallets = (Object.values(provider.getInitialAccounts()) as { secretKey: string }[]).map(
    ({ secretKey }) =>
      createWalletClient({ account: privateKeyToAccount(secretKey as Hex), chain, transport }),
  );
  const mock = artifacts['contracts/test/MockMultisigOwner.sol'].MockMultisigOwner;
  const hash = await wallets[0].deployContract({
    account: wallets[0].account!,
    chain,
    abi: mock.abi,
    bytecode: `0x${mock.evm.bytecode.object}`,
    args: [wallets[1].account!.address],
  });
  safe = (await client.waitForTransactionReceipt({ hash })).contractAddress!;
});

const inputs = () => ({
  owner: safe,
  operator: wallets[2].account!.address,
  auditReportUrl: 'https://example.com/splitt-v2-audit.pdf',
  releaseCommit: commit,
  headCommit: commit,
  dirtyTree: false,
});

describe('mainnet vault deployment', () => {
  it('blocks a single-key owner, a short payee delay, an unaudited build and a dirty checkout', async () => {
    const plan = await planDeployment(
      client as never,
      wallets[0].account!.address,
      artifact,
      { ...manifest, creationCodeHash: `0x${'0'.repeat(64)}` },
      {
        ...inputs(),
        owner: wallets[1].account!.address,
        payeeDelaySeconds: '3600',
        dirtyTree: true,
        auditReportUrl: 'http://example.com/audit',
      },
    );
    expect(plan.ready).toBe(false);
    expect(plan.blockers.join('\n')).toMatch(/must be a multisig/);
    expect(plan.blockers.join('\n')).toMatch(/at least 86400/);
    expect(plan.blockers.join('\n')).toMatch(/audited build/);
    expect(plan.blockers.join('\n')).toMatch(/uncommitted/);
    expect(plan.blockers.join('\n')).toMatch(/audit report/);
  });

  it('deploys the audited template, journals before waiting and verifies every constructor value', async () => {
    const plan = await planDeployment(
      client as never,
      wallets[0].account!.address,
      artifact,
      manifest,
      inputs(),
    );
    expect(plan.blockers).toEqual([]);
    const entries: Record<string, unknown>[] = [];
    const result = await deployVault(client as never, wallets[0], artifact, plan, async (e) => {
      entries.push(e);
    });
    expect(entries[0]).toMatchObject({ status: 'pending' });
    expect(result.status).toBe('verified');
    expect(result.vault.toLowerCase()).toBe(plan.predictedVault!.toLowerCase());
    expect(result.owner.toLowerCase()).toBe(safe.toLowerCase());
    expect(result.payeeDelaySeconds).toBe('86400');
    const runtime = (await client.getCode({ address: result.vault }))!;
    expect(keccak256(runtime)).toBe(result.runtimeCodeHash);
    // One flipped byte outside the immutable slots must fail the template check.
    const tampered =
      `${runtime.slice(0, 10)}${runtime[10] === 'f' ? '0' : 'f'}${runtime.slice(11)}` as Hex;
    const refs = artifact.evm.deployedBytecode.immutableReferences;
    expect(matchesTemplate(runtime, artifact.evm.deployedBytecode.object, refs)).toBe(true);
    expect(matchesTemplate(tampered, artifact.evm.deployedBytecode.object, refs)).toBe(false);
  });
});
