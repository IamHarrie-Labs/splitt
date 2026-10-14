import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { decodeFunctionData } from 'viem';
import { fixtureProjects } from '../server/src/fixtures.js';
import { TestnetService } from '../server/src/live/service.js';
import { approvalTypedData } from '../server/src/approvals.js';
import { vaultAbi, type ArcGateway } from '../server/src/live/chain.js';
import type { LiveRepository, LiveState } from '../server/src/live/repository.js';
const owner = privateKeyToAccount(generatePrivateKey()),
  vault = '0x1111111111111111111111111111111111111111' as const;
let state: LiveState,
  service: TestnetService,
  project = fixtureProjects()[0];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-03T12:00:00Z'));
  project = fixtureProjects()[0];
  state = { nextBlock: '1', events: [], projects: [project], plans: [], jobs: [] };
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
    project: async () => ({ project: structuredClone(project), now: new Date(), block: '100' }),
    simulate: async () => {},
  } as unknown as ArcGateway;
  service = new TestnetService(repo, chain, owner.address, vault);
});
afterEach(() => vi.useRealTimers());
describe('Arc owner authorization and remainder flow', () => {
  it('prepares a real Splitt-domain approval with exact ordered calldata', async () => {
    const plan = await service.plan('northstar');
    const { approval } = await service.prepare(plan.id);
    expect(approval.domain.name).toBe('Splitt');
    expect(approval.items.map((i) => i.amount)).toEqual(['700000000', '200000000']);
    const signature = await owner.signTypedData(approvalTypedData(approval));
    const job = await service.enqueue(plan.id, { signature });
    const decoded = decodeFunctionData({ abi: vaultAbi, data: job.callData });
    expect(decoded.functionName).toBe('payBatch');
    expect(job.state).toBe('queued');
    expect(state.jobs).toHaveLength(1);
  });
  it('blocks another allocation while a submission is unresolved', async () => {
    const plan = await service.plan('northstar');
    const { approval } = await service.prepare(plan.id);
    await service.enqueue(plan.id, {
      signature: await owner.signTypedData(approvalTypedData(approval)),
    });
    await expect(service.plan('northstar')).rejects.toThrow('Resolve');
  });
  it('rejects fixture-domain signatures in the live queue', async () => {
    const plan = await service.plan('northstar');
    const { approval } = await service.prepare(plan.id);
    const signature = await owner.signTypedData(
      approvalTypedData({ ...approval, domain: { ...approval.domain, name: 'Splitt Fixture' } }),
    );
    await expect(service.enqueue(plan.id, { signature })).rejects.toThrow('signature invalid');
    expect(state.jobs).toHaveLength(0);
  });
  it('rejects stale balances even when an approval exists', async () => {
    const plan = await service.plan('northstar');
    const { approval } = await service.prepare(plan.id);
    project.balance = '1000000000';
    await expect(
      service.enqueue(plan.id, {
        signature: await owner.signTypedData(approvalTypedData(approval)),
      }),
    ).rejects.toThrow('facts changed');
  });
  it('rejects an expired owner approval', async () => {
    const plan = await service.plan('northstar');
    const { approval } = await service.prepare(plan.id);
    const signature = await owner.signTypedData(approvalTypedData(approval));
    vi.setSystemTime(new Date('2026-10-03T12:16:00Z'));
    await expect(service.enqueue(plan.id, { signature })).rejects.toThrow('Expired');
  });
  it('plans only the unpaid 300 after the remainder without touching the other project', async () => {
    project.balance = '1100000000';
    project.received = '2000000000';
    project.spentToday = '900000000';
    project.commitments[0].paid = '700000000';
    project.commitments[1].paid = '200000000';
    const plan = await service.plan('northstar');
    expect(
      plan.output.items
        .filter((i) => i.action === 'pay')
        .map((i) => [i.commitment_id, i.amount_micro]),
    ).toEqual([['tobi', '300000000']]);
    expect(fixtureProjects()[1].balance).toBe('1000000000');
  });
});
