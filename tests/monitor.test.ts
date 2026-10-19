import { describe, expect, it } from 'vitest';
import { AlertNotifier, evaluate, type VaultHealth } from '../server/src/live/monitor.js';
import type { Job } from '../server/src/live/repository.js';

const now = Date.parse('2026-10-19T12:00:00Z');
const healthy: VaultHealth = {
  usdcBalance: 1_000_000n,
  totalAccounted: 1_000_000n,
  paused: false,
  operatorGas: 10n ** 18n,
};
const job = (id: string, state: Job['state'], minutesAgo: number, lastError?: string) =>
  ({
    id,
    state,
    lastError,
    approval: { signedAt: new Date(now - minutesAgo * 60_000).toISOString() },
  }) as unknown as Job;

describe('payout monitor', () => {
  it('stays quiet when everything is healthy', () => {
    expect(
      evaluate({
        now,
        state: { jobs: [job('a', 'pending', 2), job('b', 'confirmed', 90)] },
        health: healthy,
        consecutiveFailures: 0,
      }),
    ).toEqual([]);
  });

  it('flags drift, pause, low gas, worker failures and stuck, failed or violated jobs', () => {
    const alerts = evaluate({
      now,
      state: {
        jobs: [
          job('stuck', 'pending', 30),
          job('broken', 'failed', 1, 'reverted'),
          job('bad', 'invariant_violation', 1),
        ],
      },
      health: { usdcBalance: 999_999n, totalAccounted: 1_000_000n, paused: true, operatorGas: 1n },
      consecutiveFailures: 12,
    });
    const byKey = Object.fromEntries(alerts.map((a) => [a.key, a.severity]));
    expect(byKey).toEqual({
      'balance-drift': 'critical',
      paused: 'warning',
      'operator-gas': 'warning',
      'worker-failing': 'critical',
      'job-stuck:stuck': 'warning',
      'job-failed:broken': 'warning',
      'job-invariant:bad': 'critical',
    });
  });

  it('treats extra unattributed USDC as normal, not drift', () => {
    expect(
      evaluate({
        now,
        state: { jobs: [] },
        health: { ...healthy, usdcBalance: 2_000_000n },
        consecutiveFailures: 0,
      }),
    ).toEqual([]);
  });

  it('sends new alerts once, repeats them hourly and reports when they clear', async () => {
    const sent: string[] = [];
    const notifier = new AlertNotifier(async (t) => void sent.push(t), 'Splitt Arc Mainnet');
    const paused = { key: 'paused', severity: 'warning' as const, message: 'The vault is paused.' };
    await notifier.update([paused], now);
    await notifier.update([paused], now + 60_000);
    expect(sent).toEqual(['[Splitt Arc Mainnet] WARNING: The vault is paused.']);
    await notifier.update([paused], now + 61 * 60_000);
    expect(sent).toHaveLength(2);
    await notifier.update([], now + 62 * 60_000);
    expect(sent[2]).toBe('[Splitt Arc Mainnet] RESOLVED: The vault is paused.');
    expect(notifier.current()).toEqual([]);
  });

  it('keeps working when the webhook is down', async () => {
    const notifier = new AlertNotifier(async () => {
      throw new Error('webhook offline');
    }, 'Splitt');
    await expect(
      notifier.update([{ key: 'x', severity: 'critical', message: 'x' }], now),
    ).resolves.toHaveLength(1);
  });
});
