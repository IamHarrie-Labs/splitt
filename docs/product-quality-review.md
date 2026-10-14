# Splitt product quality review

Reviewed 4 October 2026. Scope: local fixture demo, public landing page and five workspace views. These scores are product judgments, not a production certification or a complete accessibility audit.

## Assessment

**Local demo: 7/10 overall.** Clear enough for a hackathon walkthrough. Live settlement remains an integration milestone.

| Area | Score | Evidence and remaining work |
| --- | --- | --- |
| Onboarding | 8/10 | Public explanation, illustrative payment stages and demo access precede wallet connection. Add a real pilot onboarding path. |
| Core workflow | 8/10 | Project creation validation, payment intake, allocation review, settlement history and metrics were inspected. Automated coverage exercises the fixture workflow. |
| Error handling | 8/10 | Required fields block empty creation; tests cover interrupted settlement, reconciliation and duplicate protection. Live provider failure handling remains unverified. |
| Navigation | 8/10 | Five views open; mobile now exposes home and workspace settings. |
| Visual consistency | 8/10 | Georgia headings, readable system body font, sentence-case labels and larger card text. Mobile landing and metrics have no horizontal overflow at a 375px viewport. |
| Performance | 7/10 | Remote font loading removed. No formal performance benchmark was performed. |
| Accessibility | 6/10 | Named controls, form validation, motion pause and reduced-motion support are present. Full contrast, keyboard, zoom and screen-reader audits remain. |
| Feature completeness | 5/10 | Local payment simulation works. Arc deployment, live receipt indexing, Circle execution, durable queue and real pilot are incomplete. |

## Verification

- 50 automated tests passed across five files: contract execution, planning/money/reconciliation, fixture API, authentication/approval and PostgreSQL engine tests.
- Browser checks opened the workspace, incoming payments, allocation review, settlement and metrics views.
- Empty project creation is blocked by native required-field validation; cancel closes the dialog.
- Existing settlement history contains the interrupted-batch recovery and remainder payment. No fixture balances were reset during this review.
- Mobile settings opens and accurately reports the local fixture environment and disabled live execution; home navigation returns to the landing page.
- Georgia is the computed heading font; body text uses the system sans-serif stack. Decorative all-caps labels were changed to sentence case; USDC and other proper acronyms remain.
- Typography preview: `splitt-georgia-review.png`.

## Strengths

1. The landing explanation demonstrates the underpayment decision directly.
2. Reserve protection, approval and recovery are visible in the workflow and covered by functional tests.
3. Metrics distinguish fixtures from actual adoption instead of presenting sample activity as traction.

## Next improvements

1. **Before live settlement:** deploy and verify the Arc vault; add receipt indexing, Circle execution, a durable queue and replay-safe reconciliation. Prove the full flow on testnet.
2. **Before a public pilot:** verify real browser-wallet authentication/signing and standalone PostgreSQL restart durability; complete a keyboard, contrast and screen-reader audit.
3. **For adoption evidence:** onboard one real agency or studio, observe their first underpayment allocation and measure repeat use separately from demo activity.

The UI is ready for a local demo. It is not yet ready to execute live customer payments.
