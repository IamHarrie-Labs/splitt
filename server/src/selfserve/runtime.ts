import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { addressSchema } from '@splitt/core';
import { type Address } from 'viem';
import { SELF_SERVE } from '../../../packages/core/src/selfserve.js';
import { connectDatabase, type Database } from '../db/driver.js';
import { PostgresAuthRepository } from '../auth/repository.js';
import { registerAuth } from '../auth/routes.js';
import { arcGateway } from '../live/chain.js';
import { TestnetService, metadataSchema } from '../live/service.js';
import { workerTick, indexReceipts, OperatorPolicyError, type Operator } from '../live/worker.js';
import { draftReceipts } from '../agent/receipt-drafts.js';
import { circleOperator } from '../circle/operator.js';
import { VaultRegistry, policyError, type RegisteredVault } from './registry.js';
import { SponsorshipBudget, circleFee } from './sponsorship.js';

export async function buildSelfServeApp(
  db: Database,
  operator: Address,
  origin: string,
  options: { startWorker?: boolean; logger?: boolean } = {},
) {
  const registry = await new VaultRegistry(
    db,
    operator,
    (process.env.SPLITT_CONTROLLED_OWNERS ?? process.env.OWNER_ADDRESS ?? '')
      .split(',')
      .filter(Boolean),
  ).init();
  const budget = await new SponsorshipBudget(db).init();
  const operatorClient = circleOperator(process.env.VAULT_ADDRESS as Address | undefined);
  await operatorClient.verify(operator);
  const app = Fastify({ logger: options.logger ?? true, bodyLimit: 100000 });
  await app.register(cors, { origin, credentials: true });
  await app.register(rateLimit, { max: 90, timeWindow: '1 minute' });
  app.addHook('onRequest', async (req, reply) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers.origin !== origin)
      return reply.code(403).send({ message: 'Origin not allowed.' });
  });
  app.setErrorHandler((error, _req, reply) => {
    const e = error as Error & { statusCode?: number };
    reply.code(error instanceof ZodError ? 400 : (e.statusCode ?? 500)).send({
      message:
        error instanceof ZodError
          ? 'Check the request fields.'
          : e.statusCode
            ? e.message
            : 'Testnet request failed. Check transaction status before retrying.',
    });
  });
  await registerAuth(
    app,
    origin,
    { allowAnyWallet: true, repository: new PostgresAuthRepository(db) },
    { storage: 'postgres', approvalEnabled: true },
  );
  app.get('/health', async () => ({
    status: 'ok',
    mode: 'selfserve-testnet',
    network: 'Arc Testnet',
    livePayments: true,
  }));
  app.get('/selfserve/config', async () => ({
    chainId: SELF_SERVE.chainId,
    operator,
    usdc: SELF_SERVE.usdc,
    delaySeconds: SELF_SERVE.delaySeconds,
    faucet: 'https://faucet.circle.com',
    limits: SELF_SERVE,
    activity: await registry.activity(),
  }));
  const contexts = new Map<string, Awaited<ReturnType<typeof createContext>>>();
  async function createContext(record: RegisteredVault) {
    const repo = await registry.repository(record),
      chain = arcGateway(record.vault, record.owner, operator),
      service = new TestnetService(repo, chain, record.owner, record.vault),
      provider = circleOperator(record.vault);
    const limited: Operator = {
      status: provider.status,
      submit: async (callData, id) => {
        const job = (await repo.snapshot()).jobs.find((j) => j.id === id);
        if (
          !job ||
          job.callData !== callData ||
          job.approval.domain.verifyingContract.toLowerCase() !== record.vault
        )
          throw new OperatorPolicyError('This payment does not belong to the registered vault.');
        const total = job.approval.items.reduce((n, i) => n + BigInt(i.amount), 0n);
        if (
          job.approval.items.length > SELF_SERVE.maxContractors ||
          total > BigInt(SELF_SERVE.maxBatch)
        )
          throw new OperatorPolicyError('Batch exceeds the public testnet payment limit.');
        await registry.verify(record);
        // Once provider submission may have happened, retry the original reserved fees.
        // A fresh estimate could fail after execution and hide an accepted transaction.
        const prior = await budget.existing(record.owner, record.vault, id);
        if (prior) return provider.submit(callData, id, circleFee(prior));
        const gas = await registry.client.estimateGas({
          account: operator,
          to: record.vault,
          data: callData,
          value: 0n,
        });
        const fees = await registry.client.estimateFeesPerGas();
        const quote = await budget.reserve(record.owner, record.vault, id, {
          gasLimit: String((gas * 120n + 99n) / 100n),
          maxFeePerGas: String(fees.maxFeePerGas),
          maxPriorityFeePerGas: String(fees.maxPriorityFeePerGas),
        });
        return provider.submit(callData, id, circleFee(quote));
      },
    };
    return { record, repo, chain, service, provider: limited, busy: false };
  }
  async function context(record: RegisteredVault) {
    let ctx = contexts.get(record.vault);
    if (!ctx) {
      ctx = await createContext(record);
      contexts.set(record.vault, ctx);
    }
    return ctx;
  }
  async function owned(vault: string, wallet: Address | undefined) {
    if (!wallet) throw policyError('Sign in first.', 401);
    const record = await registry.owned(vault, wallet);
    await registry.verify(record);
    return context(record);
  }
  const mutation = { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } };
  app.get('/selfserve/vaults', (req) => registry.list(req.splittWallet));
  app.post(
    '/selfserve/vaults',
    { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } },
    async (req) => {
      const record = await registry.register(req.splittWallet!, req.body);
      await context(record);
      return record;
    },
  );
  type Params = { vault: string; id: string };
  app.get<{ Params: Params }>('/selfserve/vaults/:vault/workspace', async (req) => {
    const ctx = await owned(req.params.vault, req.splittWallet),
      state = await ctx.repo.snapshot();
    state.projects = await Promise.all(
      state.projects.map(async (p) => {
        const fresh = await ctx.chain.project(p);
        fresh.project.received = String(
          state.events
            .filter(
              (e) =>
                ['PaymentReceived', 'PaymentAttributed'].includes(e.name) &&
                e.args.projectId?.toLowerCase() === p.onchainId.toLowerCase(),
            )
            .reduce((n, e) => n + BigInt(e.args.amount), 0n),
        );
        fresh.project.unresolved = state.jobs.some(
          (j) => j.projectId === p.id && !['confirmed', 'failed', 'expired'].includes(j.state),
        );
        return fresh.project;
      }),
    );
    return {
      ...state,
      owner: ctx.record.owner,
      vault: ctx.record.vault,
      operator,
      chainId: SELF_SERVE.chainId,
      classification: ctx.record.classification,
    };
  });
  app.post<{ Params: Params }>('/selfserve/vaults/:vault/projects', mutation, async (req) => {
    const ctx = await owned(req.params.vault, req.splittWallet),
      data = metadataSchema.parse(req.body);
    if (
      BigInt(data.invoiceTotal) <= 0n ||
      BigInt(data.invoiceTotal) > BigInt(SELF_SERVE.maxInvoice) ||
      data.commitments.length < 1 ||
      data.commitments.length > SELF_SERVE.maxContractors ||
      data.commitments.some(
        (c) => BigInt(c.maximum) <= 0n || BigInt(c.maximum) > BigInt(SELF_SERVE.maxBatch),
      )
    )
      throw policyError(
        'Use an invoice up to 10 USDC and one or two obligations up to 5 USDC each.',
      );
    return ctx.service.register(data);
  });
  app.post<{ Params: Params }>(
    '/selfserve/vaults/:vault/receipts/refresh',
    mutation,
    async (req) => {
      const ctx = await owned(req.params.vault, req.splittWallet);
      await tickVault(ctx.record);
      return { checked: true };
    },
  );
  app.post<{ Params: Params }>(
    '/selfserve/vaults/:vault/projects/:id/replan',
    mutation,
    async (req) => (await owned(req.params.vault, req.splittWallet)).service.plan(req.params.id),
  );
  app.post<{ Params: Params }>(
    '/selfserve/vaults/:vault/plans/:id/prepare',
    mutation,
    async (req) => {
      const result = await (
        await owned(req.params.vault, req.splittWallet)
      ).service.prepare(req.params.id);
      if (
        result.approval.items.length > SELF_SERVE.maxContractors ||
        result.approval.items.reduce((n, i) => n + BigInt(i.amount), 0n) >
          BigInt(SELF_SERVE.maxBatch)
      )
        throw policyError('This batch exceeds the testnet preview limits.');
      return result;
    },
  );
  app.post<{ Params: Params }>(
    '/selfserve/vaults/:vault/plans/:id/submit',
    mutation,
    async (req) => {
      const ctx = await owned(req.params.vault, req.splittWallet),
        state = await ctx.repo.snapshot(),
        plan = state.plans.find((p) => p.id === req.params.id);
      if (
        !plan?.approval ||
        plan.approval.items.length > SELF_SERVE.maxContractors ||
        plan.approval.items.reduce((n, i) => n + BigInt(i.amount), 0n) > BigInt(SELF_SERVE.maxBatch)
      )
        throw policyError('Review a batch within the testnet limits first.');
      return ctx.service.enqueue(req.params.id, req.body);
    },
  );
  async function tickVault(record: RegisteredVault) {
    const ctx = await context(record);
    if (ctx.busy) return;
    ctx.busy = true;
    try {
      await registry.verify(record);
      await indexReceipts(ctx.repo, ctx.chain);
      await workerTick(ctx.repo, ctx.chain, ctx.provider);
      await draftReceipts(ctx.service);
    } catch {
      app.log.warn('Self-serve workspace refresh pending. No new payment authorized.');
    } finally {
      ctx.busy = false;
    }
  }
  let stopped = false,
    busy = false,
    cursor = 0;
  const tick = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const all = await registry.list();
      if (!all.length) return;
      const batch = Array.from(
        { length: Math.min(4, all.length) },
        (_, i) => all[(cursor + i) % all.length],
      );
      cursor = (cursor + batch.length) % all.length;
      await Promise.allSettled(batch.map(tickVault));
    } finally {
      busy = false;
    }
  };
  const timer = options.startWorker === false ? undefined : setInterval(() => void tick(), 5000);
  app.addHook('onClose', async () => {
    stopped = true;
    clearInterval(timer);
    while (busy || [...contexts.values()].some((c) => c.busy))
      await new Promise((r) => setTimeout(r, 25));
  });
  return { app, registry, budget };
}
export async function startSelfServe() {
  if (process.env.SPLITT_TESTNET_CONFIRM !== 'arc-testnet' || !process.env.DATABASE_URL)
    throw new Error('Explicit Arc Testnet configuration and PostgreSQL are required.');
  const operator = addressSchema.parse(process.env.OPERATOR_ADDRESS) as Address,
    db = connectDatabase(process.env.DATABASE_URL);
  const { app } = await buildSelfServeApp(
    db,
    operator,
    process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  );
  app.addHook('onClose', async () => db.close());
  const host = process.env.HOST ?? '127.0.0.1';
  if (!['127.0.0.1', '0.0.0.0'].includes(host)) throw new Error('Unsupported API host.');
  await app.listen({ port: Number(process.env.PORT ?? 4000), host });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => void app.close());
  return app;
}
