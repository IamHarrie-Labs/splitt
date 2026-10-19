import { canonicalize } from 'json-canonicalize';
import { encodeAbiParameters, keccak256, toHex, type Hex } from 'viem';
import { z } from 'zod';

export const moneySchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, 'Use a positive base-unit integer string')
  .refine((value) => BigInt(value) <= 9223372036854775807n, 'Amount exceeds database range');
export const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .refine((v) => !/^0x0{40}$/.test(v), 'A non-zero wallet address is required');
export const reasonCodes = [
  'BLOCKS_DELIVERY',
  'OVERDUE',
  'LONG_WAIT',
  'PARTIAL_PERMITTED',
  'WITHIN_DEFER_TERMS',
  'RESERVE_PROTECTED',
  'CASH_INSUFFICIENT',
  'DEVIATES_FROM_BASELINE',
] as const;
export const planOutputSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            commitment_id: z.string(),
            action: z.enum(['pay', 'defer']),
            amount_micro: moneySchema,
            reason_codes: z.array(z.enum(reasonCodes)).min(1),
            fact_refs: z.array(z.string()).min(1),
            explanation: z.string().min(1).max(400),
          })
          .strict(),
      )
      .max(32),
    unfunded_shortfall_micro: moneySchema,
    escalations: z.array(z.object({ kind: z.string(), detail: z.string() })),
    confidence: z.enum(['low', 'medium', 'high']),
  })
  .strict();
