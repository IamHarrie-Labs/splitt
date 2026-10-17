import {
  executionItems,
  hashJson,
  idHash,
  itemsHash,
  type Project,
  type PlanOutput,
} from '@splitt/core';
import type { BatchApproval } from '../../../server/src/store';

export function assertPayoutMatchesReview(
  approval: BatchApproval,
  vault: string,
  project: Project,
  plan: { id: string; planHash: string; output: PlanOutput },
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const expected = executionItems(project, idHash(plan.id), plan.output);
  const expectedHash = itemsHash(expected);
  if (
    approval.domain.name !== 'Splitt' ||
    approval.domain.version !== '1' ||
    approval.domain.chainId !== 5042002 ||
    approval.domain.verifyingContract.toLowerCase() !== vault.toLowerCase() ||
    approval.message.projectId !== project.onchainId ||
    approval.message.projectVersion !== String(project.version) ||
    approval.message.planId !== idHash(plan.id) ||
    approval.message.planHash !== plan.planHash ||
    hashJson(plan.output) !== plan.planHash ||
    BigInt(approval.message.deadline) <= BigInt(nowSeconds) ||
    approval.message.itemsHash !== expectedHash ||
    approval.items.length === 0 ||
    approval.items.length !== expected.length ||
    approval.items.some(
      (item, index) =>
        item.executionId !== expected[index].executionId ||
        item.commitmentId !== expected[index].commitmentId ||
        item.amount !== expected[index].amount.toString(),
    )
  )
    throw new Error(
      'The payout differs from the reviewed plan or has expired. Refresh and review it again.',
    );
}
