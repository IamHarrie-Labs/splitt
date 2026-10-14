import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import {
  baselinePlan,
  buildFacts,
  hashJson,
  idHash,
  moneySchema,
  addressSchema,
  validatePlan,
  type Project,
} from '@splitt/core';
import { propose } from './agent/planner.js';
import {
  FixtureStore,
  appendLedger,
  demoNow,
  initialState,
  type StoredPlan,
  type StateStore,
} from './store.js';
import { registerAuth, type AuthOptions } from './auth/routes.js';
import { registerApprovals, type ApprovalOptions } from './approvals.js';

const positiveMoney = moneySchema.refine((v) => BigInt(v) > 0n, 'Amount must be positive');
class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
function requireProject(projects: Project[], id: string) {
  const p = projects.find((p) => p.id === id);
  if (!p) throw new HttpError(404, 'Project not found');
  return p;
}
export async function buildApp(
  store: StateStore = new FixtureStore(),
  logging = false,
  options: { auth?: AuthOptions; approval?: ApprovalOptions; storage?: 'file' | 'postgres' } = {},
) {
  if (options.approval && !options.auth)
    throw new Error('Batch signing requires owner authentication.');
  if (options.storage === 'postgres' && !options.auth)
    throw new Error('Database workspaces require owner authentication.');
  const app = Fastify({ logger: logging, bodyLimit: 100000 });
  const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  await app.register(cors, { origin, credentials: true });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.addHook('onRequest', async (request, reply) => {
    if (
      ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method) &&
      request.headers.origin !== origin
    )
      return reply.code(403).send({ message: 'Request origin is not allowed.' });
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError)
      return reply
        .code(400)
        .send({ message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    const failure = error as { statusCode?: number; message?: string };
    return reply.code(failure.statusCode ?? 500).send({
      message:
        (failure.statusCode ?? 500) < 500
          ? failure.message
          : 'The operation failed. Nothing was submitted to a chain.',
    });
  });
  await registerAuth(app, origin, options.auth, {
    storage: options.storage ?? 'file',
    approvalEnabled: !!options.approval,
  });
  await registerApprovals(app, store, options.approval);
  app.get('/health', async () => ({
    status: 'ok',
    mode: 'fixture',
    network: 'Local simulation',
    livePayments: false,
  }));
  app.get('/workspace', async () => ({
    ...(await store.snapshot()),
    mode: 'fixture',
    now: demoNow().toISOString(),
    storage: options.storage ?? 'file',
    authEnabled: !!options.auth,
    approvalEnabled: !!options.approval,
  }));
  app.post('/fixture/reset', async () => {
    if (options.storage === 'postgres')
      throw new HttpError(
        409,
        'Database workspaces retain their audit trail. Use a file fixture workspace to reset the demo.',
      );
    return store.transaction((s) => {
      Object.assign(s, initialState());
      return { ok: true };
    });
  });
  app.post<{ Params: { id: string } }>('/projects/:id/replan', async (request) => {
    const project = requireProject((await store.snapshot()).projects, request.params.id);
    const facts = buildFacts(project, demoNow());
    if (project.unresolved || project.paused)
      throw new HttpError(409, 'Resolve settlement or unpause the project before replanning.');
    const result = await propose(facts);
    const validation = validatePlan(
      result.output,
      facts,
      buildFacts(requireProject((await store.snapshot()).projects, project.id), demoNow()),
    );
    if (!validation.ok)
      throw new HttpError(409, validation.errors.map((e) => e.message).join('; '));
    return store.transaction((s) => {
      const current = buildFacts(requireProject(s.projects, project.id), demoNow());
      if (hashJson(current) !== hashJson(facts))
        throw new HttpError(409, 'Project changed during planning. Try again.');
      for (const old of s.plans.filter(
        (p) => p.projectId === project.id && p.status === 'awaiting_owner',
      ))
        old.status = 'stale';
      const plan: StoredPlan = {
        id: randomUUID(),
        projectId: project.id,
        facts,
        factsHash: hashJson(facts),
        planHash: hashJson(result.output),
        output: result.output,
        baseline: baselinePlan(facts),
        validation,
        model: result.model,
        fallbackUsed: result.fallbackUsed,
        status: 'awaiting_owner',
        createdAt: new Date().toISOString(),
      };
      s.plans.push(plan);
      appendLedger(
        s,
        project.id,
        'Plan proposed',
        `${result.model}; ${validation.total} micro-USDC available for review.`,
      );
      return plan;
    });
  });
  app.post<{ Params: { id: string } }>('/plans/:id/simulate', async (request) => {
    const { interrupt } = z
      .object({ interrupt: z.boolean().default(false) })
      .parse(request.body ?? {});
    return store.transaction((s) => {
      const plan = s.plans.find((p) => p.id === request.params.id);
      if (!plan) throw new HttpError(404, 'Plan not found');
      if (plan.status !== 'awaiting_owner')
        throw new HttpError(409, 'This plan has already executed or is no longer valid.');
      const project = requireProject(s.projects, plan.projectId);
      const validation = validatePlan(
        plan.output,
        plan.facts,
        buildFacts(project, demoNow()),
        plan.baseline,
      );
      if (!validation.ok || project.paused || project.unresolved)
        throw new HttpError(409, 'Project state changed. Generate and review a fresh plan.');
      if (BigInt(validation.total) === 0n)
        throw new HttpError(409, 'There are no payments in this plan.');
      for (const item of plan.output.items.filter((i) => i.action === 'pay')) {
        const c = project.commitments.find((c) => c.id === item.commitment_id)!;
        c.paid = (BigInt(c.paid) + BigInt(item.amount_micro)).toString();
        appendLedger(
          s,
          project.id,
          'Fixture payout',
          `${c.name} · local simulation, no transaction sent`,
          item.amount_micro,
        );
      }
      project.balance = (BigInt(project.balance) - BigInt(validation.total)).toString();
      project.spentToday = (BigInt(project.spentToday) + BigInt(validation.total)).toString();
      plan.status = interrupt ? 'unresolved' : 'done';
      project.unresolved = interrupt;
      if (interrupt)
        appendLedger(
          s,
          project.id,
          'Confirmation interrupted',
          'Fixture callback interrupted. Reconcile to recover this batch.',
        );
      return plan;
    });
  });
  app.post<{ Params: { id: string } }>('/plans/:id/reconcile', async (request) =>
    store.transaction((s) => {
      const plan = s.plans.find((p) => p.id === request.params.id);
      if (!plan || plan.status !== 'unresolved')
        throw new HttpError(409, 'No unresolved fixture batch.');
      plan.status = 'done';
      requireProject(s.projects, plan.projectId).unresolved = false;
      appendLedger(
        s,
        plan.projectId,
        'Settlement recovered',
        'Fixture reconciliation recovered the original batch. No second payment.',
      );
      return plan;
    }),
  );
  app.post<{ Params: { id: string } }>('/projects/:id/pause', async (request) =>
    store.transaction((s) => {
      const p = requireProject(s.projects, request.params.id);
      p.paused = !p.paused;
      appendLedger(
        s,
        p.id,
        p.paused ? 'Project paused' : 'Project resumed',
        'Local fixture operator authority changed.',
      );
      return p;
    }),
  );
  app.post<{ Params: { id: string } }>('/projects/:id/payments', async (request) => {
    const input = z
      .object({ amount: positiveMoney, unknown: z.boolean().default(false) })
      .parse(request.body);
    return store.transaction((s) => {
      const p = requireProject(s.projects, request.params.id);
      const payment = {
        id: randomUUID(),
        projectId: input.unknown ? null : p.id,
        invoice: p.invoiceRef,
        payer: input.unknown ? 'Unknown fixture payer' : p.clientWallet,
        amount: input.amount,
        status: input.unknown ? ('ambiguous' as const) : ('confirmed' as const),
        route: input.unknown ? ('transfer' as const) : ('deposit' as const),
        at: new Date().toISOString(),
        source: 'fixture' as const,
      };
      s.payments.push(payment);
      if (!input.unknown) {
        p.balance = (BigInt(p.balance) + BigInt(input.amount)).toString();
        p.received = (BigInt(p.received) + BigInt(input.amount)).toString();
      }
      appendLedger(
        s,
        p.id,
        input.unknown ? 'Unattributed arrival' : 'Payment received',
        'Fixture funds; owner confirmation required for unknown payers.',
        input.amount,
      );
      return payment;
    });
  });
  app.post<{ Params: { id: string } }>('/payments/:id/confirm', async (request) => {
    const { projectId } = z.object({ projectId: z.string() }).parse(request.body);
    return store.transaction((s) => {
      const payment = s.payments.find((p) => p.id === request.params.id);
      if (!payment || payment.status !== 'ambiguous')
        throw new HttpError(409, 'Payment is already attributed or unavailable.');
      const p = requireProject(s.projects, projectId);
      payment.projectId = p.id;
      payment.invoice = p.invoiceRef;
      payment.status = 'confirmed';
      p.balance = (BigInt(p.balance) + BigInt(payment.amount)).toString();
      p.received = (BigInt(p.received) + BigInt(payment.amount)).toString();
      appendLedger(
        s,
        p.id,
        'Payment attributed',
        'Owner confirmed a fixture arrival once.',
        payment.amount,
      );
      return payment;
    });
  });
  app.post('/projects', async (request) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(80),
        client: z.string().trim().min(2).max(80),
        clientWallet: addressSchema,
        invoiceRef: z.string().trim().min(1).max(40),
        invoiceTotal: positiveMoney,
        reserve: moneySchema,
        perPayment: positiveMoney,
        perDay: positiveMoney,
      })
      .parse(request.body);
    if (BigInt(input.perDay) < BigInt(input.perPayment))
      throw new HttpError(400, 'Daily cap must be at least the per-payment cap.');
    return store.transaction((s) => {
      const id = randomUUID();
      const p: Project = {
        ...input,
        clientWallet: input.clientWallet.toLowerCase() as `0x${string}`,
        id,
        onchainId: idHash(id),
        received: '0',
        balance: '0',
        spentToday: '0',
        version: 1,
        commitments: [],
        paused: false,
        unresolved: false,
        source: 'fixture',
      };
      s.projects.push(p);
      appendLedger(s, id, 'Project created', `${p.name} · local fixture`);
      return p;
    });
  });
  app.post<{ Params: { id: string } }>('/projects/:id/commitments', async (request) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(80),
        role: z.string().trim().min(2).max(120),
        payee: addressSchema,
        maximum: positiveMoney,
        dueDate: z.string().date(),
        deferUntil: z.string().date().nullable(),
        accepted: z.boolean(),
        partialAllowed: z.boolean(),
        blocksDelivery: z.boolean(),
      })
      .parse(request.body);
    return store.transaction((s) => {
      const p = requireProject(s.projects, request.params.id);
      if (!input.partialAllowed && BigInt(input.maximum) > BigInt(p.perPayment))
        throw new HttpError(400, 'Full payment exceeds this project’s per-payment cap.');
      const id = randomUUID();
      p.commitments.push({
        ...input,
        payee: input.payee.toLowerCase() as `0x${string}`,
        id,
        onchainId: idHash(id),
        projectId: p.id,
        paid: '0',
        acceptedAt: demoNow().toISOString().slice(0, 10),
        activeAfter: 0,
        cancelled: false,
        dependsOn: null,
      });
      p.version++;
      appendLedger(s, p.id, 'Commitment approved', `${input.name} · ${input.role}`);
      return p;
    });
  });
  return app;
}
