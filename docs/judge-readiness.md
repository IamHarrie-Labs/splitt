# Splitt judge readiness — 17 October 2026

This is an evidence assessment, not an organizer score or a prediction of placement.

| Area                  | Verified evidence                                                                                                                                 | Remaining gap                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Receipt-driven drafts | Hosted single worker; two controlled vaults; three confirmed Circle payout batches; receipt/remainder and expired-authorization recovery          | Public HTTPS and an uninterrupted browser recording                                  |
| Allocation decisions  | Independent constraint validator, baseline comparison, bounded corrections and safe fallback; structured reasons checked against recorded terms   | Model allocation checks remain inconsistent; no measured advantage over the baseline |
| Payment notes         | Two ten-case synthetic regression runs: combined path 10/10 vs literal 7/10, five accepted model responses each; authenticated hosted Haiku check | Development examples, not held-out accuracy or customer evidence                     |
| Circle and Arc        | Developer-controlled operator, USDC, verified ProjectVault, scoped wallet authorization and durable execution recovery                            | CCTP code has no completed transfer proof; no extra integration credit claimed       |
| Adoption              | Public demo and local pilot intake; two fresh controlled owners transferred 2.1 test USDC in three batches                                        | Zero verified business pilots; controlled tests are not traction                     |
| Hosting               | Vercel frontend and healthy isolated VPS API/PostgreSQL                                                                                           | Owner-supplied domain, TLS, Vercel API rewrite and signed-in public checks           |
| Submission            | Public source, evidence files, updated copy and recording script                                                                                  | Current video under three minutes on an accepted host; owner-submitted form          |

Working judge assessment: **54/100** using 7/10 agentic sophistication (30%), 1/10 traction (30%), 7/10 Circle use (20%) and 8/10 innovation (20%). This is subjective. Strong engineering does not substitute for genuine usage, and no specific prize tier is guaranteed.

## Evidence to link

- `selfserve-testnet-proof.json`: controlled two-wallet payout evidence; deterministic fallback, not a business pilot.
- `anthropic-hosted-note-proof.json`: hosted Haiku note analysis, no new payment.
- `anthropic-evaluation.md`: regression results and allocation limitations, including the stricter reason validation.
- `testnet-payout-proof.json`: earlier payout, remainder and lost-response recovery proof.
- GitHub Actions: current checks must pass on the submitted revision.

## Finish in this order

1. Connect the owner's API domain to the existing Caddy proxy, then set Vercel's server-side API origin. Keep other VPS applications and their proxy routes intact.
2. Verify wallet login, own-vault registration, receipt-triggered drafts and exact-signature payout behavior through the public website. Run mobile and keyboard checks. API/chain scripts do not count as browser QA.
3. Run one consenting business through its actual invoice and agreed contractor terms. Record source, corrections, time to a useful plan and quote permission. Builder-owned businesses need that relationship disclosed; test USDC is not revenue.
4. Record the current flow using `demo-script.md`. Identify controlled tests and fallback accurately. Publish under three minutes to an accepted host; the owner completes the form.

No automatic outreach or submission is authorized. Do not add integrations at the expense of these gates. Official rubric: https://tameion.thecanteenapp.com/. Stated deadline: 17 October 23:59 Eastern, 18 October 04:59 Lagos.
