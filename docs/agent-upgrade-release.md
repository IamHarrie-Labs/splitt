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

## Outstanding evidence and external work

- No participant or VPS connection was supplied in this request. A verified business pilot and public owner API deployment remain pending.
- Run a real indexed receipt through the new worker on the deployed API, review the resulting draft and sign only after checking the exact batch. Record hashes and recovery evidence separately from the existing proof.
- A stable server model credential is required on the VPS. The short-lived local project OIDC token used for evaluation is not a production credential strategy.
- Existing Arc, USDC, Circle wallet and verified vault integrations remain the proven Circle usage. CCTP, Gateway, Paymaster and USYC are not added or claimed. Integrations should solve the receipt problem and pass their own end-to-end gate; stacking logos does not establish quality.
- Record and host the new agent-story video under three minutes. The earlier draft video is not footage of these new features.
- The user submits the hackathon form. Do not invent pilot counts, volume, a quote or a score.

## Review limits

Browser interaction and mobile visual QA have not been completed because browser automation remains unavailable. Source review, accessibility references, type checking, production compilation and automated behavior tests are separate checks.

## Validation results

All 94 automated tests passed (80 application tests and 14 contract tests). The contract suite initially hit a sandbox LevelDB rename denial and passed with normal temporary-file access. TypeScript and the production Next.js build passed, including `/pilot`. GitHub was successfully connected to the existing Vercel project. The note reader used the existing locally stored project OIDC credential after broad production-env retrieval was rejected; no new production secrets were pulled.
