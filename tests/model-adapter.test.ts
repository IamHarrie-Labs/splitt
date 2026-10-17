import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { baselinePlan, buildFacts } from '@splitt/core';
import { fixtureProjects } from '../server/src/fixtures.js';
const mocks = vi.hoisted(() => ({ create: vi.fn(), configure: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    static APIError = class extends Error {
      status = 429;
    };
    messages = { create: mocks.create };
    constructor(config: unknown) {
      mocks.configure(config);
    }
  },
}));
import { propose } from '../server/src/agent/planner.js';
const facts = () => buildFacts(fixtureProjects()[0], new Date('2026-10-03T12:00:00Z'));
beforeEach(() => {
  vi.clearAllMocks();
  for (const key of [
    'ANTHROPIC_API_KEY',
    'AI_GATEWAY_API_KEY',
    'VERCEL_OIDC_TOKEN',
    'PLANNER_MODEL',
    'PLANNER_PROVIDER',
  ])
    vi.stubEnv(key, '');
});
afterEach(() => vi.unstubAllEnvs());
describe('model adapter safety', () => {
  it('reserves correction requests separately and stops when the next reservation is denied', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-only-anthropic');
    vi.stubEnv('PLANNER_MODEL', 'test-model');
    const invalid = baselinePlan(facts());
    invalid.items[0].amount_micro = '2000000000';
    mocks.create.mockResolvedValue({
      content: [{ type: 'tool_use', input: invalid }],
      stop_reason: 'tool_use',
    });
    const permit = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const result = await propose(facts(), permit);
    expect(result.attempts).toBe(1);
    expect(result.fallbackUsed).toBe(true);
    expect(result.failureCodes).toEqual(['VALIDATION_REJECTED', 'MODEL_BUDGET_EXHAUSTED']);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(permit).toHaveBeenCalledTimes(2);
  });
  it('falls back without a provider request when the hosted request budget is exhausted', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-only-anthropic');
    vi.stubEnv('PLANNER_MODEL', 'test-model');
    const result = await propose(facts(), async () => false);
    expect(result.fallbackUsed).toBe(true);
    expect(result.attempts).toBe(0);
    expect(result.failureCodes).toContain('MODEL_BUDGET_EXHAUSTED');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('does not call a provider when no credential is configured', async () => {
    const result = await propose(facts());
    expect(result.fallbackUsed).toBe(true);
    expect(result.attempts).toBe(0);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('uses the server-only gateway credential and accepts a validated tool response', async () => {
    vi.stubEnv('PLANNER_PROVIDER', 'vercel-gateway');
    vi.stubEnv('AI_GATEWAY_API_KEY', 'test-only-gateway');
    vi.stubEnv('PLANNER_MODEL', 'test-model');
    const expected = baselinePlan(facts());
    mocks.create.mockResolvedValue({
      content: [{ type: 'tool_use', input: expected }],
      stop_reason: 'tool_use',
    });
    const result = await propose(facts());
    expect(mocks.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-only-gateway',
        baseURL: 'https://ai-gateway.vercel.sh',
        maxRetries: 0,
      }),
    );
    expect(result.fallbackUsed).toBe(false);
    expect(result.output).toEqual(expected);
  });
  it('rejects overspending twice then returns the safe baseline', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-only-anthropic');
    vi.stubEnv('PLANNER_MODEL', 'test-model');
    const invalid = baselinePlan(facts());
    invalid.items[0].amount_micro = '2000000000';
    mocks.create.mockResolvedValue({
      content: [{ type: 'tool_use', input: invalid }],
      stop_reason: 'tool_use',
    });
    const result = await propose(facts());
    expect(result.fallbackUsed).toBe(true);
    expect(result.output).toEqual(baselinePlan(facts()));
    expect(result.failureCodes).toEqual(['VALIDATION_REJECTED', 'VALIDATION_REJECTED']);
    expect(result.validationCodes).toHaveLength(2);
    expect(result.validationCodes?.[0]).toContain('COMMITMENT_CAP');
    expect(JSON.stringify(result.validationCodes)).not.toContain('private-provider');
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(JSON.parse(mocks.create.mock.calls[1][0].messages[0].content).correction).not.toBe('');
    expect(JSON.parse(mocks.create.mock.calls[1][0].messages[0].content).previousProposal).toEqual(
      invalid,
    );
  });
  it('keeps provider error bodies out of diagnostics', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-only-anthropic');
    vi.stubEnv('PLANNER_MODEL', 'test-model');
    mocks.create.mockRejectedValue(new Error('private-provider-debug-information'));
    const result = await propose(facts());
    expect(result.failureCodes).toEqual(['PROVIDER_UNAVAILABLE']);
    expect(JSON.stringify(result)).not.toContain('private-provider-debug-information');
    expect(result.attempts).toBe(1);
  });
});
