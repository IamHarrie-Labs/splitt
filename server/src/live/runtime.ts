import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { addressSchema, hashJson } from '@splitt/core';
import type { Address } from 'viem';
import { connectDatabase } from '../db/driver.js';
import { PostgresAuthRepository } from '../auth/repository.js';
import { registerAuth } from '../auth/routes.js';
import { LivePostgresRepository } from './repository.js';
import { arcGateway } from './chain.js';
import { NETWORK } from '../network.js';
import { TestnetService } from './service.js';
import { circleOperator } from '../circle/operator.js';
import { workerTick, indexReceipts } from './worker.js';
import { draftReceipts } from '../agent/receipt-drafts.js';
import { analyzePaymentNote, paymentNoteInput } from '../agent/payment-notes.js';
import { cctpGateway } from '../bridge/gateway.js';
import { BridgeService } from '../bridge/service.js';
import { registerBridgeRoutes } from '../bridge/routes.js';
/** Runs one team-operated vault on the network SPLITT_MODE selects (arc-testnet or arc-mainnet). */
export async function startTestnet() {
  const mode = NETWORK.id === 'mainnet' ? 'arc-mainnet' : 'arc-testnet';
  if (
    [
      'OWNER_ADDRESS',
      'VAULT_ADDRESS',
      'OPERATOR_ADDRESS',
      'DATABASE_URL',
      'VAULT_DEPLOYMENT_BLOCK',
    ].some((name) => !process.env[name])
  )
    throw new Error(
      'Missing live configuration. Set owner, vault, operator, database and deployment block.',
    );
  const owner = addressSchema.parse(process.env.OWNER_ADDRESS) as Address,
    vault = addressSchema.parse(process.env.VAULT_ADDRESS) as Address,
    operator = addressSchema.parse(process.env.OPERATOR_ADDRESS) as Address;
  if (!process.env.DATABASE_URL || !/^\d+$/.test(process.env.VAULT_DEPLOYMENT_BLOCK ?? ''))
    throw new Error('Live mode requires DATABASE_URL and VAULT_DEPLOYMENT_BLOCK.');
  // Each network has its own confirmation, so a testnet config can never start a mainnet API.
  const confirm = NETWORK.id === 'mainnet' ? 'SPLITT_MAINNET_CONFIRM' : 'SPLITT_TESTNET_CONFIRM';
  if (process.env[confirm] !== mode)
    throw new Error(`Set ${confirm}=${mode} after reviewing the deployment.`);
  const chain = arcGateway(vault, owner, operator);
  await chain.verify();
  const provider = circleOperator();
  await provider.verify(operator);
  const db = connectDatabase(process.env.DATABASE_URL);
  const repo = await new LivePostgresRepository(
    db,
    `${NETWORK.chainId}:${vault.toLowerCase()}`,
  ).init(process.env.VAULT_DEPLOYMENT_BLOCK!);
  const service = new TestnetService(repo, chain, owner, vault);
  const app = Fastify({ logger: true, bodyLimit: 100000 });
  const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  await app.register(cors, { origin, credentials: true });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.addHook('onRequest', async (req, reply) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && req.headers.origin !== origin)
      return reply.code(403).send({ message: 'Origin not allowed.' });
  });
  app.setErrorHandler((error, _req, reply) => {
    const e = error as Error & { statusCode?: number };
    return reply.code(error instanceof ZodError ? 400 : (e.statusCode ?? 500)).send({
      message:
        error instanceof ZodError
          ? 'Invalid request fields.'
          : e.statusCode
            ? e.message
            : 'Operation failed; inspect batch status before retrying.',
    });
  });
  await registerAuth(
    app,
    origin,
    {
      owner,
      currentOwner: chain.owner,
      repository: new PostgresAuthRepository(db),
      verifyMessage: chain.verifyMessage,
    },
    { storage: 'postgres', approvalEnabled: true },
  );
  app.get('/health', async () => ({
    status: 'ok',
    mode,
    network: NETWORK.name,
    chainId: NETWORK.chainId,
    livePayments: true,
  }));
  if (NETWORK.bridge)
    registerBridgeRoutes(app, new BridgeService(repo, cctpGateway(vault, owner), vault, owner));
  app.get('/testnet/workspace', async () => {
    const state = await repo.snapshot();
    state.projects = await Promise.all(
      state.projects.map(async (metadata) => {
        const { project } = await chain.project(metadata);
        project.received = String(
          state.events
            .filter(
              (e) =>
                ['PaymentReceived', 'PaymentAttributed'].includes(e.name) &&
                e.args.projectId?.toLowerCase() === metadata.onchainId.toLowerCase(),
            )
            .reduce((sum, e) => sum + BigInt(e.args.amount), 0n),
        );
        project.unresolved = state.jobs.some(
          (j) =>
            j.projectId === project.id && !['confirmed', 'failed', 'expired'].includes(j.state),
        );
        return project;
      }),
    );
    return {
      ...state,
      mode,
      vault,
      owner,
      operator,
      chainId: NETWORK.chainId,
    };
  });
  app.post('/testnet/projects', async (req) => service.register(req.body));
  app.post<{ Params: { id: string } }>('/testnet/notifications/:id/read', async (req) =>
    repo.transaction((state) => {
      const notification = state.notifications?.find((n) => n.id === req.params.id);
      if (!notification)
        throw Object.assign(new Error('Notification not found.'), { statusCode: 404 });
      notification.readAt ??= new Date().toISOString();
      return notification;
    }),
  );
  app.post(
    '/testnet/payment-notes',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const input = paymentNoteInput.parse(req.body);
      const state = await repo.snapshot();
      const existing = state.paymentNotes?.find(
        (n) => n.eventId === input.eventId && n.noteHash === hashJson(input.note),
      );
      if (existing) return existing;
      const event = state.events.find((e) => e.id === input.eventId);
      if (!event || !['PaymentReceived', 'PaymentAttributed', 'Transfer'].includes(event.name))
        throw Object.assign(new Error('Choose an indexed receipt first.'), { statusCode: 400 });
      const result = await analyzePaymentNote(input.note, event, state.projects);
      return repo.transaction((s) => {
        const notes = (s.paymentNotes ??= []);
        const duplicate = notes.find(
          (n) => n.eventId === result.eventId && n.noteHash === result.noteHash,
        );
        if (duplicate) return duplicate;
        notes.push(result);
        return result;
      });
    },
  );
  app.get<{ Params: { id: string } }>('/testnet/projects/:id', async (req) =>
    service.fresh(req.params.id),
  );
  app.post<{ Params: { id: string } }>('/testnet/projects/:id/replan', async (req) =>
    service.plan(req.params.id),
  );
  app.post<{ Params: { id: string } }>('/testnet/plans/:id/prepare', async (req) =>
    service.prepare(req.params.id),
  );
  app.post<{ Params: { id: string } }>('/testnet/plans/:id/submit', async (req) =>
    service.enqueue(req.params.id, req.body),
  );
  let busy = false;
  let stopped = false;
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      await indexReceipts(repo, chain);
      await workerTick(repo, chain, provider);
      await draftReceipts(service);
    } catch {
      app.log.warn('Worker retry pending; no new batch created.');
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), 5000);
  app.addHook('onClose', async () => {
    stopped = true;
    clearInterval(timer);
    while (busy) await new Promise((r) => setTimeout(r, 25));
    await db.close();
  });
  const host = process.env.HOST ?? '127.0.0.1';
  if (!['127.0.0.1', '0.0.0.0'].includes(host)) throw new Error('Unsupported API bind address.');
  await app.listen({ port: Number(process.env.PORT ?? 4000), host });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => void app.close());
  void tick();
  return app;
}
