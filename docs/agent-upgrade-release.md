# Receipt automation and pilot release — 16 October 2026

This records implementation and evidence, not a guaranteed judge score.

## Shipped in this change

- Receipt-triggered draft queue in the Arc worker. Each attributed receipt is handled once; a 120-second lease supports restart recovery and excludes concurrent workers. Current state and existing payment jobs are checked again before storing a draft. Unchanged facts reuse the current draft. Five failed attempts escalate to an owner notification. No signature, authorization or payout job is created by this worker.
- In-app notifications and ten-second authenticated workspace refresh. No email, messaging or browser push service was connected or used.
- Payment-note extraction behind the owner API, with a dedicated `PAYMENT_NOTE_MODEL` setting, exact quotation checks, indexed amount/payer/invoice agreement and review on ambiguity. Raw transfers remain unattributed. Notes never change obligations, policies, payees, receipts or balances. Duplicate event/note submissions return the existing result.
- `/pilot`: an actual-case intake using aliases and participant consent; local deterministic planning; feedback and quotation consent; downloadable evidence marked `participant_reported_unverified` and `pilot_mirrored`. No data is uploaded or stored in browser storage, and no adoption or volume is inferred.
- Public demo starts with a draft and drafts again on receipt of the remainder. Its execution remains an explicit local demonstration. Existing explorer links prove earlier testnet execution, not this new worker's live deployment.

## New model evidence

See `payment-note-evaluation-live.json`. Ten synthetic cases: literal matcher 7/10 fully correct; tested model plus safe fallback 9/10; model output used in 4 cases. The model's current input/output price was checked as zero before evaluation. No private customer material, payment or external message was sent. This is a small development dataset, not evidence of production accuracy or allocation-model superiority.

## Follow-up status

- At the time of this release, no participant or VPS connection had been supplied. Public API deployment was completed on 17 October and is recorded in `public-access-proof.json`; a verified business pilot remains pending.
- The deployed worker processed a public controlled receipt, created an automatic Haiku draft and completed an owner-reviewed Circle payout. The hashes and limitations are recorded in `public-onboarding-proof.json`.
- Claude Haiku 5.5 is configured on the VPS with durable per-vault and global request limits. The current small regression result is recorded in `anthropic-evaluation.md`; it is not a production-accuracy benchmark.
- Arc, USDC, Circle wallet and verified vault integrations remain the proven Circle usage. CCTP is implemented and tested but has no completed transfer proof. Gateway, Paymaster and USYC are not claimed.
- Record and host the new agent-story video under three minutes. The earlier draft video is not footage of these new features.
- The user submits the hackathon form. Do not invent pilot counts, volume, a quote or a score.

## Review limits at release time

Browser interaction and mobile visual QA were unavailable when this release was written. Public Chromium checks were completed on 17 October and are recorded in `browser-qa.md`; physical-device and browser-wallet signing checks remain pending.

## Validation results

All 94 automated tests passed (80 application tests and 14 contract tests). The contract suite initially hit a sandbox LevelDB rename denial and passed with normal temporary-file access. TypeScript and the production Next.js build passed, including `/pilot`. GitHub was successfully connected to the existing Vercel project. The note reader used the existing locally stored project OIDC credential after broad production-env retrieval was rejected; no new production secrets were pulled.
