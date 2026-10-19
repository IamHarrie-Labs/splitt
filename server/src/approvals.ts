import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NETWORK } from './network.js';
import { verifyTypedData, type Address, type Hex } from 'viem';
import {
  authorizationTypes,
  buildFacts,
  executionItems,
  hashJson,
  idHash,
  itemsHash,
  validatePlan,
} from '@splitt/core';
import type { State, StateStore, BatchApproval } from './store.js';
import { appendLedger, demoNow } from './store.js';
import { signatureSchema } from './auth/routes.js';

export type ApprovalOptions = { owner: Address; vault: Address; now?: () => Date };
function failure(message: string, statusCode = 409) {
  return Object.assign(new Error(message), { statusCode });
}
function validated(state: State, id: string) {
  const plan = state.plans.find((p) => p.id === id);
  if (!plan) throw failure('Plan not found.', 404);
  const project = state.projects.find((p) => p.id === plan.projectId)!;
  const validation = validatePlan(
    plan.output,
    plan.facts,
    buildFacts(project, demoNow()),
    plan.baseline,
  );
  if (
    plan.status !== 'awaiting_owner' ||
    project.paused ||
    project.unresolved ||
    !validation.ok ||
    BigInt(validation.total) === 0n ||
    hashJson(plan.output) !== plan.planHash ||
    hashJson(plan.facts) !== plan.factsHash
  )
    throw failure('Project or plan changed. Generate and review a fresh plan.');
  return { plan, project };
}
function proposal(
  state: State,
  planId: string,
  options: ApprovalOptions,
  deadline: string,
): BatchApproval {
  const { plan, project } = validated(state, planId);
  const items = executionItems(project, idHash(plan.id), plan.output);
  return {
    // Deliberately separate domain: a fixture signature can never pay a deployed Splitt vault.
    domain: {
      name: 'Splitt Fixture',
      version: '1',
      chainId: NETWORK.chainId,
      verifyingContract: options.vault,
    },
    message: {
      planId: idHash(plan.id),
      planHash: plan.planHash as Hex,
      projectId: project.onchainId,
      projectVersion: String(project.version),
      deadline,
      itemsHash: itemsHash(items),
    },
    items: items.map((i) => ({ ...i, amount: String(i.amount) })),
  };
}
export function approvalTypedData(approval: BatchApproval) {
  return {
    domain: approval.domain,
    types: authorizationTypes,
    primaryType: 'PlanAuthorization' as const,
    message: {
      ...approval.message,
      projectVersion: BigInt(approval.message.projectVersion),
      deadline: BigInt(approval.message.deadline),
    },
  };
}
export async function registerApprovals(
  app: FastifyInstance,
  store: StateStore,
  options?: ApprovalOptions,
) {
  const now = options?.now ?? (() => new Date());
  app.post<{ Params: { id: string } }>('/plans/:id/prepare', async (request) => {
    if (!options)
      throw failure('Configure OWNER_ADDRESS and VAULT_ADDRESS to enable wallet approval.');
    return store.transaction((state) => {
      const { plan } = validated(state, request.params.id);
      if (plan.approval?.signature) throw failure('This plan already has an owner approval.');
      // An unexpired preparation is stable across browser retries.
      if (
        !plan.approval ||
        BigInt(plan.approval.message.deadline) <= BigInt(Math.floor(now().getTime() / 1000))
      )
        plan.approval = proposal(
          state,
          plan.id,
          options,
          String(Math.floor(now().getTime() / 1000) + 900),
        );
      return {
        approval: plan.approval,
        types: authorizationTypes,
        primaryType: 'PlanAuthorization',
        fixtureOnly: true,
      };
    });
  });
  app.post<{ Params: { id: string } }>('/plans/:id/approve', async (request) => {
    if (!options) throw failure('Wallet approval is not configured.');
    const { signature } = z.object({ signature: signatureSchema }).strict().parse(request.body);
    const { plan } = validated(await store.snapshot(), request.params.id);
    const approval = plan.approval;
    if (!approval || approval.signature)
      throw failure('Prepare this batch once before signing it.');
    if (BigInt(approval.message.deadline) <= BigInt(Math.floor(now().getTime() / 1000)))
      throw failure('Approval expired. Review and prepare this batch again.');
    if (
      !(await verifyTypedData({
        ...approvalTypedData(approval),
        address: options.owner,
        signature: signature as Hex,
      }))
    )
      throw failure('Signature does not match the owner and exact batch.', 403);
    return store.transaction((state) => {
      const { plan: current } = validated(state, plan.id);
      const expected = proposal(state, current.id, options, approval.message.deadline);
      if (
        !current.approval ||
        current.approval.signature ||
        hashJson(current.approval) !== hashJson(approval) ||
        hashJson(expected) !== hashJson(approval) ||
        BigInt(approval.message.deadline) <= BigInt(Math.floor(now().getTime() / 1000))
      )
        throw failure('Batch changed, expired, or was approved elsewhere. Review again.');
      current.approval = {
        ...approval,
        signature: signature as Hex,
        signedAt: now().toISOString(),
      };
      appendLedger(
        state,
        current.projectId,
        'Fixture batch signed',
        'Owner approved the exact batch in the non-executable Splitt Fixture domain. No transaction sent.',
      );
      return { ok: true, fixtureOnly: true, plan: current };
    });
  });
}
