# Live model evaluation, 14 October 2026

Real provider requests used synthetic fixtures only. Both gateway models had zero input/output prices in the public model catalog before requests. No paid model fallback was configured. The ten scenarios cover partial receipts, priority changes, forbidden partial payments, exhausted reserves, unaccepted work, hard shortfalls, prompt injection, unresolved settlement, exhausted daily headroom and a later remainder.

| Model | Model outputs accepted | Final plans validated | Outcome |
| --- | --- | --- | --- |
| nvidia/nemotron-3.5-lightning-free | 5/10 | 10/10 including fallback | Missing tool calls and rejected plans; accepted allocations matched the baseline |
| poolside/laguna-s-2.1-free | 0/10 | 10/10 through fallback | Availability errors and missing tool calls |

Nemotron was rerun with 65 seconds between cases after an earlier run hit HTTP 429 rate limits. Its final report is `planner-evaluation-nemotron.json`. The latest alternative-provider report is `planner-evaluation-live.json`. Neither passed the live evaluator's requirement that every case produce an accepted model output; both commands correctly returned a failing exit code. Safety validation succeeding after fallback is not AI success.

All five accepted Nemotron decisions matched the deterministic allocation. This evaluation establishes no improvement over the baseline, no document-extraction quality and no adoption. The injection scenario's accepted output preserved the valid allocation; that single synthetic case is not a general security certification.

The implemented adapter supports server-only Anthropic or Vercel Gateway credentials, validates responses and allows one correction request before falling back. Four isolated adapter tests cover credential absence, gateway selection, unsafe overspending rejection and private error-body exclusion. GitHub CI run 38648292428 passed all 72 tests, strict typing, offline evaluation, the web build and container checks.

Keep the public demo labelled deterministic. Do not enable a live model merely to display an AI badge. A reliable configured provider, a repeatable accepted-output evaluation and human review of any changed decisions remain necessary before claiming dependable model planning. VPS model credentials and confidential pilot-data consent are not configured by these synthetic tests.
