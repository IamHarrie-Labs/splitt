import { describe, expect, it } from 'vitest';
import { baselinePlan, buildFacts, hashJson, parseUSDC, validatePlan } from '@splitt/core';
import { fixtureProjects } from '../server/src/fixtures.js';
import { demoNow } from '../server/src/store.js';
import { resolveBatch } from '../server/src/reconcile/resolve.js';
const setup = () => {
  const project = fixtureProjects()[0];
  const facts = buildFacts(project, demoNow());
  return { project, facts, plan: baselinePlan(facts) };
};
describe('allocation safety', () => {
  it.each([
    ['OVERDUE', 0],
    ['BLOCKS_DELIVERY', 1],
    ['PARTIAL_PERMITTED', 0],
    ['WITHIN_DEFER_TERMS', 1],
  ] as const)('rejects a false %s reason even when amounts are legal', (reason, index) => {
    const facts = buildFacts(fixtureProjects()[0], new Date('2026-10-03T12:00:00Z'));
    const plan = baselinePlan(facts);
    plan.items[index].reason_codes.push(reason);
    expect(validatePlan(plan, facts, facts).errors.map((error) => error.code)).toContain(
      'REASON_FACT_MISMATCH',
    );
  });
  it('allocates 700 and 200 while protecting the 300 reserve', () => {
    const { facts, plan } = setup();
    expect(plan.items.map((i) => i.amount_micro)).toEqual(['700000000', '200000000']);
    expect(validatePlan(plan, facts, facts).ok).toBe(true);
  });
  it('changes priority when the dependency and deadline change', () => {
    const { project } = setup();
    project.commitments[0].blocksDelivery = false;
    project.commitments[1].dueDate = '2026-10-01';
    const plan = baselinePlan(buildFacts(project, demoNow()));
    expect(plan.items[0].commitment_id).toBe('tobi');
  });
  it('never pays a non-partial commitment partially', () => {
    const { project } = setup();
    project.commitments[1].partialAllowed = false;
    const facts = buildFacts(project, demoNow());
    const plan = baselinePlan(facts);
    expect(plan.items.find((i) => i.commitment_id === 'tobi')?.action).toBe('defer');
    expect(validatePlan(plan, facts, facts).ok).toBe(true);
  });
  it('rejects reserve breaches and forged facts', () => {
    const { facts, plan } = setup();
    plan.items[1].amount_micro = '400000000';
    expect(
      validatePlan(plan, facts, facts).errors.some((e) => e.code === 'RESERVE_OR_DAILY_CAP'),
    ).toBe(true);
    plan.items[0].fact_refs.push('F999');
    expect(validatePlan(plan, facts, facts).errors.some((e) => e.code === 'FACT_REFERENCE')).toBe(
      true,
    );
  });
  it('rejects unaccepted work and duplicate commitments', () => {
    const { project, facts, plan } = setup();
    project.commitments[0].accepted = false;
    expect(
      validatePlan(plan, facts, buildFacts(project, demoNow())).errors.some(
        (e) => e.code === 'INELIGIBLE',
      ),
    ).toBe(true);
    plan.items.push(plan.items[0]);
    expect(validatePlan(plan, facts, facts).errors.some((e) => e.code === 'DUPLICATE')).toBe(true);
  });
  it('reports an unfunded hard obligation rather than deferring outside terms', () => {
    const { project } = setup();
    project.balance = '600000000';
    const facts = buildFacts(project, demoNow());
    const plan = baselinePlan(facts);
    expect(plan.unfunded_shortfall_micro).toBe('700000000');
    expect(plan.escalations.length).toBeGreaterThan(0);
    expect(validatePlan(plan, facts, facts).ok).toBe(true);
    plan.unfunded_shortfall_micro = '0';
    expect(validatePlan(plan, facts, facts).ok).toBe(false);
  });
  it('rejects stale policy and other-project commitments', () => {
    const { project, facts, plan } = setup();
    project.version++;
    expect(validatePlan(plan, facts, buildFacts(project, demoNow())).ok).toBe(false);
    plan.items[0].commitment_id = 'fieldwork-foreign';
    expect(validatePlan(plan, facts, facts).ok).toBe(false);
  });
  it('keeps plans blocked while settlement is unresolved', () => {
    const { project } = setup();
    project.unresolved = true;
    expect(buildFacts(project, demoNow()).eligible).toHaveLength(0);
  });
  it('caps partial payments by per-payment and daily limits', () => {
    const { project } = setup();
    project.perPayment = '100000000';
    project.perDay = '150000000';
    const facts = buildFacts(project, demoNow());
    expect(validatePlan(baselinePlan(facts), facts, facts).ok).toBe(true);
    expect(baselinePlan(facts).items.find((i) => i.action === 'pay')?.amount_micro).toBe(
      '100000000',
    );
  });
});
describe('money and hashing', () => {
  it('uses canonical ordering and exact micro amounts', () => {
    expect(hashJson({ b: '2', a: '1' })).toBe(hashJson({ a: '1', b: '2' }));
    expect(parseUSDC('0.000001')).toBe('1');
    expect(parseUSDC('2000')).toBe('2000000000');
  });
  it.each(['1e6', '-1', '0.0000001', 'NaN', '1,000', '01'])(
    'rejects malformed money %s',
    (input) => {
      expect(() => parseUSDC(input)).toThrow();
    },
  );
});
describe('reconciliation', () => {
  it('never treats an API status as chain confirmation', () => {
    expect(resolveBatch([false, false], 'COMPLETE')).toBe('unresolved');
    expect(resolveBatch([true, true], 'SENT')).toBe('confirmed');
    expect(resolveBatch([true, false], 'COMPLETE')).toBe('invariant_violation');
    expect(resolveBatch([false], 'FAILED')).toBe('failed');
  });
});
