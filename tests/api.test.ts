import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../server/src/app.js';
import { FixtureStore } from '../server/src/store.js';
import type { FastifyInstance } from 'fastify';
let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});
const post = (url: string, payload = {}) =>
  app.inject({ method: 'POST', url, payload, headers: { origin: 'http://localhost:3000' } });
describe('fixture workflow', () => {
  it('settles the initial plan, receives the remainder, and pays only the unpaid obligation', async () => {
    app = await buildApp(new FixtureStore());
    const first = (await post('/projects/northstar/replan')).json();
    expect(first.validation.total).toBe('900000000');
    expect((await post(`/plans/${first.id}/simulate`)).statusCode).toBe(200);
    expect((await post(`/plans/${first.id}/simulate`)).statusCode).toBe(409);
    await post('/projects/northstar/payments', { amount: '800000000' });
    const second = (await post('/projects/northstar/replan')).json();
    expect(second.output.items.filter((i: { action: string }) => i.action === 'pay')).toHaveLength(
      1,
    );
    expect(second.validation.total).toBe('300000000');
    await post(`/plans/${second.id}/simulate`);
    const state = (await app.inject('/workspace')).json();
    expect(state.projects[0].balance).toBe('800000000');
    expect(state.projects[1].balance).toBe('1000000000');
  });
  it('recovers the original interrupted batch without another payment', async () => {
    app = await buildApp(new FixtureStore());
    const plan = (await post('/projects/northstar/replan')).json();
    await post(`/plans/${plan.id}/simulate`, { interrupt: true });
    expect((await post('/projects/northstar/replan')).statusCode).toBe(409);
    await post(`/plans/${plan.id}/reconcile`);
    const state = (await app.inject('/workspace')).json();
    expect(state.projects[0].commitments[0].paid).toBe('700000000');
    expect(
      state.ledger.filter((e: { event: string }) => e.event === 'Fixture payout'),
    ).toHaveLength(2);
  });
  it('unknown funds remain outside project balance until confirmed once', async () => {
    app = await buildApp(new FixtureStore());
    const payment = (
      await post('/projects/northstar/payments', { amount: '100000000', unknown: true })
    ).json();
    expect((await app.inject('/workspace')).json().projects[0].balance).toBe('1200000000');
    expect(
      (await post(`/payments/${payment.id}/confirm`, { projectId: 'northstar' })).statusCode,
    ).toBe(200);
    expect(
      (await post(`/payments/${payment.id}/confirm`, { projectId: 'northstar' })).statusCode,
    ).toBe(409);
    expect((await app.inject('/workspace')).json().projects[0].balance).toBe('1300000000');
  });
  it('blocks cross-origin mutations and malformed inputs', async () => {
    app = await buildApp(new FixtureStore());
    expect(
      (await app.inject({ method: 'POST', url: '/fixture/reset', payload: {} })).statusCode,
    ).toBe(403);
    expect((await post('/projects/northstar/payments', { amount: '-1' })).statusCode).toBe(400);
  });
});
