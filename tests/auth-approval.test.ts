import { afterEach, describe, expect, it } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../server/src/app.js';
import { FixtureStore } from '../server/src/store.js';
import { approvalTypedData } from '../server/src/approvals.js';

const owner = privateKeyToAccount(generatePrivateKey());
const outsider = privateKeyToAccount(generatePrivateKey());
const vault = '0x0000000000000000000000000000000000000123' as const;
let app: FastifyInstance;
let clock = new Date();
let cookie = '';
let csrf = '';
let store: FixtureStore;
afterEach(async () => {
  await app?.close();
});
async function setup() {
  clock = new Date();
  cookie = '';
  csrf = '';
  store = new FixtureStore();
  app = await buildApp(store, false, {
    auth: { owner: owner.address, now: () => clock },
    approval: { owner: owner.address, vault, now: () => clock },
  });
}
const post = (
  url: string,
  payload: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) =>
  app.inject({
    method: 'POST',
    url,
    payload,
    headers: { origin: 'http://localhost:3000', cookie, 'x-splitt-csrf': csrf, ...headers },
  });
async function login() {
  const challenge = (await post('/auth/challenge', { address: owner.address })).json();
  const signature = await owner.signMessage({ message: challenge.message });
  const response = await post('/auth/verify', { nonce: challenge.nonce, signature });
  expect(response.statusCode).toBe(200);
  cookie = String(response.headers['set-cookie']).split(';')[0];
  csrf = response.json().csrf;
  return { challenge, signature, response };
}
async function prepared() {
  await login();
  const plan = (await post('/projects/northstar/replan')).json();
  const response = await post(`/plans/${plan.id}/prepare`);
  expect(response.statusCode).toBe(200);
  return { plan, approval: response.json().approval };
}
describe('owner sessions and exact batch approval', () => {
  it('protects reads and writes, denies outsiders, and requires CSRF with the owner cookie', async () => {
    await setup();
    expect((await app.inject('/workspace')).statusCode).toBe(401);
    expect((await post('/projects/northstar/replan')).statusCode).toBe(401);
    expect((await post('/auth/challenge', { address: outsider.address })).statusCode).toBe(403);
    const { response } = await login();
    expect(response.headers['set-cookie']).toContain('HttpOnly');
    expect(response.headers['set-cookie']).toContain('SameSite=Strict');
    expect(response.headers['set-cookie']).toContain('Path=/api');
    expect((await app.inject({ url: '/workspace', headers: { cookie } })).statusCode).toBe(200);
    expect((await post('/projects/northstar/replan', {}, { 'x-splitt-csrf': '' })).statusCode).toBe(
      403,
    );
    expect(
      (await post('/projects/northstar/replan', {}, { origin: 'https://attacker.example' }))
        .statusCode,
    ).toBe(403);
    expect((await post('/projects/northstar/replan')).statusCode).toBe(200);
    await post('/auth/logout');
    expect((await app.inject({ url: '/workspace', headers: { cookie } })).statusCode).toBe(401);
  });
  it('accepts a challenge once under concurrent replay attempts', async () => {
    await setup();
    const c = (await post('/auth/challenge', { address: owner.address })).json();
    const signature = await owner.signMessage({ message: c.message });
    const results = await Promise.all([
      post('/auth/verify', { nonce: c.nonce, signature }),
      post('/auth/verify', { nonce: c.nonce, signature }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 401]);
  });
  it('rejects expired challenges, forged wallets, altered domains and chain IDs', async () => {
    await setup();
    const c = (await post('/auth/challenge', { address: owner.address })).json();
    for (const message of [
      c.message.replace('localhost:3000', 'attacker.example'),
      c.message.replace('Chain ID: 5042002', 'Chain ID: 1'),
    ]) {
      expect(
        (
          await post('/auth/verify', {
            nonce: c.nonce,
            signature: await owner.signMessage({ message }),
          })
        ).statusCode,
      ).toBe(401);
    }
    expect(
      (
        await post('/auth/verify', {
          nonce: c.nonce,
          signature: await outsider.signMessage({ message: c.message }),
        })
      ).statusCode,
    ).toBe(401);
    clock = new Date(clock.getTime() + 300001);
    expect(
      (
        await post('/auth/verify', {
          nonce: c.nonce,
          signature: await owner.signMessage({ message: c.message }),
        })
      ).statusCode,
    ).toBe(401);
  });
  it('expires sessions and rejects invented cookies', async () => {
    await setup();
    await login();
    expect(
      (
        await app.inject({
          url: '/workspace',
          headers: { cookie: 'splitt_session=' + 'a'.repeat(64) },
        })
      ).statusCode,
    ).toBe(401);
    clock = new Date(clock.getTime() + 8 * 60 * 60 * 1000 + 1);
    expect((await app.inject({ url: '/workspace', headers: { cookie } })).statusCode).toBe(401);
  });
  it('revokes access when vault ownership changes', async () => {
    await setup();
    await app.close();
    let current = owner.address;
    app = await buildApp(store, false, {
      auth: { owner: owner.address, currentOwner: async () => current },
    });
    await login();
    current = outsider.address;
    expect((await app.inject({ url: '/workspace', headers: { cookie } })).statusCode).toBe(403);
  });
  it('stores the exact signature once, without changing balances or sending funds', async () => {
    await setup();
    const { plan, approval } = await prepared();
    expect(approval.domain.name).toBe('Splitt Fixture');
    expect(approval.items.map((i: { amount: string }) => i.amount)).toEqual([
      '700000000',
      '200000000',
    ]);
    const retry = (await post(`/plans/${plan.id}/prepare`)).json().approval;
    expect(retry).toEqual(approval);
    const signature = await owner.signTypedData(approvalTypedData(approval));
    expect((await post(`/plans/${plan.id}/approve`, { signature })).statusCode).toBe(200);
    expect((await post(`/plans/${plan.id}/approve`, { signature })).statusCode).toBe(409);
    const state = store.snapshot();
    expect(state.plans[0].approval?.signature).toBe(signature);
    expect(state.projects[0].balance).toBe('1200000000');
    expect(state.projects[0].commitments[0].paid).toBe('0');
    expect(state.ledger.at(-1)?.event).toBe('Fixture batch signed');
  });
  it('rejects signed payload tampering and a signature from a different owner', async () => {
    await setup();
    const { plan, approval } = await prepared();
    const altered = structuredClone(approval);
    altered.message.itemsHash = '0x' + '1'.repeat(64);
    for (const signature of [
      await owner.signTypedData(approvalTypedData(altered)),
      await outsider.signTypedData(approvalTypedData(approval)),
    ]) {
      expect((await post(`/plans/${plan.id}/approve`, { signature })).statusCode).toBe(403);
    }
  });
  it('rejects expired approvals and permits fresh preparation', async () => {
    await setup();
    const { plan, approval } = await prepared();
    const signature = await owner.signTypedData(approvalTypedData(approval));
    clock = new Date(clock.getTime() + 900001);
    expect((await post(`/plans/${plan.id}/approve`, { signature })).statusCode).toBe(409);
    const fresh = (await post(`/plans/${plan.id}/prepare`)).json().approval;
    expect(BigInt(fresh.message.deadline)).toBeGreaterThan(BigInt(approval.message.deadline));
  });
  it('rejects approval after the project changes or a newer plan supersedes it', async () => {
    await setup();
    const { plan, approval } = await prepared();
    const signature = await owner.signTypedData(approvalTypedData(approval));
    await post('/projects/northstar/payments', { amount: '100000000' });
    expect((await post(`/plans/${plan.id}/approve`, { signature })).statusCode).toBe(409);
    await post('/projects/northstar/replan');
    expect((await post(`/plans/${plan.id}/prepare`)).statusCode).toBe(409);
  });
});
