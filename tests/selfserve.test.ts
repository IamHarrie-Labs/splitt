import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import Fastify from 'fastify';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { keccak256, type Address } from 'viem';
import { idHash } from '@splitt/core';
import { registerAuth } from '../server/src/auth/routes';
import { VaultRegistry, cappedWorkspace } from '../server/src/selfserve/registry';
import { SponsorshipBudget, circleFee } from '../server/src/selfserve/sponsorship';
import { SELF_SERVE, vaultCreation } from '../packages/core/src/selfserve';
import { fixtureProjects } from '../server/src/fixtures';
import type { Database } from '../server/src/db/driver';
import type { LiveState, LiveRepository } from '../server/src/live/repository';
let pg: PGlite, db: Database, registry: VaultRegistry, budget: SponsorshipBudget;
const owner = privateKeyToAccount(generatePrivateKey()),
  other = privateKeyToAccount(generatePrivateKey());
const operator = '0x3333333333333333333333333333333333333333' as const,
  vault = '0x4444444444444444444444444444444444444444' as const;
const quote = { gasLimit: '100000', maxFeePerGas: '1000000000', maxPriorityFeePerGas: '0' };
beforeAll(async () => {
  pg = new PGlite();
  db = {
    query: (text, values) => pg.query(text, values),
    transaction: (fn) =>
      pg.transaction((tx) => fn({ query: (text, values) => tx.query(text, values) })),
    close: () => pg.close(),
  };
  registry = await new VaultRegistry(db, operator, [owner.address]).init();
  budget = await new SponsorshipBudget(db).init();
});
afterAll(() => db.close());
beforeEach(async () => {
  vi.restoreAllMocks();
  await db.query('TRUNCATE selfserve_vaults,selfserve_gas_reservations');
});
describe('public wallet authentication', () => {
  it('authenticates two different wallets without a configured owner, with separate sessions and CSRF', async () => {
    const app = Fastify();
    await registerAuth(app, 'http://localhost:3000', { allowAnyWallet: true });
    app.get('/private', (req) => ({ wallet: req.splittWallet }));
    app.post('/private', (req) => ({ wallet: req.splittWallet }));
    try {
      expect((await app.inject('/private')).statusCode).toBe(401);
      for (const account of [owner, other]) {
        const challenge = (
          await app.inject({
            method: 'POST',
            url: '/auth/challenge',
            payload: { address: account.address },
          })
        ).json();
        const verified = await app.inject({
          method: 'POST',
          url: '/auth/verify',
          payload: {
            nonce: challenge.nonce,
            signature: await account.signMessage({ message: challenge.message }),
          },
        });
        expect(verified.statusCode).toBe(200);
        const cookie = String(verified.headers['set-cookie']).split(';')[0],
          csrf = verified.json().csrf;
        expect(
          (
            await app.inject({
              url: '/private',
              headers: { cookie, 'x-splitt-wallet': other.address },
            })
          )
            .json()
            .wallet.toLowerCase(),
        ).toBe(account.address.toLowerCase());
        expect(
          (await app.inject({ method: 'POST', url: '/private', payload: {}, headers: { cookie } }))
            .statusCode,
        ).toBe(403);
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/private',
              payload: {},
              headers: { cookie, 'x-splitt-csrf': csrf },
            })
          ).statusCode,
        ).toBe(200);
      }
    } finally {
      await app.close();
    }
  });
});
describe('canonical vault registration and isolation', () => {
  function mockDeployment(overrides: Record<string, unknown> = {}) {
    vi.spyOn(registry.client, 'getChainId').mockResolvedValue(5042002);
    vi.spyOn(registry.client, 'getTransaction').mockResolvedValue({
      from: owner.address,
      to: null,
      input: vaultCreation(owner.address, operator),
      ...overrides,
    } as never);
    vi.spyOn(registry.client, 'getTransactionReceipt').mockResolvedValue({
      status: 'success',
      contractAddress: vault,
      blockNumber: 100n,
    } as never);
    vi.spyOn(registry.client, 'getCode').mockResolvedValue('0x1234');
    vi.spyOn(registry, 'verify').mockResolvedValue();
  }
  it('registers an exact owner-signed creation once and classifies controlled tests separately', async () => {
    mockDeployment();
    const result = await registry.register(owner.address, {
      transactionHash: idHash('deployment'),
    });
    expect(result.owner).toBe(owner.address.toLowerCase());
    expect(result.classification).toBe('controlled_test');
    await registry.register(owner.address, { transactionHash: idHash('deployment') });
    expect(await registry.list(owner.address)).toHaveLength(1);
    await expect(registry.owned(vault, other.address)).rejects.toMatchObject({ statusCode: 404 });
    expect(await registry.list(other.address)).toEqual([]);
  });
  it('rejects a lookalike deployment, a different signer and a non-creation transaction', async () => {
    mockDeployment({ input: '0x1234' });
    await expect(
      registry.register(owner.address, { transactionHash: idHash('bad') }),
    ).rejects.toThrow('exact Splitt');
    vi.mocked(registry.client.getTransaction).mockResolvedValueOnce({
      from: other.address,
      to: null,
      input: vaultCreation(owner.address, operator),
    } as never);
    await expect(
      registry.register(owner.address, { transactionHash: idHash('bad') }),
    ).rejects.toThrow('exact Splitt');
    vi.mocked(registry.client.getTransaction).mockResolvedValueOnce({
      from: owner.address,
      to: vault,
      input: vaultCreation(owner.address, operator),
    } as never);
    await expect(
      registry.register(owner.address, { transactionHash: idHash('bad') }),
    ).rejects.toThrow('exact Splitt');
  });
  it('rejects a non-Arc RPC and a second vault for the same owner', async () => {
    mockDeployment();
    vi.mocked(registry.client.getChainId).mockResolvedValueOnce(1);
    await expect(
      registry.register(owner.address, { transactionHash: idHash('bad') }),
    ).rejects.toThrow('Only Arc');
    await registry.register(owner.address, { transactionHash: idHash('a') });
    vi.mocked(registry.client.getTransactionReceipt).mockResolvedValueOnce({
      status: 'success',
      contractAddress: operator,
      blockNumber: 101n,
    } as never);
    await expect(
      registry.register(owner.address, { transactionHash: idHash('b') }),
    ).rejects.toThrow('already has');
  });
  it('atomically rolls back excess projects and contractor counts', async () => {
    let state: LiveState = { nextBlock: '1', events: [], jobs: [], plans: [], projects: [] };
    const repo: LiveRepository = {
      snapshot: async () => structuredClone(state),
      transaction: async (fn) => {
        const next = structuredClone(state),
          value = fn(next);
        state = next;
        return value;
      },
    };
    const capped = cappedWorkspace(repo);
    await expect(
      capped.transaction((s) => {
        s.projects = fixtureProjects();
      }),
    ).rejects.toThrow('one project');
    expect(state.projects).toHaveLength(0);
    const project = fixtureProjects()[0];
    project.commitments.push({ ...project.commitments[0], id: 'third' });
    await expect(capped.transaction((s) => s.projects.push(project))).rejects.toThrow(
      'two contractors',
    );
  });
});
describe('durable gas sponsorship limits', () => {
  it('reserves both old and replacement fees and replaces a concurrent rejection only once', async () => {
    await budget.reserve(owner.address, vault, 'fee-job', quote);
    const next = { ...quote, maxFeePerGas: '64000000000', maxPriorityFeePerGas: '60000000000' };
    const results = await Promise.all([
      budget.replaceRejectedFee(owner.address, vault, 'fee-job', quote, next),
      budget.replaceRejectedFee(owner.address, vault, 'fee-job', quote, next),
    ]);
    expect(results).toEqual([next, next]);
    expect(await budget.existing(owner.address, vault, 'fee-job')).toEqual(next);
    const rows = (
      await db.query<{ budget_wei: string }>(
        'SELECT budget_wei::text FROM selfserve_gas_reservations',
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows.reduce((total, r) => total + BigInt(r.budget_wei), 0n)).toBe(6500000000000000n);
  });
  it('keeps the original reservation when a rejected fee cannot fit the remaining budget', async () => {
    await budget.reserve(owner.address, vault, 'fee-job', quote);
    await expect(
      budget.replaceRejectedFee(owner.address, vault, 'fee-job', quote, {
        ...quote,
        maxFeePerGas: '3000000000000',
        maxPriorityFeePerGas: '2000000000000',
      }),
    ).rejects.toThrow('remaining sponsorship budget');
    expect(await budget.existing(owner.address, vault, 'fee-job')).toEqual(quote);
    expect((await db.query('SELECT * FROM selfserve_gas_reservations')).rows).toHaveLength(1);
  });
  it('reserves before sending and returns the same fee cap on retries without counting twice', async () => {
    const first = await budget.reserve(owner.address, vault, 'job', quote);
    const again = await budget.reserve(owner.address, vault, 'job', {
      ...quote,
      maxFeePerGas: '2000000000',
    });
    expect(again).toEqual(first);
    expect(await budget.existing(owner.address, vault, 'job')).toEqual(first);
    expect(await budget.existing(owner.address, vault, 'missing')).toBeUndefined();
    await expect(budget.existing(other.address, vault, 'job')).rejects.toThrow('another workspace');
    expect(circleFee(first)).toEqual({ gasLimit: '100000', maxFee: '1', priorityFee: '0' });
    expect((await db.query('SELECT * FROM selfserve_gas_reservations')).rows).toHaveLength(1);
    await expect(budget.reserve(other.address, vault, 'job', quote)).rejects.toThrow(
      'another workspace',
    );
  });
  it('enforces the wallet batch cap under concurrent requests and resets daily counts', async () => {
    const now = new Date('2026-10-16T12:00:00Z');
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        budget.reserve(owner.address, vault, `job-${i}`, quote, now),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect((await db.query('SELECT * FROM selfserve_gas_reservations')).rows).toHaveLength(3);
    await expect(
      budget.reserve(owner.address, vault, 'tomorrow', quote, new Date('2026-10-17T01:00:00Z')),
    ).resolves.toEqual(quote);
  });
  it('enforces per-wallet gas, aggregate gas and lifetime limits even across different wallets', async () => {
    const expensive = {
      gasLimit: '500000',
      maxFeePerGas: '500000000000',
      maxPriorityFeePerGas: '0',
    };
    await budget.reserve(owner.address, vault, 'one', expensive);
    await expect(budget.reserve(owner.address, vault, 'two', quote)).rejects.toThrow(
      'limit reached',
    );
    for (let i = 1; i < 4; i++)
      await budget.reserve(
        `0x${i.toString(16).padStart(40, '0')}` as Address,
        vault,
        `global-${i}`,
        expensive,
      );
    await expect(budget.reserve(other.address, vault, 'over-global', quote)).rejects.toThrow(
      'limit reached',
    );
    await db.query('UPDATE selfserve_gas_reservations SET budget_wei=$1,day=$2 WHERE job_id=$3', [
      SELF_SERVE.lifetimeGas,
      '2026-10-15',
      'one',
    ]);
    await expect(
      budget.reserve(
        other.address,
        vault,
        'over-lifetime',
        quote,
        new Date('2026-10-17T00:00:00Z'),
      ),
    ).rejects.toThrow('limit reached');
  });
  it('rejects excessive gas and priority fees above the fixed maximum', async () => {
    await expect(
      budget.reserve(owner.address, vault, 'bad', { ...quote, gasLimit: '600001' }),
    ).rejects.toThrow('Gas estimate');
    await expect(
      budget.reserve(owner.address, vault, 'bad', { ...quote, maxPriorityFeePerGas: '2000000000' }),
    ).rejects.toThrow('Gas estimate');
  });
});
