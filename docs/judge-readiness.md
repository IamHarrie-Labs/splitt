# Splitt judge readiness — 17 October 2026

This is an evidence assessment, not an organizer score or a prediction of placement.

Public launch update: `https://www.usesplitt.xyz` and `https://api.usesplitt.xyz` have verified HTTPS and matching authentication policy. `public-access-proof.json` records signed sessions for three controlled owners and one fresh unfunded account, with replay/CSRF and cross-wallet denial. `public-onboarding-proof.json` records a new controlled vault, public setup, a 0.8-USDC deposit, automatic Haiku drafting and a confirmed 0.3-USDC Circle payout. The project retained 0.5 USDC, above its 0.3 reserve. An earlier capped attempt remains recorded separately with its funds in the vault. Browser checks cover public responsive layouts and the complete simulated demo; browser wallet signing, physical-device checks and real business adoption remain separate gaps.

| Area                  | Verified evidence                                                                                                                                 | Remaining gap                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Receipt-driven drafts | Hosted worker; public HTTPS; automatic Haiku draft and confirmed owner-approved Circle payout                                                     | Uninterrupted browser wallet-signing recording                                       |
| Allocation decisions  | Independent constraint validator, baseline comparison, bounded corrections and safe fallback; structured reasons checked against recorded terms   | Model allocation checks remain inconsistent; no measured advantage over the baseline |
| Payment notes         | Two ten-case synthetic regression runs: combined path 10/10 vs literal 7/10, five accepted model responses each; authenticated hosted Haiku check | Development examples, not held-out accuracy or customer evidence                     |
| Circle and Arc        | Developer-controlled operator, USDC, verified ProjectVault, scoped wallet authorization and durable execution recovery                            | CCTP code has no completed transfer proof; no extra integration credit claimed       |
| Adoption              | Public demo and pilot intake; three controlled owners, four self-serve batches and 2.4 test USDC paid                                             | Zero verified business pilots; controlled tests are not traction                     |
| Hosting               | Custom domains, HTTPS, Vercel-to-VPS routing and signed multi-wallet access verified                                                              | Larger load tests and production operations remain outside this preview              |
| Submission            | Public source, evidence files, updated copy and recording script                                                                                  | Current video under three minutes on an accepted host; owner-submitted form          |

Working judge assessment: **about 56/100** using 7.5/10 agentic sophistication (30%), 1/10 traction (30%), 7/10 Circle use (20%) and 8/10 innovation (20%): 55.5 weighted. The public model-to-payout proof improves inspectability, not adoption. This is subjective; no specific score or prize tier is guaranteed.

## Evidence to link

- `selfserve-testnet-proof.json`: controlled two-wallet payout evidence; deterministic fallback, not a business pilot.
- `anthropic-hosted-note-proof.json`: hosted Haiku note analysis, no new payment.
- `anthropic-evaluation.md`: regression results and allocation limitations, including the stricter reason validation.
- `testnet-payout-proof.json`: earlier payout, remainder and lost-response recovery proof.
- GitHub Actions: current checks must pass on the submitted revision.

## Finish in this order

1. Complete a browser wallet-signing walkthrough and physical-device testing. Public HTTP authentication and on-chain payouts are verified; these do not substitute for wallet-extension UX evidence.
2. Record receipt-triggered drafting and exact-signature payout behavior using the current public release. Public layout, keyboard and demo checks have separate browser evidence.
3. Run one consenting business through its actual invoice and agreed contractor terms. Record source, corrections, time to a useful plan and quote permission. Builder-owned businesses need that relationship disclosed; test USDC is not revenue.
4. Record the current flow using `demo-script.md`. Identify controlled tests and fallback accurately. Publish under three minutes to an accepted host; the owner completes the form.

No automatic outreach or submission is authorized. Do not add integrations at the expense of these gates. Official rubric: https://tameion.thecanteenapp.com/. Stated deadline: 17 October 23:59 Eastern, 18 October 04:59 Lagos.
