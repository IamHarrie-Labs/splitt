import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { addressSchema, moneySchema } from '@splitt/core';
import { txHashSchema } from '../../../packages/core/src/cctp.js';
import type { BridgeService } from './service.js';

/** Registered behind the same owner session, CSRF and Origin checks as payout routes. */
export function registerBridgeRoutes(app: FastifyInstance, service: BridgeService) {
  const limits = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };
  const hash = (body: unknown) => z.object({ txHash: txHashSchema }).strict().parse(body).txHash;
  app.post('/testnet/bridge/quote', limits, async (req) => {
    const input = z
      .object({ payer: addressSchema, amount: moneySchema.refine((v) => BigInt(v) > 0n) })
      .strict()
      .parse(req.body);
    return service.gateway.preflight(input.payer as `0x${string}`, input.amount);
  });
  app.post('/testnet/bridge/intents', limits, async (req) => service.prepare(req.body));
  const route = (action: string, handler: (id: string, body: unknown) => Promise<unknown>) =>
    app.post<{ Params: { id: string } }>(`/testnet/bridge/intents/:id/${action}`, limits, (req) =>
      handler(req.params.id, req.body),
    );
  route('resume', (id) => service.resume(id));
  route('burn', (id, body) => service.recordBurn(id, hash(body)));
  route('attestation', (id) => service.poll(id));
  route('mint', (id, body) => service.recordMint(id, hash(body)));
  route('attribute/prepare', (id) => service.attribution(id));
  route('attribute', (id, body) => service.recordAttribution(id, hash(body)));
}
