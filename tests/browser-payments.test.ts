import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  baselinePlan,
  buildFacts,
  executionItems,
  hashJson,
  idHash,
  itemsHash,
} from '@splitt/core';
import { fixtureProjects } from '../server/src/fixtures.js';
import { assertPayoutMatchesReview } from '../web/app/start/payout-review.js';
import { walletRequestRejected, workspaceRequest } from '../web/app/start/requests.js';
import type { BatchApproval } from '../server/src/store.js';

afterEach(() => vi.unstubAllGlobals());
const vault = '0x0000000000000000000000000000000000000123';
function setup() {
  const project = fixtureProjects()[0];
  const output = baselinePlan(buildFacts(project, new Date('2026-10-03T12:00:00Z')));
  const plan = { id: 'review-test', output, planHash: hashJson(output) };
  const items = executionItems(project, idHash(plan.id), output);
  const approval: BatchApproval = {
    domain: { name: 'Splitt', version: '1', chainId: 5042002, verifyingContract: vault },
    message: {
      planId: idHash(plan.id),
      planHash: plan.planHash,
      projectId: project.onchainId,
      projectVersion: String(project.version),
      deadline: '200',
      itemsHash: itemsHash(items),
    },
    items: items.map((item) => ({ ...item, amount: String(item.amount) })),
  };
  return { project, plan, approval };
}

describe('browser payout review', () => {
  it('accepts only the complete reviewed batch', () => {
    const { project, plan, approval } = setup();
    expect(() => assertPayoutMatchesReview(approval, vault, project, plan, 100)).not.toThrow();
  });
  it.each([
    'amount',
    'itemsHash',
    'planHash',
    'expiry',
    'chain',
    'version',
    'recipient',
    'missing',
  ])('rejects a changed %s before a signature is requested', (field) => {
    const { project, plan, approval } = setup();
    if (field === 'amount') approval.items[0].amount = '1';
    if (field === 'itemsHash') approval.message.itemsHash = idHash('unreviewed batch');
    if (field === 'planHash') approval.message.planHash = idHash('different plan');
    if (field === 'expiry') approval.message.deadline = '100';
    if (field === 'chain') approval.domain.chainId = 1;
    if (field === 'version') approval.domain.version = '2';
    if (field === 'recipient') approval.items[0].commitmentId = idHash('foreign contractor');
    if (field === 'missing') approval.items.pop();
    expect(() => assertPayoutMatchesReview(approval, vault, project, plan, 100)).toThrow();
  });
});
describe('workspace request recovery', () => {
  it('recognizes explicit nested wallet cancellation but retains ambiguous failures', () => {
    expect(walletRequestRejected({ cause: { code: 4001 } })).toBe(true);
    expect(walletRequestRejected({ cause: { name: 'UserRejectedRequestError' } })).toBe(true);
    expect(walletRequestRejected(new Error('network lost after submission'))).toBe(false);
  });
  it('turns a proxy HTML error into a useful message without retrying a mutation', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response('<html>unavailable</html>', { status: 502 }));
    vi.stubGlobal('fetch', fetch);
    await expect(
      workspaceRequest('/plans/test/submit', { signature: 'test' }, 'csrf'),
    ).rejects.toThrow('temporarily unavailable');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('explains session expiry and request limits', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    await expect(workspaceRequest('/selfserve/vaults')).rejects.toMatchObject({ status: 401 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })));
    await expect(workspaceRequest('/selfserve/vaults')).rejects.toThrow('Wait a moment');
  });
  it('does not retry an uncertain signed payout submission', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('network failure'));
    vi.stubGlobal('fetch', fetch);
    await expect(workspaceRequest('/plans/test/submit', {})).rejects.toThrow('Check activity');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
