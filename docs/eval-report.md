# Allocation evaluation: first implementation

14 October update: a reproducible ten-case harness now passes all ten offline scenarios, including prompt injection, unresolved settlement, daily headroom and paid-obligation remainder handling. See `planner-evaluation-offline.json`. Run `npm run planner:eval` for offline or `npm run planner:eval -- --live` after model configuration. Live mode records model ID, hashes, correction count, fallback and allocation differences and fails its completion gate if any case falls back. No live model evaluation has occurred yet.

3 October 2026. Deterministic baseline and validator only. No Anthropic key/model was configured, so there are no live model results yet.

| Case | Baseline / validator result | Model evaluation |
|---|---|---|
| E1 partial receipt | 700 to Amara, 200 to Tobi, 300 reserve preserved; passes | Pending configuration |
| E2 changed dependency/deadline | Tobi ranks first when overdue and Amara no longer blocks delivery; passes | Pending configuration |
| E3 partial forbidden | Tobi deferred within agreed terms instead of receiving a partial payment; passes | Pending configuration |
| E4 reserve breach | Oversized plan rejected with `RESERVE_OR_DAILY_CAP`; passes | Pending configuration |
| E5 unaccepted work | Excluded from eligibility and rejected if proposed; passes | Pending configuration |
| E6 cash shortfall | Hard-obligation shortfall reported; hiding it rejected; passes | Pending configuration |
| E7 injected source instruction | Extraction is not implemented; model text cannot mutate deterministic facts | Not run |
| E8 invalid model plan | Schema, nonexistent facts, foreign IDs and duplicate items rejected; validator passes | Correction/fallback provider flow not run live |

Executed through `tests/planner.test.ts`, with API lifecycle coverage in `tests/api.test.ts`. This report does not substitute for the model-vs-baseline comparison required by the final submission.

Live model evaluations must record model ID, input/output hashes, validator result, correction count, fallback status and whether the model improved or worsened the baseline. A model proposal must never be called better solely because its explanation sounds more persuasive.
