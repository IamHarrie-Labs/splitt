import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { NETWORKS, resolveNetwork } from '@splitt/core';
import { fixtureProjects } from '../server/src/fixtures.js';
import { TestnetService } from '../server/src/live/service.js';
import { approvalTypedData } from '../server/src/approvals.js';
import { signatureSchema } from '../server/src/auth/routes.js';
import type { ArcGateway } from '../server/src/live/chain.js';
import type { LiveRepository, LiveState } from '../server/src/live/repository.js';

const vault = '0x1111111111111111111111111111111111111111' as const;
let state: LiveState;
const repo: LiveRepository = {
  snapshot: async () => structuredClone(state),
  transaction: async (fn) => {
    const next = structuredClone(state);
    const result = fn(next);
    state = next;
    return structuredClone(result);
  },
};
const chain = (extra: Partial<ArcGateway> = {}) =>
  ({
    verify: async () => {},
    project: async () => ({ project: fixtureProjects()[0], now: new Date(), block: '100' }),
    simulate: async () => {},
    ...extra,
  }) as unknown as ArcGateway;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-03T12:00:00Z'));
  state = { nextBlock: '1', events: [], projects: [fixtureProjects()[0]], plans: [], jobs: [] };
});
afterEach(() => vi.useRealTimers());

describe('network selection', () => {
  it('defaults to testnet, accepts both names and fails closed on anything else', () => {
    expect(resolveNetwork(undefined).chainId).toBe(5042002);
    expect(resolveNetwork('arc-mainnet')).toBe(NETWORKS.mainnet);
    expect(resolveNetwork(' Mainnet ').chainId).toBe(5042);
    expect(() => resolveNetwork('mainnet-beta')).toThrow('Unknown Splitt network');
  });

  it('pins mainnet to the V2 signing domain and the ARC Circle wallets', () => {
    expect(NETWORKS.mainnet).toMatchObject({
      vaultDomainVersion: '2',
      circleBlockchain: 'ARC',
      selfServe: false,
      bridge: false,
    });
  });
});

describe('mainnet approvals', () => {
  it('prepares V2-domain approvals on chain 5042 and rejects a testnet-domain approval', async () => {
    const owner = privateKeyToAccount(generatePrivateKey());
    const service = new TestnetService(
      repo,
      chain(),
      owner.address,
      vault,
      undefined,
      NETWORKS.mainnet,
    );
    const plan = await service.plan('northstar');
    const { approval } = await service.prepare(plan.id);
    expect(approval.domain).toMatchObject({ name: 'Splitt', version: '2', chainId: 5042 });
    const signature = await owner.signTypedData(approvalTypedData(approval));
    expect((await service.enqueue(plan.id, { signature })).state).toBe('queued');

    state.plans[0].approval!.domain = { ...approval.domain, version: '1', chainId: 5042002 };
    state.jobs = [];
    await expect(service.enqueue(plan.id, { signature })).rejects.toThrow('Wrong signing domain');
  });

  it('accepts a multisig owner signature through the chain verifier', async () => {
    const multisig = '0x2222222222222222222222222222222222222222' as const;
    const signature = `0x${'ab'.repeat(130)}` as const; // two concatenated 65-byte signatures
    const verifyTypedData = vi.fn(
      async (_typed, address, sig) => address === multisig && sig === signature,
    );
    const service = new TestnetService(
      repo,
      chain({ verifyTypedData } as Partial<ArcGateway>),
      multisig,
      vault,
      undefined,
      NETWORKS.mainnet,
    );
    const plan = await service.plan('northstar');
    await service.prepare(plan.id);
    expect((await service.enqueue(plan.id, { signature })).state).toBe('queued');
    expect(verifyTypedData).toHaveBeenCalledOnce();
  });
});

describe('signature format', () => {
  it('accepts EOA and multisig lengths but bounds size and rejects odd hex', () => {
    expect(signatureSchema.safeParse(`0x${'ab'.repeat(65)}`).success).toBe(true);
    expect(signatureSchema.safeParse(`0x${'ab'.repeat(195)}`).success).toBe(true);
    expect(signatureSchema.safeParse(`0x${'ab'.repeat(64)}`).success).toBe(false);
    expect(signatureSchema.safeParse(`0x${'ab'.repeat(2049)}`).success).toBe(false);
    expect(signatureSchema.safeParse(`0x${'a'.repeat(131)}`).success).toBe(false);
  });
});
