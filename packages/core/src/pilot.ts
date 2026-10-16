import { z } from 'zod';
import {
  baselinePlan,
  buildFacts,
  idHash,
  parseUSDC,
  validatePlan,
  type Project,
} from '@splitt/core';
const amount = z
  .string()
  .trim()
  .regex(/^(0|[1-9]\d*)(\.\d{1,6})?$/)
  .refine((s) => {
    try {
      parseUSDC(s);
      return true;
    } catch {
      return false;
    }
  }, 'Amount is outside the supported range');
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + 'T12:00:00Z');
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Choose a valid date');
export const pilotInputSchema = z
  .object({
    businessAlias: z.string().trim().min(2).max(80),
    invoiceRef: z.string().trim().min(1).max(80),
    invoiceTotal: amount.refine((s) => BigInt(parseUSDC(s)) > 0n, 'Invoice must be positive'),
    received: amount,
    reserve: amount,
    sessionDate: day,
    consent: z.literal(true),
    realCase: z.literal(true),
    contractors: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(60),
            owed: amount.refine((s) => BigInt(parseUSDC(s)) > 0n, 'Obligation must be positive'),
            dueDate: day,
            partialAllowed: z.boolean(),
            blocksDelivery: z.boolean(),
          })
          .strict(),
      )
      .min(2)
      .max(8),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (BigInt(parseUSDC(input.received)) > BigInt(parseUSDC(input.invoiceTotal)))
      ctx.addIssue({
        code: 'custom',
        path: ['received'],
        message: 'Receipt exceeds the invoice. Review the case before planning.',
      });
    if (
      new Set(input.contractors.map((c) => c.name.toLowerCase())).size !== input.contractors.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['contractors'],
        message: 'Use a distinct name or alias for each contractor.',
      });
  });
export type PilotInput = z.infer<typeof pilotInputSchema>;
export function planPilot(input: unknown) {
  const data = pilotInputSchema.parse(input);
  // No wallet is invented or requested for planning. Zero addresses cannot pass live registration.
  const zero = '0x0000000000000000000000000000000000000000' as const;
  const received = parseUSDC(data.received);
  const project: Project = {
    id: 'pilot-local',
    onchainId: idHash('pilot-local'),
    name: data.businessAlias,
    client: 'Participant case',
    clientWallet: zero,
    invoiceRef: data.invoiceRef,
    invoiceTotal: parseUSDC(data.invoiceTotal),
    received,
    balance: received,
    reserve: parseUSDC(data.reserve),
    perPayment: received,
    perDay: received,
    spentToday: '0',
    version: 1,
    paused: false,
    unresolved: false,
    source: 'pilot_mirrored',
    commitments: data.contractors.map((c, i) => ({
      id: `contractor-${i}`,
      onchainId: idHash(`pilot-contractor-${i}`),
      projectId: 'pilot-local',
      name: c.name,
      role: 'Approved contractor work',
      payee: zero,
      maximum: parseUSDC(c.owed),
      paid: '0',
      dueDate: c.dueDate,
      deferUntil: null,
      accepted: true,
      acceptedAt: data.sessionDate,
      blocksDelivery: c.blocksDelivery,
      partialAllowed: c.partialAllowed,
      cancelled: false,
      activeAfter: 0,
      dependsOn: null,
    })),
  };
  const facts = buildFacts(project, new Date(data.sessionDate + 'T12:00:00Z'));
  const output = baselinePlan(facts),
    validation = validatePlan(output, facts, facts);
  if (!validation.ok) throw new Error('The case could not produce a valid allocation.');
  return { input: data, output, validation };
}
export const pilotFeedbackSchema = z
  .object({
    decision: z.enum(['accepted', 'would_change', 'not_useful']),
    detail: z.string().trim().min(3).max(1000),
    quotePermission: z.boolean(),
  })
  .strict();
export function pilotEvidence(
  input: unknown,
  feedback: unknown,
  startedAt: string,
  now = new Date(),
) {
  const result = planPilot(input),
    review = pilotFeedbackSchema.parse(feedback);
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start) || start > now.getTime()) throw new Error('Invalid session start.');
  return {
    schemaVersion: 1,
    classification: 'pilot_mirrored' as const,
    evidenceStatus: 'participant_reported_unverified' as const,
    networkActivity: 'none' as const,
    customerPaymentVolumeMicro: '0',
    startedAt,
    recordedAt: now.toISOString(),
    elapsedSeconds: Math.floor((now.getTime() - start) / 1000),
    case: result.input,
    proposal: result.output,
    validation: result.validation,
    feedback: review,
  };
}
