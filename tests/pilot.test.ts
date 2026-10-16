import { describe, it, expect } from 'vitest';
import { planPilot, pilotEvidence } from '../packages/core/src/pilot.js';
const input = {
  businessAlias: 'Agency alias',
  invoiceRef: 'AG-1',
  invoiceTotal: '2000',
  received: '1200',
  reserve: '300',
  sessionDate: '2026-10-16',
  consent: true as const,
  realCase: true as const,
  contractors: [
    {
      name: 'Contractor A',
      owed: '700',
      dueDate: '2026-10-15',
      partialAllowed: false,
      blocksDelivery: true,
    },
    {
      name: 'Contractor B',
      owed: '500',
      dueDate: '2026-10-16',
      partialAllowed: true,
      blocksDelivery: false,
    },
  ],
};
describe('participant-owned pilot cases', () => {
  it('plans entered obligations, not fixtures, and protects the entered reserve', () => {
    const result = planPilot(input);
    expect(result.validation.total).toBe('900000000');
    expect(result.output.items.map((i) => i.commitment_id)).toEqual([
      'contractor-0',
      'contractor-1',
    ]);
    expect(result.input.businessAlias).toBe('Agency alias');
  });
  it('requires consent and an actual-case declaration', () => {
    expect(() => planPilot({ ...input, consent: false })).toThrow();
    expect(() => planPilot({ ...input, realCase: false })).toThrow();
  });
  it('rejects over-receipts, invalid dates and duplicate aliases', () => {
    expect(() => planPilot({ ...input, received: '2001' })).toThrow();
    expect(() => planPilot({ ...input, sessionDate: '2026-02-31' })).toThrow();
    expect(() =>
      planPilot({ ...input, contractors: [input.contractors[0], input.contractors[0]] }),
    ).toThrow();
  });
  it('does not invent payments when the reserve exceeds cash', () => {
    expect(planPilot({ ...input, reserve: '1500' }).validation.total).toBe('0');
  });
  it('exports feedback without converting a planning case into adoption or volume', () => {
    const evidence = pilotEvidence(
      input,
      {
        decision: 'would_change',
        detail: 'I would wait for the client remainder.',
        quotePermission: false,
      },
      '2026-10-16T10:00:00Z',
      new Date('2026-10-16T10:20:00Z'),
    );
    expect(evidence.elapsedSeconds).toBe(1200);
    expect(evidence.classification).toBe('pilot_mirrored');
    expect(evidence.customerPaymentVolumeMicro).toBe('0');
    expect(evidence.evidenceStatus).toBe('participant_reported_unverified');
    expect(evidence.feedback.quotePermission).toBe(false);
    expect(JSON.stringify(evidence)).not.toContain('0x0000');
  });
});
