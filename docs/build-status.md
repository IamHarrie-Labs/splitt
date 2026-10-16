# Splitt build status

## Payout proof on 15 October 2026

- Ran `testnet:prove --recovery` after contractor activation. All three vault transactions succeeded on Arc Testnet: first batch 0.7 + 0.2 USDC (0x938ea7d6370c06d25daf6c73493e5c43f304abf9938563b7bd934325edaebdc5, block 67349681), 0.8 remainder deposit (0xde2ce4f47108ab118ef30b7dd835b7da7dae60ed7b83504ead5011acddd35c6d, block 67349716), final 0.3 payout (0x098fa70efda77e5f22396521bce7d5ccdeb3bbbaab8997e9ae8551a0ceb32881, block 67349747).
- Independent RPC check: receipts status 1; test payee balances Amara 0.7 and Tobi 0.5 USDC. Final Northstar balance 0.8 USDC (reserve intact); Fieldwork unchanged at 1 USDC.
- Recovery: an accepted provider response was deliberately lost; the same durable job resumed with identical calldata (2 attempts), no duplicate payment.
- Recipients are controlled test wallets. Real businesses: 0. Real customer volume: 0.

## Current release checks on 14 October 2026

- Arc explorer now returns verified source code; updated arc-verification.json. Sourcify retains exact creation/runtime matches.
- GitHub CI run 38648292428 passed all 72 tests, strict typing, offline evaluation, web build, API Docker build, VPS configuration validation and missing-configuration startup refusal.
- Added optional Vercel Gateway model access and synthetic live evaluation with a zero-price catalog guard. Initial run accepted 3/10 responses; remaining cases safely fell back due to rejected output or HTTP 429. A spaced Nemotron follow-up accepted 5/10 responses; the five accepted allocations match the baseline. Rejected/missing tool responses used the validated baseline. No superiority over the baseline is established. The alternative Poolside run accepted 0/10 outputs due to availability/tool failures. Both live evaluator runs correctly fail their all-model-output gate; all final fallback plans validate. See model-evaluation.md.
- Four isolated model-adapter safety tests and strict typing pass. VPS Compose configuration validates with public placeholders; no VPS deployment has occurred.
- Owner will fill the submission form and seek a real pilot. Submission copy and VPS runbook are prepared; SSH/domain details remain required.

## Earlier release preparation on 14 October 2026

- Sourcify independently confirms exact creation/runtime bytecode matches for the deployed vault. Evidence: `sourcify-verification.json`; Arc explorer status remains separately unconfirmed.
- Public `/demo` runs the allocation engine entirely in the browser, with synthetic fixtures and explicitly simulated settlement. Landing CTAs now open this accessible demo; owner testnet operations retain authentication.
- Browser verified the 700/200 allocation, 800 remainder, final 300 payout, Northstar final 800 balance and untouched Fieldwork 1,000. Mobile width checked without horizontal overflow.
- Ten offline evaluation cases pass. Live evaluator records input/output hashes, request/correction counts, fallback and allocation comparison; no real model outputs claimed. `planner-evaluation-offline.json` is the current result.
- Web app published on Vercel at https://splitt-dun.vercel.app with a public /demo. Unauthenticated access and hosted allocation/remainder flow verified. Persistent API container definition and publication runbook prepared; API/worker still local. Production Next.js build, strict typing and 35 planner/worker/service regression tests pass. Docker container remains unverified locally.
- Narrated video draft rendered at `video/out/splitt-walkthrough-draft.mp4`: 2:40, 1080p H.264/AAC. Captured UI states and proof frames inspected. This is a motion-graphics/captured-UI draft, not the final continuous live demonstration. Final video needs tomorrow's payout proof, public URLs and pilot/model results.
- Source published at https://github.com/IamHarrie-Labs/splitt after a local credential scan. GitHub CLI authenticated through the user's device authorization; commits use the account's public noreply email.
- Walkthrough and captions uploaded as an explicitly labelled prerelease: https://github.com/IamHarrie-Labs/splitt/releases/tag/v0.1.0-preview. Its closing publication status reflects the earlier capture; public site/repository links now supersede it.
- Still required: contractor activation on 15 October at 16:18:53 Lagos, full chain payout/remainder and recovery proof, live model evaluation, consenting business pilot, hosted live API/worker, final demo evidence and submission.

## Arc connection verified on 14 October 2026

