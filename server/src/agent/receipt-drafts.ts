import { randomUUID } from 'node:crypto';
import type { TestnetService } from '../live/service.js';

/** Receipt-driven planning only. This worker never prepares, signs or submits a batch. */
export async function draftReceipts(service: TestnetService, now = Date.now()) {
  const token = randomUUID();
  const task = await service.repo.transaction((s) => {
    const tasks = (s.receiptDrafts ??= []);
    const known = new Set(tasks.map((t) => t.id));
    for (const event of s.events) {
      if (
        event.source !== 'arc_testnet' ||
        !['PaymentReceived', 'PaymentAttributed'].includes(event.name) ||
        known.has(event.id)
      )
        continue;
      if (!/^[1-9]\d*$/.test(event.args.amount ?? '')) continue;
      const project = s.projects.find(
        (p) => p.onchainId.toLowerCase() === event.args.projectId?.toLowerCase(),
      );
      if (!project) continue; // Revisit after metadata registration; raw transfers cannot trigger planning.
      tasks.push({
        id: event.id,
        projectId: project.id,
        state: 'pending',
        attempts: 0,
        leaseUntil: 0,
      });
      known.add(event.id);
    }
    const next = tasks.find(
      (t) =>
        ['pending', 'working'].includes(t.state) &&
        t.leaseUntil <= now &&
        !tasks.some(
          (other) =>
            other !== t &&
            other.projectId === t.projectId &&
            other.state === 'working' &&
            other.leaseUntil > now,
        ),
    );
    if (!next) return;
    next.state = 'working';
    next.attempts++;
    next.leaseToken = token;
    next.leaseUntil = now + 120000;
    return next;
  });
  if (!task) return;
  try {
    return await service.plan(task.projectId, { receiptId: task.id, leaseToken: token });
  } catch {
    // Provider failures may contain secrets; persist only a fixed diagnostic.
    await service.repo.transaction((s) => {
      const current = s.receiptDrafts?.find((t) => t.id === task.id);
      if (!current || current.leaseToken !== token || current.state !== 'working') return;
      current.state = current.attempts >= 5 ? 'needs_review' : 'pending';
      current.leaseUntil = now + Math.min(300000, 15000 * 2 ** current.attempts);
      current.lastError =
        'No current payable draft could be prepared. Review project limits, obligations and pending settlement.';
      if (current.state === 'needs_review') {
        const notifications = (s.notifications ??= []);
        if (!notifications.some((n) => n.id === `receipt:${task.id}`))
          notifications.push({
            id: `receipt:${task.id}`,
            projectId: task.projectId,
            kind: 'receipt_needs_review',
            message: current.lastError,
            createdAt: new Date(now).toISOString(),
          });
      }
    });
  }
}
