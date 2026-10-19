import type { LiveState } from './repository.js';

export type Alert = { key: string; severity: 'critical' | 'warning'; message: string };
export type VaultHealth = {
  /** ERC-20 USDC the vault holds and has accounted to projects (6 decimals). */
  usdcBalance: bigint;
  totalAccounted: bigint;
  paused: boolean;
  /** Native USDC the operator holds for gas (18 decimals). */
  operatorGas: bigint;
};
export type MonitorInput = {
  now: number;
  state: Pick<LiveState, 'jobs'>;
  /** Null when the chain could not be read this round. */
  health: VaultHealth | null;
  consecutiveFailures: number;
};
export const THRESHOLDS = {
  stuckMinutes: 15,
  lowGasWei: 200_000_000_000_000_000n, // 0.2 USDC of gas
  failureTicks: 12, // the worker ticks every 5 s, so about a minute of failures
};

/** Turns one health snapshot into the alerts an operator must see. Pure, so it is easy to test. */
export function evaluate(input: MonitorInput, t = THRESHOLDS): Alert[] {
  const alerts: Alert[] = [];
  const { health } = input;
  if (health) {
    if (health.usdcBalance < health.totalAccounted)
      alerts.push({
        key: 'balance-drift',
        severity: 'critical',
        message: `Vault holds ${health.usdcBalance} micro-USDC but accounts for ${health.totalAccounted}. Pause and investigate.`,
      });
    if (health.paused)
      alerts.push({
        key: 'paused',
        severity: 'warning',
        message: 'The vault is paused; payouts are stopped.',
      });
    if (health.operatorGas < t.lowGasWei)
      alerts.push({
        key: 'operator-gas',
        severity: 'warning',
        message: 'The Circle operator is low on gas. Top it up before the next payout.',
      });
  }
  if (input.consecutiveFailures >= t.failureTicks)
    alerts.push({
      key: 'worker-failing',
      severity: 'critical',
      message: `The payout worker has failed ${input.consecutiveFailures} times in a row. Check the RPC and Circle.`,
    });
  for (const job of input.state.jobs) {
    const age = job.approval.signedAt
      ? (input.now - Date.parse(job.approval.signedAt)) / 60_000
      : 0;
    if (job.state === 'invariant_violation')
      alerts.push({
        key: `job-invariant:${job.id}`,
        severity: 'critical',
        message: `Batch ${job.id} hit an invariant violation and was stopped.`,
      });
    else if (job.state === 'failed')
      alerts.push({
        key: `job-failed:${job.id}`,
        severity: 'warning',
        message: `Batch ${job.id} failed: ${job.lastError ?? 'see the job log'}.`,
      });
    else if (['queued', 'submitting', 'pending'].includes(job.state) && age > t.stuckMinutes)
      alerts.push({
        key: `job-stuck:${job.id}`,
        severity: 'warning',
        message: `Batch ${job.id} has been ${job.state} for ${Math.round(age)} minutes.`,
      });
  }
  return alerts;
}

/** Sends new alerts, repeats active ones hourly, and reports when they clear. */
export class AlertNotifier {
  private active = new Map<string, { alert: Alert; sentAt: number }>();
  constructor(
    private send: (text: string) => Promise<void>,
    private label: string,
    private repeatMs = 60 * 60_000,
  ) {}
  current() {
    return [...this.active.values()].map((a) => a.alert);
  }
  async update(alerts: Alert[], now: number) {
    const messages: string[] = [];
    const seen = new Set(alerts.map((a) => a.key));
    for (const alert of alerts) {
      const known = this.active.get(alert.key);
      if (!known || now - known.sentAt >= this.repeatMs) {
        messages.push(`[${this.label}] ${alert.severity.toUpperCase()}: ${alert.message}`);
        this.active.set(alert.key, { alert, sentAt: now });
      } else known.alert = alert;
    }
    for (const [key, { alert }] of this.active)
      if (!seen.has(key)) {
        messages.push(`[${this.label}] RESOLVED: ${alert.message}`);
        this.active.delete(key);
      }
    for (const text of messages) await this.send(text).catch(() => undefined);
    return messages;
  }
}

/** Posts to a Slack- or Discord-compatible incoming webhook; a no-op when none is configured. */
export function webhookSender(url = process.env.ALERT_WEBHOOK_URL) {
  return async (text: string) => {
    if (!url) return;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(10_000),
    });
  };
}