- Owner funding confirmed: 20 testnet USDC initially. Circle entity secret registration succeeded; recovery material stays in the protected, ignored secrets folder.
- Circle operator created on ARC-TESTNET: `0xd0c362f85bd5452246999a53639c6c9ac0437063`, wallet ID `33066062-abc7-5a74-b72b-5bab4d31fdfe`, funded with 1 testnet USDC for gas.
- Vault deployed at `0x724c12bea7fab30e27a9b3f4d5581351ebc2c6c6`, block 67179133. Receipt recorded in `arc-deployment.json`. Explorer source-verification request accepted, but status checks are rate-limited and verification remains unconfirmed.
- Scaled demo: Northstar has 1.2 USDC received with a 0.3 reserve; Fieldwork has a separate 1-USDC balance. Setup receipts are reused across retries. Projects are synthetic demo data, not pilot businesses.
- A real Circle execution of `owner()` completed; Arc receipt, sender, recipient, calldata and zero transferred value verified. Evidence: `circle-execution-proof.json`. This is not a contractor payout.
- Authenticated API access, chain-derived balances and receipt indexing verified: `testnet-api-proof.json` and `testnet-bootstrap.json`. API/worker and web preview started locally.
- Contractor activation remains blocked until **15 October 2026, 16:18:53 Lagos time** (15:18:53 UTC). `testnet:prove` refused execution before that gate. Its prepared sequence is 0.7/0.2 payouts, 0.8 remainder and 0.3 final payout; these have not run yet.
- All 18 authorization/worker regression tests and TypeScript checking passed. Real model evaluation, pilot adoption, public repository/hosting and recorded video remain pending.
- Organizer deadline rechecked: **17 October, 11:59 PM ET**, equivalent to **18 October, 4:59 AM Lagos**. Source: https://tameion.thecanteenapp.com/.

## Setup verified on 13 October 2026

- Created an isolated PostgreSQL 17.10 cluster at `server/.data/postgres`, bound to `127.0.0.1:55432`, and applied the Splitt migrations. Credentials are in ignored local files; `.env` access is restricted to the Windows owner.
- Verified the real TCP driver, row locking across repositories, rollback, persistent queue cursor, signed owner authentication and normalized fixture planning. Verified the saved cursor and planning after stopping and restarting PostgreSQL. Evidence: `postgres-verification.json`.
- Fixed real-driver JSONB double serialization discovered by these checks. The database/worker/service regression subset passed all 24 tests, and TypeScript checking passed.
- Prepared an unregistered Circle entity secret, recovery directory handling, `circle:register`, auto-saving Circle wallet configuration and `testnet:start`. These do not create a Circle API key or register a secret without account credentials.
- Fresh Arc balance check still reports zero owner funding. Circle API access, operator creation, vault deployment and live testnet proof remain pending. Database configuration is no longer a blocker.
- Neon creation was refused because its connected organization is Vercel-managed; no cloud database project was created. Local PostgreSQL is the working alternative.
- Browser account/faucet work was not executed because automatic approval review hit a usage limit. GitHub and Vercel connections were requested but not confirmed. No publication occurred.

4 October 2026. Testnet integration implementation; external validation pending.

## Latest implementation

- Separate `/testnet` workspace with owner authentication, matching on-chain commitment metadata, exact executable EIP-712 review, queue submission and chain-derived balances. Fixture signatures remain non-executable.
- Resumable receipt cursor, unique event identities, 500-block scan windows and direct transfers retained as unassigned receipts.
- PostgreSQL-backed batch intent, row-locked leases, Circle idempotent retries, pre-submit simulation and replay-flag reconciliation. Pending attempts block further project allocations.
- Updated Circle SDK to 10.8.1 with Arc Testnet wallet/address checks; added Circle wallet creation, owner wallet creation, test payee wallets, deployment output and source-verification input.
- 68 tests passed across seven files, including 18 new worker/indexer/authorization tests. Standalone PostgreSQL/TCP and live Circle requests are not verified.
- Strict TypeScript checking and the production Next.js build passed, including `/testnet`. Browser verification confirmed the disabled connection gate and access to the existing local demo. Preview: `splitt-testnet-gate.png`.
- Read-only RPC check confirmed the generated owner has zero native and ERC-20 testnet balance. No vault was deployed and no payout sent. Credentials and deployment configuration remain absent; see `integration-readiness.json`.
- Prepared `testnet-runbook.md`, `pilot-plan.md` and the local `submission.html` draft. Public hosting, repository publication, actual recorded video and pilot still require external inputs.

## Working locally

- Public Splitt landing page at `/`: interactive partial-payment/remainder example, workflow, owner controls and build-status FAQ. The demo workspace is now `/workspace`; existing payment/allocation/settlement/metrics routes are retained. Landing layout checked at desktop and 375px mobile widths; CTA and example verified in the browser.

