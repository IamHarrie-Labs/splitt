import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  hashTypedData,
  recoverTypedDataAddress,
  verifyTypedData,
  type Address,
  type Hex,
} from 'viem';
import {
  addressSchema,
  moneySchema,
  baselinePlan,
  buildFacts,
  hashJson,
  idHash,
  executionItems,
  itemsHash,
  authorizationTypes,
  validatePlan,
  type Project,
} from '@splitt/core';
import type { LiveRepository } from './repository.js';
import { batchCalldata, type ArcGateway } from './chain.js';
import { propose } from '../agent/planner.js';
import { approvalTypedData } from '../approvals.js';
import { signatureSchema } from '../auth/routes.js';
import type { BatchApproval, StoredPlan } from '../store.js';
import { NETWORK } from '../network.js';
import { combineSafeSignatures, safeMessageTypedData, type SplittNetwork } from '@splitt/core';
const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const metadataSchema = z
  .object({
    id: z.string().min(1).max(100),
    onchainId: hex32,
    name: z.string().min(1).max(100),
    client: z.string().min(1).max(100),
    clientWallet: addressSchema,
    invoiceRef: z.string().min(1).max(100),
    invoiceTotal: moneySchema,
    commitments: z
      .array(
        z
          .object({
            id: z.string().min(1),
            onchainId: hex32,
            name: z.string().min(1),
            role: z.string(),
            payee: addressSchema,
            maximum: moneySchema,
            dueDate: date,
            deferUntil: date.nullable(),
            accepted: z.boolean(),
            acceptedAt: date,
            blocksDelivery: z.boolean(),
            partialAllowed: z.boolean(),
            dependsOn: z.string().nullable(),
          })
          .strict(),
      )
      .max(32),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (
      new Set(p.commitments.map((c) => c.id)).size !== p.commitments.length ||
      new Set(p.commitments.map((c) => c.onchainId.toLowerCase())).size !== p.commitments.length
    )
      ctx.addIssue({ code: 'custom', message: 'Commitments must have unique IDs.' });
  });