export type PlanOutput = z.infer<typeof planOutputSchema>;
export type Commitment = {
  id: string;
  onchainId: Hex;
  projectId: string;
  name: string;
  role: string;
  payee: Hex;
  maximum: string;
  paid: string;
  dueDate: string;
  deferUntil: string | null;
  accepted: boolean;
  acceptedAt: string;
  blocksDelivery: boolean;
  partialAllowed: boolean;
  cancelled: boolean;
  activeAfter: number;
  dependsOn: string | null;
};
export type Project = {
  id: string;
  onchainId: Hex;
  name: string;
  client: string;
  clientWallet: Hex;
  invoiceRef: string;
  invoiceTotal: string;
  received: string;
  balance: string;
  reserve: string;
  perPayment: string;
  perDay: string;
  spentToday: string;
  version: number;
  commitments: Commitment[];
  paused: boolean;
  source: 'fixture' | 'pilot_mirrored' | 'pilot_real';
  unresolved: boolean;
};
export type Facts = {
  projectId: string;
  projectVersion: number;
  today: string;
  balance: string;
  reserve: string;
  spendable: string;
  perPayment: string;
  dailyHeadroom: string;
  eligible: Commitment[];
  hardDue: string;
  facts: { id: string; commitmentId: string | null; field: string; value: string | boolean }[];
  blocked: { id: string; reason: string }[];
};
export function hashJson(value: unknown): Hex {
  return keccak256(toHex(canonicalize(value)));
}
export function idHash(id: string): Hex {
  return keccak256(toHex(id));
}
export function parseUSDC(value: string): string {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value))
    throw new Error('Enter a non-negative USDC amount with at most six decimals.');
  const [whole, fraction = ''] = value.split('.');
  return moneySchema.parse((BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'))).toString());
}
export function formatUSDC(value: string): string {
  const amount = BigInt(value);
  const whole = amount / 1000000n;
  const fraction = (amount % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
  return whole.toLocaleString('en-US') + (fraction ? '.' + fraction : '');
}
const min = (...values: bigint[]) => values.reduce((a, b) => (a < b ? a : b));
const positive = (value: bigint) => (value > 0n ? value : 0n);
export function buildFacts(project: Project, now = new Date()): Facts {
  const today = now.toISOString().slice(0, 10);
  const daily = positive(BigInt(project.perDay) - BigInt(project.spentToday));
  const cash = positive(BigInt(project.balance) - BigInt(project.reserve));
  const blocked: Facts['blocked'] = [];
  const eligible: Commitment[] = [];
  for (const c of project.commitments) {
    let reason = c.cancelled
      ? 'Cancelled'
      : !c.accepted
        ? 'Work not accepted'
        : c.activeAfter > now.getTime() / 1000
          ? 'Payee activation delay'
          : BigInt(c.paid) >= BigInt(c.maximum)
            ? 'Already paid'
            : project.unresolved
              ? 'Settlement unresolved'
              : project.paused
                ? 'Vault paused'
                : '';
    if (
      !reason &&
      c.dependsOn &&
      !project.commitments.some((d) => d.id === c.dependsOn && BigInt(d.paid) === BigInt(d.maximum))
    )
      reason = 'Dependency not fully paid';
    if (reason) blocked.push({ id: c.id, reason });
    else eligible.push(c);
  }
  const hardDue = eligible
    .filter((c) => c.dueDate <= today && (!c.deferUntil || c.deferUntil < today))
    .reduce((sum, c) => sum + BigInt(c.maximum) - BigInt(c.paid), 0n);
  const facts: Facts['facts'] = [
    { id: 'F1', commitmentId: null, field: 'balance', value: project.balance },
    { id: 'F2', commitmentId: null, field: 'reserve', value: project.reserve },
    { id: 'F3', commitmentId: null, field: 'dailyHeadroom', value: daily.toString() },
  ];
  for (const c of eligible.slice().sort((a, b) => a.id.localeCompare(b.id))) {
    for (const [field, value] of Object.entries({
      remaining: (BigInt(c.maximum) - BigInt(c.paid)).toString(),
      dueDate: c.dueDate,
      partialAllowed: c.partialAllowed,
      blocksDelivery: c.blocksDelivery,
      accepted: c.accepted,
      deferUntil: c.deferUntil ?? 'none',
    }))
      facts.push({ id: `F${facts.length + 1}`, commitmentId: c.id, field, value });
  }
  return {
    projectId: project.id,
    projectVersion: project.version,
    today,
    balance: project.balance,
    reserve: project.reserve,
    spendable: min(cash, daily).toString(),
    perPayment: project.perPayment,
    dailyHeadroom: daily.toString(),
    eligible,
    hardDue: hardDue.toString(),
    facts,
    blocked,
  };
}
export function baselinePlan(facts: Facts): PlanOutput {
  let available = BigInt(facts.spendable);
  let paidHard = 0n;
  const score = (c: Commitment) =>
    40 * Number(c.blocksDelivery) +
    30 * Number(c.dueDate < facts.today) +
    15 *
      Math.min(
        Math.max(0, (Date.parse(facts.today) - Date.parse(c.acceptedAt)) / 86400000) / 14,
        1,
      ) +
    10 * Number(BigInt(c.maximum) - BigInt(c.paid) <= available) +
    5 *
      Number(
        c.dueDate <= new Date(Date.parse(facts.today) + 7 * 86400000).toISOString().slice(0, 10),
      );
  const ranked = facts.eligible
    .map((c) => ({ c, score: score(c) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.c.dueDate.localeCompare(b.c.dueDate) ||
        (BigInt(a.c.maximum) - BigInt(a.c.paid) < BigInt(b.c.maximum) - BigInt(b.c.paid) ? -1 : 1),
    );
  const items: PlanOutput['items'] = [];
  const escalations: PlanOutput['escalations'] = [];
  for (const { c } of ranked.slice(0, 32)) {
    const remaining = BigInt(c.maximum) - BigInt(c.paid);
    const fits = remaining <= available && remaining <= BigInt(facts.perPayment);
    const amount = c.partialAllowed
      ? min(available, remaining, BigInt(facts.perPayment))
      : fits
        ? remaining
        : 0n;
    const refs = facts.facts.filter((f) => f.commitmentId === c.id).map((f) => f.id);
    if (amount > 0n) {
      const reasons: PlanOutput['items'][number]['reason_codes'] = [];
      if (c.blocksDelivery) reasons.push('BLOCKS_DELIVERY');
      if (c.dueDate < facts.today) reasons.push('OVERDUE');
      if (c.partialAllowed && amount < remaining) reasons.push('PARTIAL_PERMITTED');
      reasons.push('RESERVE_PROTECTED');
      items.push({
        commitment_id: c.id,
        action: 'pay',
        amount_micro: amount.toString(),
        reason_codes: reasons,
        fact_refs: ['F2', ...refs],
        explanation: `${c.name}: ${c.blocksDelivery ? 'payment unlocks the next delivery' : c.dueDate < facts.today ? 'the agreed payment is overdue' : 'approved work is eligible'}. ${amount < remaining ? 'Partial payment is permitted by the confirmed terms.' : 'Pay the full remaining obligation.'} Reserve and daily limits remain protected.`,
      });
      available -= amount;
      if (c.dueDate <= facts.today && (!c.deferUntil || c.deferUntil < facts.today))
        paidHard += amount;
    } else if (c.deferUntil && c.deferUntil >= facts.today)
      items.push({
        commitment_id: c.id,
        action: 'defer',
        amount_micro: '0',
        reason_codes: ['WITHIN_DEFER_TERMS', 'CASH_INSUFFICIENT'],
        fact_refs: refs,
        explanation: `Payment can wait until ${c.deferUntil} under the approved terms. No funds are moved.`,
      });
    else
      escalations.push({
        kind: 'UNFUNDED_OBLIGATION',
        detail: `${c.name} cannot be paid within current cash or policy limits.`,
      });
  }
  const shortfall = positive(BigInt(facts.hardDue) - paidHard);
  if (shortfall > 0n)
    escalations.push({
      kind: 'SHORTFALL',
      detail: `${formatUSDC(shortfall.toString())} USDC of hard obligations remains unfunded.`,
    });
  return {
    items,
    unfunded_shortfall_micro: shortfall.toString(),
    escalations,
    confidence: 'medium',
  };
}
export type Validation = {
  ok: boolean;
  errors: { code: string; message: string }[];
  total: string;
};
export function validatePlan(
  output: unknown,
  facts: Facts,
  current: Facts,
  baseline = baselinePlan(facts),
): Validation {
  const parsed = planOutputSchema.safeParse(output);
  if (!parsed.success)
    return {
      ok: false,
      errors: [{ code: 'SCHEMA', message: parsed.error.issues.map((i) => i.message).join('; ') }],
      total: '0',
    };
  const plan = parsed.data;
  const errors: Validation['errors'] = [];
  let total = 0n;
  let hardPaid = 0n;
  const seen = new Set<string>();
  const fail = (code: string, message: string) => errors.push({ code, message });
  if (hashJson(facts) !== hashJson(current))
    fail('STALE_FACTS', 'Project facts changed. Generate a fresh plan.');
  for (const item of plan.items) {
    if (seen.has(item.commitment_id)) fail('DUPLICATE', 'A commitment appears more than once.');
    seen.add(item.commitment_id);
    const c = current.eligible.find((c) => c.id === item.commitment_id);
    if (!c) {
      fail('INELIGIBLE', `Commitment ${item.commitment_id} is not eligible for this project.`);
      continue;
    }
    const amount = BigInt(item.amount_micro);
    const remaining = BigInt(c.maximum) - BigInt(c.paid);
    if (
      (item.reason_codes.includes('OVERDUE') && c.dueDate >= current.today) ||
      (item.reason_codes.includes('BLOCKS_DELIVERY') && !c.blocksDelivery) ||
      (item.reason_codes.includes('PARTIAL_PERMITTED') &&
        (!c.partialAllowed || item.action !== 'pay' || amount <= 0n || amount >= remaining)) ||
      (item.reason_codes.includes('WITHIN_DEFER_TERMS') &&
        (item.action !== 'defer' || !c.deferUntil || c.deferUntil < current.today))
    )
      fail('REASON_FACT_MISMATCH', 'A claimed payment reason contradicts the recorded terms.');
    if (
      item.fact_refs.some(
        (ref) =>
          !current.facts.some((f) => f.id === ref && (!f.commitmentId || f.commitmentId === c.id)),
      )
    )
      fail('FACT_REFERENCE', 'Fact references must exist and belong to this commitment.');
    const original = baseline.items.find((i) => i.commitment_id === c.id);
    if (
      (!original ||
        original.action !== item.action ||
        original.amount_micro !== item.amount_micro) &&
      !item.reason_codes.includes('DEVIATES_FROM_BASELINE')
    )
      fail('DEVIATION', 'A deviation from baseline needs an explicit reason.');
    if (item.action === 'defer') {
      if (amount !== 0n || !c.deferUntil || c.deferUntil < current.today)
        fail('DEFERRAL', 'Deferral is outside the agreed terms.');
    } else {
      total += amount;
      if (amount <= 0n || amount > remaining)
        fail('COMMITMENT_CAP', 'Payment must be positive and within the remaining obligation.');
      if (!c.partialAllowed && amount !== remaining)
        fail('PARTIAL_FORBIDDEN', 'This obligation must be paid in full.');
      if (amount > BigInt(current.perPayment))
        fail('PAYMENT_CAP', 'Payment exceeds the per-payment policy.');
      if (c.dueDate <= current.today && (!c.deferUntil || c.deferUntil < current.today))
        hardPaid += amount;
    }
  }
  if (total > BigInt(current.spendable))
    fail('RESERVE_OR_DAILY_CAP', 'The batch exceeds spendable cash or daily headroom.');
  const shortfall = positive(BigInt(current.hardDue) - hardPaid);
  if (
    BigInt(plan.unfunded_shortfall_micro) !== shortfall ||
    (shortfall > 0n && plan.escalations.length === 0)
  )
    fail('HIDDEN_SHORTFALL', 'Hard obligations must have an accurate shortfall and escalation.');
  return { ok: errors.length === 0, errors, total: total.toString() };
}
export const authorizationTypes = {
  PlanAuthorization: [
    { name: 'planId', type: 'bytes32' },
    { name: 'planHash', type: 'bytes32' },
    { name: 'projectId', type: 'bytes32' },
    { name: 'projectVersion', type: 'uint64' },
    { name: 'deadline', type: 'uint64' },
    { name: 'itemsHash', type: 'bytes32' },
  ],
} as const;
export type ExecutionItem = { executionId: Hex; commitmentId: Hex; amount: bigint };
export function itemsHash(items: ExecutionItem[]) {
  return keccak256(
    encodeAbiParameters(
      [
        {
          type: 'tuple[]',
          components: [
            { name: 'executionId', type: 'bytes32' },
            { name: 'commitmentId', type: 'bytes32' },
            { name: 'amount', type: 'uint256' },
          ],
        },
      ],
      [items],
    ),
  );
}
export function executionItems(project: Project, planId: Hex, plan: PlanOutput): ExecutionItem[] {
  return plan.items
    .filter((i) => i.action === 'pay')
    .map((item, index) => {
      const c = project.commitments.find((c) => c.id === item.commitment_id);
      if (!c) throw new Error('Unknown commitment');
      return {
        executionId: keccak256(
          encodeAbiParameters(
            [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }],
            [project.onchainId, c.onchainId, planId, BigInt(index)],
          ),
        ),
        commitmentId: c.onchainId,
        amount: BigInt(item.amount_micro),
      };
    });
}

export * from './network';
