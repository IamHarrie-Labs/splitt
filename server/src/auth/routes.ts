import cookie from '@fastify/cookie';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getAddress, verifyMessage, type Address } from 'viem';
import { createSiweMessage, parseSiweMessage } from 'viem/siwe';
import { z } from 'zod';
import { addressSchema } from '@splitt/core';
import { MemoryAuthRepository, type AuthRepository } from './repository.js';

export type AuthOptions = {
  owner?: Address;
  allowAnyWallet?: boolean;
  repository?: AuthRepository;
  now?: () => Date;
  currentOwner?: () => Promise<Address>;
};
declare module 'fastify' {
  interface FastifyRequest {
    splittWallet?: Address;
  }
}
export const signatureSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{130}$/, 'Expected an EOA wallet signature');
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
function failure(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

export async function registerAuth(
  app: FastifyInstance,
  origin: string,
  options?: AuthOptions,
  capabilities = { storage: 'file', approvalEnabled: false },
) {
  await app.register(cookie);
  const repo = options?.repository ?? new MemoryAuthRepository();
  const now = options?.now ?? (() => new Date());
  const expectedOwner = options?.owner?.toLowerCase();
  if (options && !options.owner && !options.allowAnyWallet)
    throw new Error('Configure an owner or explicitly enable public wallet authentication.');
  const cookieName = 'splitt_session';
  const secure = new URL(origin).protocol === 'https:';
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: 'strict' as const,
    path: '/api',
    maxAge: 60 * 60 * 8,
  };
  async function checkOwner(wallet: string) {
    if (options?.allowAnyWallet) return;
    if (!expectedOwner || wallet.toLowerCase() !== expectedOwner)
      throw failure(403, 'This wallet is not the configured workspace owner.');
    if (options?.currentOwner && (await options.currentOwner()).toLowerCase() !== expectedOwner)
      throw failure(403, 'Vault ownership changed. Update the workspace owner before continuing.');
  }
  async function session(request: FastifyRequest) {
    const token = request.cookies[cookieName];
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
    const s = await repo.session(hashToken(token), now());
    if (s && s.origin !== origin) return undefined;
    if (s) await checkOwner(s.wallet);
    return s;
  }
  app.get('/auth/session', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const s = options ? await session(request) : undefined;
    return {
      ...capabilities,
      enabled: !!options,
      owner: options?.owner ?? null,
      wallet: s?.wallet ?? null,
      csrf: s?.csrf ?? null,
      expiresAt: s?.expiresAt.toISOString() ?? null,
    };
  });
  app.post(
    '/auth/challenge',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      if (!options)
        throw failure(409, 'Owner authentication is not configured for this fixture workspace.');
      const { address } = z.object({ address: addressSchema }).strict().parse(request.body);
      await checkOwner(address);
      const issuedAt = now();
      const expiresAt = new Date(issuedAt.getTime() + 5 * 60 * 1000);
      const nonce = randomBytes(16).toString('hex');
      const site = new URL(origin);
      const message = createSiweMessage({
        address: getAddress(address),
        chainId: 5042002,
        domain: site.host,
        uri: site.origin,
        scheme: site.protocol.slice(0, -1),
        version: '1',
        nonce,
        issuedAt,
        expirationTime: expiresAt,
        statement: options?.allowAnyWallet
          ? 'Sign in to your Splitt testnet workspace. This does not authorize payments.'
          : 'Sign in to Splitt as workspace owner. This does not authorize payments.',
      });
      await repo.putChallenge({ nonce, wallet: address.toLowerCase(), message, expiresAt });
      return { nonce, message, expiresAt: expiresAt.toISOString() };
    },
  );
  app.post(
    '/auth/verify',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!options) throw failure(409, 'Owner authentication is not configured.');
      const { nonce, signature } = z
        .object({ nonce: z.string().regex(/^[a-f0-9]{32}$/), signature: signatureSchema })
        .strict()
        .parse(request.body);
      const challenge = await repo.challenge(nonce, now());
      if (!challenge) throw failure(401, 'Sign-in challenge expired or was already used.');
      const parsed = parseSiweMessage(challenge.message);
      if (
        parsed.domain !== new URL(origin).host ||
        parsed.uri !== new URL(origin).origin ||
        parsed.chainId !== 5042002 ||
        parsed.address?.toLowerCase() !== challenge.wallet ||
        parsed.nonce !== nonce
      )
        throw failure(401, 'Sign-in challenge belongs to a different workspace.');
      await checkOwner(challenge.wallet);
      if (
        !(await verifyMessage({
          address: challenge.wallet as Address,
          message: challenge.message,
          signature: signature as `0x${string}`,
        }))
      )
        throw failure(401, 'Wallet signature does not match this sign-in challenge.');
      if (!(await repo.consume(nonce, now())))
        throw failure(401, 'Sign-in challenge expired or was already used.');
      const token = randomBytes(32).toString('hex');
      const csrf = randomBytes(32).toString('hex');
      const expiresAt = new Date(now().getTime() + 8 * 60 * 60 * 1000);
      await repo.putSession({
        tokenHash: hashToken(token),
        wallet: challenge.wallet,
        csrf,
        expiresAt,
        origin,
      });
      // Reauthentication revokes this browser's previous session.
      const old = request.cookies[cookieName];
      if (old) await repo.revoke(hashToken(old));
      reply.setCookie(cookieName, token, cookieOptions).header('Cache-Control', 'no-store');
      return { wallet: challenge.wallet, csrf, expiresAt: expiresAt.toISOString() };
    },
  );
  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[cookieName];
    if (token) await repo.revoke(hashToken(token));
    reply.clearCookie(cookieName, cookieOptions);
    return { ok: true };
  });
  app.addHook('preHandler', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const path = request.url.split('?')[0];
    if (
      !options ||
      request.method === 'OPTIONS' ||
      path === '/health' ||
      (options?.allowAnyWallet && request.method === 'GET' && path === '/selfserve/config') ||
      ['/auth/session', '/auth/challenge', '/auth/verify'].includes(path)
    )
      return;
    const s = await session(request);
    if (!s) throw failure(401, 'Sign in with the workspace owner wallet to continue.');
    request.splittWallet = s.wallet as Address;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      const csrf = request.headers['x-splitt-csrf'];
      if (
        typeof csrf !== 'string' ||
        !/^[a-f0-9]{64}$/.test(csrf) ||
        !timingSafeEqual(Buffer.from(csrf), Buffer.from(s.csrf))
      )
        throw failure(403, 'Session verification failed. Sign in again.');
    }
  });
}
