import { writeFile } from 'node:fs/promises';
import { baselinePlan, buildFacts, hashJson, validatePlan } from '@splitt/core';
import { fixtureProjects } from '../server/src/fixtures.js';
import { propose } from '../server/src/agent/planner.js';
if (
  !process.argv.includes('--live') ||
  !process.argv.includes('--allow-paid') ||
  process.env.PLANNER_PROVIDER !== 'anthropic' ||
  process.env.PLANNER_MODEL !== 'claude-haiku-5-5'
)
  throw new Error('Explicit live paid Anthropic smoke mode and Haiku configuration required.');
const facts = buildFacts(fixtureProjects()[0], new Date('2026-10-03T12:00:00Z'));
const run = process.argv.find((arg) => arg.startsWith('--run='))?.slice(6) ?? 'followup';
if (!/^[a-z0-9-]{1,32}$/.test(run)) throw new Error('Use a short lowercase run label.');
const result = await propose(facts),
  baseline = baselinePlan(facts),
  validation = validatePlan(result.output, facts, facts, baseline);
const report = {
  checkedAt: new Date().toISOString(),
  source: 'synthetic_fixture',
  requestedModel: process.env.PLANNER_MODEL,
  model: result.model,
  fallbackUsed: result.fallbackUsed,
  attempts: result.attempts,
  correctionCount: result.correctionCount,
  failureCodes: result.failureCodes ?? [],
  validationCodes: result.validationCodes ?? [],
  validationPassed: validation.ok,
  matchesBaseline:
    hashJson(result.output.items.map((i) => [i.commitment_id, i.amount_micro])) ===
    hashJson(baseline.items.map((i) => [i.commitment_id, i.amount_micro])),
  proposal: result.output,
  baseline,
  limitation:
    'One synthetic allocation smoke check, at most two provider requests. No payment or business adoption. Matching the baseline is not evidence of improved allocation judgment.',
};
await writeFile(
  new URL(`../docs/anthropic-planner-${run}.json`, import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report));