function fail(message: string, statusCode = 409): never {
  throw Object.assign(new Error(message), { statusCode });
}
export class TestnetService {
  constructor(
    public repo: LiveRepository,
    public chain: ArcGateway,
    public owner: Address,
    public vault: Address,
    private planner: typeof propose = propose,
    private network: SplittNetwork = NETWORK,
  ) {}
  /** Through the chain when available, so ERC-1271 multisig owners verify too. */
  private ownerSigned(approval: BatchApproval, signature: Hex) {
    const typed = approvalTypedData(approval);
    return this.chain.verifyTypedData
      ? this.chain.verifyTypedData(typed, this.owner, signature)
      : verifyTypedData({ ...typed, address: this.owner, signature });
  }
  async register(input: unknown) {
    const data = metadataSchema.parse(input);
    const metadata = {
      ...data,
      received: '0',
      balance: '0',
      reserve: '0',
      perPayment: '0',
      perDay: '0',
      spentToday: '0',
      version: 0,
      paused: false,
      source: 'fixture',
      unresolved: false,
      commitments: data.commitments.map((c) => ({
        ...c,
        projectId: data.id,
        paid: '0',
        activeAfter: 0,
        cancelled: false,
      })),
    } as Project;
    await this.chain.verify();
    const { project } = await this.chain.project(metadata);
    return this.repo.transaction((s) => {
      if (
        s.projects.some(
          (p) =>
            p.id === project.id || p.onchainId.toLowerCase() === project.onchainId.toLowerCase(),
        )
      )
        fail('Project already registered.');
      s.projects.push(project);
      return project;
    });
  }
  async fresh(id: string) {
    await this.chain.verify();
    const state = await this.repo.snapshot();
    const metadata = state.projects.find((p) => p.id === id) ?? fail('Project not found.', 404);
    if (
      state.jobs.some(
        (j) => j.projectId === id && !['confirmed', 'failed', 'expired'].includes(j.state),
      )
    )
      fail('Resolve the existing batch before preparing another.');
    const snapshot = await this.chain.project(metadata);
    return { ...snapshot, facts: buildFacts(snapshot.project, snapshot.now) };
  }
  async plan(id: string, trigger?: { receiptId: string; leaseToken: string }) {
    const snapshot = await this.fresh(id);
    const reusable =
      trigger &&
      (await this.repo.snapshot()).plans.find(
        (p) =>
          p.projectId === id &&
          p.status === 'awaiting_owner' &&
          p.factsHash === hashJson(snapshot.facts),
      );
    const result = reusable
      ? { output: reusable.output, model: reusable.model, fallbackUsed: reusable.fallbackUsed }
      : await this.planner(snapshot.facts);
    const latest = await this.fresh(id);
    const validation = validatePlan(
      result.output,
      snapshot.facts,
      latest.facts,
      baselinePlan(snapshot.facts),
    );
    const noAction = BigInt(validation.total) === 0n;
    const waitingForRecipient = snapshot.project.commitments.some(
      (c) => BigInt(c.maximum) > BigInt(c.paid) && c.activeAfter > snapshot.now.getTime() / 1000,
    );
    if (
      !validation.ok ||
      (noAction &&
        (!trigger || waitingForRecipient || snapshot.project.paused || snapshot.project.unresolved))
    )
      fail('No valid payable allocation. Refresh project facts.');
    const plan: StoredPlan = {
      id: randomUUID(),
      projectId: id,
      facts: snapshot.facts,
      factsHash: hashJson(snapshot.facts),
      planHash: hashJson(result.output),
      output: result.output,
      baseline: baselinePlan(snapshot.facts),
      validation,
      model: result.model,
      fallbackUsed: result.fallbackUsed,
      status: noAction ? 'no_action' : 'awaiting_owner',
      createdAt: new Date().toISOString(),
    };
    await this.repo.transaction((s) => {
      if (
        s.jobs.some(
          (j) => j.projectId === id && !['confirmed', 'failed', 'expired'].includes(j.state),
        )
      )
        fail('Resolve the existing batch before preparing another.');
      const task = trigger && s.receiptDrafts?.find((t) => t.id === trigger.receiptId);
      if (trigger && (!task || task.leaseToken !== trigger.leaseToken || task.state !== 'working'))
        fail('Receipt planning lease changed.');
      const existing =
        trigger &&
        s.plans.find(
          (p) =>
            p.projectId === id && p.status === 'awaiting_owner' && p.factsHash === plan.factsHash,
        );
      if (existing) Object.assign(plan, existing);
      else {
        s.plans
          .filter((p) => p.projectId === id && p.status === 'awaiting_owner')
          .forEach((p) => {
            p.status = 'stale';
          });
        s.plans.push(plan);
      }
      if (task) {
        task.state = 'done';
        task.planId = plan.id;
        task.leaseUntil = 0;
        delete task.lastError;
        const notifications = (s.notifications ??= []);
        if (!notifications.some((n) => n.id === `draft:${plan.id}`))
          notifications.push({
            id: `draft:${plan.id}`,
            projectId: id,
            planId: plan.id,
            kind: noAction ? 'receipt_no_action' : 'draft_ready',
            message: noAction
              ? 'Receipt recorded. No payout is available under the current reserve, limits and outstanding obligations.'
              : 'A client receipt was detected. Your allocation is ready for review.',
            createdAt: new Date().toISOString(),
          });
      }
    });
    return plan;
  }
  async prepare(id: string) {
    const plan =
      (await this.repo.snapshot()).plans.find((p) => p.id === id) ?? fail('Plan not found.', 404);
    const snapshot = await this.fresh(plan.projectId);
    if (
      plan.status !== 'awaiting_owner' ||
      !validatePlan(plan.output, plan.facts, snapshot.facts, plan.baseline).ok
    )
      fail('Plan changed; generate a new proposal.');
    const items = executionItems(snapshot.project, idHash(plan.id), plan.output);
    return this.repo.transaction((s) => {
      const current = s.plans.find((p) => p.id === id)!;
      if (current.status !== 'awaiting_owner') fail('Plan no longer awaiting review.');
      if (
        !current.approval ||
        BigInt(current.approval.message.deadline) <= BigInt(Math.floor(Date.now() / 1000))
      )
        current.approval = {
          domain: {
            name: 'Splitt',
            version: this.network.vaultDomainVersion,
            chainId: this.network.chainId,
            verifyingContract: this.vault,
          },
          message: {
            planId: idHash(id),
            planHash: plan.planHash as Hex,
            projectId: snapshot.project.onchainId,
            projectVersion: String(snapshot.project.version),
            deadline: String(Math.floor(Date.now() / 1000) + 900),
            itemsHash: itemsHash(items),
          },
          items: items.map((i) => ({ ...i, amount: String(i.amount) })),
        };
      return {
        approval: current.approval,
        types: authorizationTypes,
        primaryType: 'PlanAuthorization',
        fixtureOnly: false,
      };
    });
  }
  /**
   * One Safe member's signature for a prepared batch. Signatures are stored until the Safe's
   * threshold is met, then combined and queued through the same checks as a direct signature.
   */
  async cosign(id: string, input: unknown) {
    const signature = z.object({ signature: signatureSchema }).strict().parse(input)
      .signature as Hex;
    if (!/^0x[0-9a-fA-F]{130}$/.test(signature))
      fail('Each Safe member signs once, with a single wallet signature.');
    const safe = (await this.chain.safe?.()) ?? fail('The vault owner is not a Safe.', 409);
    const stored = await this.repo.snapshot();
    const plan = stored.plans.find((p) => p.id === id) ?? fail('Plan not found.', 404);
    const approval = plan.approval ?? fail('Review the batch first.');
    const existing = stored.jobs.find((job) => job.id === id);
    if (existing) return { collected: safe.threshold, threshold: safe.threshold, job: existing };
    if (BigInt(approval.message.deadline) <= BigInt(Math.floor(Date.now() / 1000)))
      fail('Approval expired. Review the batch again.');
    const digest = hashTypedData(approvalTypedData(approval));
    const signer = (
      await recoverTypedDataAddress({
        ...safeMessageTypedData(this.owner, this.network.chainId, digest),
        signature,
      })
    ).toLowerCase();
    const members = safe.owners.map((o) => o.toLowerCase());
    if (!members.includes(signer)) fail('This wallet is not a signer on the owner Safe.', 403);
    const batch = (a: typeof approval) =>
      hashJson({ domain: a.domain, message: a.message, items: a.items });
    const collected = await this.repo.transaction((s) => {
      const current = s.plans.find((p) => p.id === id)?.approval;
      if (!current || batch(current) !== batch(approval))
        fail('The batch changed while signing. Review it again.');
      current.cosignatures = { ...current.cosignatures, [signer]: signature };
      return current.cosignatures;
    });
    // Anyone removed from the Safe since signing no longer counts.
    const valid = Object.fromEntries(
      Object.entries(collected).filter(([k]) => members.includes(k)),
    );
    const status = {
      collected: Object.keys(valid).length,
      threshold: safe.threshold,
      signers: Object.keys(valid),
    };
    if (status.collected < safe.threshold) return status;
    return {
      ...status,
      job: await this.enqueue(id, { signature: combineSafeSignatures(valid, safe.threshold) }),
    };
  }
  async enqueue(id: string, input: unknown) {
    const signature = signatureSchema.parse(
      z.object({ signature: signatureSchema }).strict().parse(input).signature,
    ) as Hex;
    const stored = await this.repo.snapshot();
    const plan = stored.plans.find((p) => p.id === id) ?? fail('Plan not found.', 404);
    const approval = plan.approval ?? fail('Review the batch first.');
    if (
      approval.domain.name !== 'Splitt' ||
      approval.domain.chainId !== this.network.chainId ||
      approval.domain.version !== this.network.vaultDomainVersion ||
      approval.domain.verifyingContract.toLowerCase() !== this.vault.toLowerCase()
    )
      fail('Wrong signing domain.');
    const existing = stored.jobs.find((job) => job.id === id);
    if (existing) {
      // A lost HTTP response must recover the original intent, even if its chain
      // state or deadline has since changed. Never replace its signature/calldata.
      if (!(await this.ownerSigned(existing.approval, signature)))
        fail('Owner signature invalid.', 403);
      return existing;
    }
    const snapshot = await this.fresh(plan.projectId);
    if (
      !validatePlan(plan.output, plan.facts, snapshot.facts, plan.baseline).ok ||
      hashJson(plan.output) !== plan.planHash ||
      hashJson(plan.facts) !== plan.factsHash
    )
      fail('Project facts changed. Generate a new proposal.');
    if (
      plan.status !== 'awaiting_owner' ||
      BigInt(approval.message.deadline) <= BigInt(Math.floor(Date.now() / 1000))
    )
      fail('Expired or stale plan.');
    if (!(await this.ownerSigned(approval, signature))) fail('Owner signature invalid.', 403);
    const signed = { ...approval, signature, signedAt: new Date().toISOString() };
    await this.chain.simulate(signed);
    return this.repo.transaction((s) => {
      if (s.jobs.some((j) => j.id === id)) return s.jobs.find((j) => j.id === id)!;
      if (
        s.jobs.some(
          (j) =>
            j.projectId === plan.projectId && !['confirmed', 'failed', 'expired'].includes(j.state),
        )
      )
        fail('Project already has a pending batch.');
      const current = s.plans.find((p) => p.id === id)!;
      if (current.status !== 'awaiting_owner' || hashJson(current.approval) !== hashJson(approval))
        fail('Review changed; sign again.');
      current.approval = signed;
      current.status = 'unresolved';
      const job = {
        id,
        projectId: plan.projectId,
        approval: signed,
        callData: batchCalldata(signed),
        state: 'queued' as const,
        attempted: false,
        leaseUntil: 0,
        attempts: 0,
      };
      s.jobs.push(job);
      return job;
    });
  }
}
