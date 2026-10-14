export type Resolution = 'confirmed' | 'failed' | 'unresolved' | 'invariant_violation';
/** A provider response alone never establishes that a payment happened. */
export function resolveBatch(
  executed: boolean[],
  circleState: string,
  receiptStatus?: 'success' | 'reverted',
): Resolution {
  if (!executed.length) return 'invariant_violation';
  if (executed.every(Boolean)) return 'confirmed';
  if (executed.some(Boolean)) return 'invariant_violation';
  if (receiptStatus === 'reverted' || ['FAILED', 'DENIED', 'CANCELLED'].includes(circleState))
    return 'failed';
  return 'unresolved';
}
