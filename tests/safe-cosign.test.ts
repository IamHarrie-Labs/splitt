import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { hashTypedData, recoverTypedDataAddress, slice, type Address, type Hex } from 'viem';
import { NETWORKS, combineSafeSignatures, safeMessageTypedData } from '@splitt/core';
import { fixtureProjects } from '../server/src/fixtures.js';
import { TestnetService } from '../server/src/live/service.js';
import { approvalTypedData } from '../server/src/approvals.js';
import type { ArcGateway } from '../server/src/live/chain.js';
import type { LiveRepository, LiveState } from '../server/src/live/repository.js';

const vault = '0x1111111111111111111111111111111111111111' as const;
const safeAddress = '0x5afe5afe5afe5afe5afe5afe5afe5afe5afe5afe' as const;
const members = [0, 1, 2].map(() => privateKeyToAccount(generatePrivateKey()));
const threshold = 2;
let state: LiveState;
let service: TestnetService;

/** Mirrors Safe.checkSignatures: 65-byte owner signatures over the SafeMessage, ascending. */
async function safeAccepts(digest: Hex, signature: Hex) {
  const data = safeMessageTypedData(safeAddress, NETWORKS.mainnet.chainId, digest);
  let last = 0n;
  const count = (signature.length - 2) / 130;
  if (count < threshold || !Number.isInteger(count)) return false;
  for (let i = 0; i < threshold; i++) {
    const signer = await recoverTypedDataAddress({
      ...data,
      signature: slice(signature, i * 65, (i + 1) * 65),
    });
    if (BigInt(signer) <= last || !members.some((m) => m.address === signer)) return false;
    last = BigInt(signer);
  }
  return true;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-03T12:00:00Z'));
  state = { nextBlock: '1', events: [], projects: [fixtureProjects()[0]], plans: [], jobs: [] };
  const repo: LiveRepository = {
    snapshot: async () => structuredClone(state),
    transaction: async (fn) => {
      const next = structuredClone(state);
      const result = fn(next);
      state = next;
      return structuredClone(result);
    },
  };
  const chain = {
    verify: async () => {},
    project: async () => ({ project: fixtureProjects()[0], now: new Date(), block: '100' }),
    simulate: async () => {},
    safe: async () => ({ owners: members.map((m) => m.address), threshold }),
    verifyTypedData: async (
      typed: Parameters<typeof hashTypedData>[0],
      address: Address,
      signature: Hex,
    ) => address === safeAddress && safeAccepts(hashTypedData(typed), signature),
  } as unknown as ArcGateway;
  service = new TestnetService(repo, chain, safeAddress, vault, undefined, NETWORKS.mainnet);
});
afterEach(() => vi.useRealTimers());

async function prepared() {
  const plan = await service.plan('northstar');
  const { approval } = await service.prepare(plan.id);
  const data = safeMessageTypedData(
    safeAddress,
    NETWORKS.mainnet.chainId,
    hashTypedData(approvalTypedData(approval)),
  );
  return { id: plan.id, sign: (i: number) => members[i].signTypedData(data) };
}

describe('Safe owner co-signing', () => {
  it('collects member signatures and queues the batch once the threshold is met', async () => {
    const { id, sign } = await prepared();
    const first = await service.cosign(id, { signature: await sign(2) });
    expect(first).toMatchObject({ collected: 1, threshold: 2 });
    expect(state.jobs).toHaveLength(0);
    // The same member signing again does not count twice.
    expect(await service.cosign(id, { signature: await sign(2) })).toMatchObject({ collected: 1 });
    const second = await service.cosign(id, { signature: await sign(0) });
    expect(second).toMatchObject({ collected: 2, threshold: 2 });
    expect('job' in second && second.job?.state).toBe('queued');
    expect(state.jobs).toHaveLength(1);
    expect(
      await safeAccepts(
        hashTypedData(approvalTypedData(state.jobs[0].approval)),
        state.jobs[0].approval.signature!,
      ),
    ).toBe(true);
  });

  it('rejects a wallet that is not a Safe member', async () => {
    const { id } = await prepared();
    const outsider = privateKeyToAccount(generatePrivateKey());
    const plan = state.plans.find((p) => p.id === id)!;
    const data = safeMessageTypedData(
      safeAddress,
      NETWORKS.mainnet.chainId,
      hashTypedData(approvalTypedData(plan.approval!)),
    );
    await expect(
      service.cosign(id, { signature: await outsider.signTypedData(data) }),
    ).rejects.toThrow('not a signer');
  });

  it('orders combined signatures by owner address and needs the full threshold', () => {
    const sigs = Object.fromEntries(
      members.map((m, i) => [m.address.toLowerCase(), `0x${String(i).repeat(130)}` as Hex]),
    );
    const combined = combineSafeSignatures(sigs, 3);
    const order = [...members].sort((a, b) => (BigInt(a.address) < BigInt(b.address) ? -1 : 1));
    expect(combined).toBe(`0x${order.map((m) => String(members.indexOf(m)).repeat(130)).join('')}`);
    expect(() => combineSafeSignatures(sigs, 4)).toThrow('Not enough');
  });
});