- Five responsive workspace views and forms for projects, commitments and fixture arrivals.
- Baseline allocation with fact references, exact micro-USDC arithmetic and deterministic validation.
- Optional Anthropic planner adapter with correction and fallback.
- Fixture batch settlement, stale/replayed-plan rejection, unknown attribution and callback recovery.
- Persistent local fixture store and a hash-linked activity log.
- EIP-712 `ProjectVault` and local EVM execution tests.
- Production Next.js build and strict TypeScript check.
- Optional relational Postgres repositories, workspace transaction locks and append-only audit history; sample data seeds once.
- EIP-4361 owner login with single-use five-minute challenges, eight-hour revocable opaque sessions, origin binding and CSRF checks. Postgres sessions persist; file-mode sessions are in memory.
- Exact browser batch review and EIP-712 fixture signing. Approval binds ordered items, plan hash, project/version, vault reference, chain and fifteen-minute expiry. The API revalidates facts and stores the signature once.

Final verification: **50 tests passed** (14 local EVM, 17 planner/money/reconciliation, 4 fixture API, 9 authentication/approval, 6 PostgreSQL engine tests). Strict TypeScript checking and the production Next.js build passed. Database tests cover rollback, exact large integers, UTC date stability, concurrent repositories, owner isolation and authenticated planning/signing/settlement. Browser checks confirmed that the default workspace still loads and settings display authentication/storage/signing configuration accurately. Preview: `splitt-settings.png`. Prior browser checks covered allocation, interrupted recovery and remainder settlement at mobile and desktop widths.

Default preview remains a credential-free local fixture demo. Set OWNER_ADDRESS to enable login; set VAULT_ADDRESS to enable fixture signing. Postgres mode requires an owner. Fixture signatures use **Splitt Fixture**, which cannot execute against the contract's **Splitt** domain. Signing changes no balances and sends no transaction. Setup: [owner-auth-and-signing.md](owner-auth-and-signing.md).

## Integration scaffolding

Latest typography update: locally served Space Grotesk for headings, Poppins for body text and controls, and Georgia for italic emphasis. Browser checks confirmed the font families and desktop/mobile layouts without horizontal overflow. Preview: `splitt-grotesk-poppins.png`.

Product quality pass on 4 October 2026: Georgia headings and a system sans-serif body stack replace remote fonts; labels use sentence case and card captions are larger. Mobile workspace navigation now includes home and settings. Browser checks covered all five views, required-field validation, the mobile settings dialog and mobile overflow. All 50 functional tests, strict TypeScript checking and the production build passed. Review: [product-quality-review.md](product-quality-review.md). Preview: `splitt-georgia-review.png`. This validates the local demo; the live integration gaps below remain.

Expanded landing motion: a sticky three-stage payment story with spring-animated stacked cards, scroll-driven dotted orbits, clickable stage dots, an animated hero dot field, and illustrated feature cards with hover movement. Native scrolling remains intact. The page-wide pause control and reduced-motion handling cover the new effects. Browser checks verified native scroll stage changes, dot navigation, pause/resume and mobile layout without horizontal overflow. TypeScript and production build passed. Preview: `splitt-scroll-story.png`.

Landing motion upgrade: animated illustrative payment routes, pointer-responsive card depth, animated payment-stage amounts and progress, staggered scroll reveals, and a reading-progress indicator. Includes a pause control, reduced-motion support, touch-safe interactions, and offscreen/background pausing for the payment flow. Browser checks verified both payment stages, pause/resume, and desktop/mobile layouts without horizontal overflow. TypeScript and production build passed. Preview: `splitt-landing-motion.png`.

- Postgres schema and additive migrations are connected and tested using PGlite's embedded PostgreSQL engine. A standalone server and TCP driver are not verified; Docker/Postgres is unavailable here. Server restart durability and cross-process locks require that check.
- Circle developer-controlled wallet submission/status adapter. No live request has been made.
- Reconciliation decision function. A live event indexer and durable execution queue still need implementation.
- Browser login, exact batch review and signing are implemented. Tests use ephemeral in-memory test keys; real browser-wallet prompts remain unverified.

## Verified external check

Read-only Arc RPC check passed on 3 October 2026: chain ID 5042002, block 65321990, ERC-20 decimals 6. No token approvals, transfers or deployments were performed. A funded wallet is required for the remaining network gate.

## Not implemented or not verified

Arc deployment and explorer verification; real Circle execution; standalone Postgres verification; real browser-wallet prompts; live AI evaluation; CCTP; USYC; document extraction; contractor links; real pilot; hosting; public submission and recorded video.

## Next increment

Deploy and verify the vault on Arc Testnet, record its deployment block, and connect chain-derived balances and receipt indexing. Verify the current contract owner and fresh chain state before preparing live authorizations. Add Circle execution, a durable queue and reconciliation against replay flags; prove the underpayment/remainder flow with real testnet transactions. Keep CCTP behind its optional gate.

The local fixture mode cannot move funds. It binds to loopback and refuses `SPLITT_MODE` values other than `fixture`.
