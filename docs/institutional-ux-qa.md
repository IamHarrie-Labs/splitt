# Institutional UX review, 16 October 2026

## Scope and result

Reviewed the landing page, public demo, documentation, testnet connection/owner view, shared navigation/footer and all five workspace views in source. Applied frontend design, humanizer and UI-polish guidance using the established agency-payment use case. No new customer, audit, institutional backing or model-performance claims were added.

The public journey is Overview → Demo → allocation review → simulated settlement. Documentation carries the technical explanation. Local workspace functions and the authenticated testnet boundary remain separate.

## Changes

- One primary landing CTA. Removed the marketing stage switcher, floating scene note, repeated headings/CTAs, decorative arrows, footer feature claims and vendor-link columns.
- Plain Overview, Demo and Documentation navigation with an active-page indication. Functional mobile menu and skip-to-content links remain.
- A static allocation table explains the partial-payment use case. The app retains actionable controls for generating, reviewing and simulating payments.
- Replaced slogans with concrete labels across overview, allocation, settlement and metrics views. Removed the duplicate allocation-generation button in the empty state.
- Source Serif 4's actual 400 italic face is self-hosted and shared globally. Space Grotesk headings and Poppins interface text remain consistent.
- Added `/docs` for workflow, spending limits, owner approvals, demo steps and implementation status. The footer has only documentation and the verified public source repository.
- Retained financial amounts, eligibility, validation, owner authorization, unresolved-settlement warnings and the distinction between samples and real payments. Shorter review reasons preserve the complete explanation and references in a disclosure.

## Verification

| Check                    | Result                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript               | Passed                                                                                                                                      |
| Production Next.js build | Passed, including `/`, `/demo`, `/docs`, `/testnet`, `/workspace` and the dynamic workspace routes                                          |
| Full regression suite    | 72 tests passed across eight files                                                                                                          |
| Regression scope         | Planner/money, contract execution/replay/isolation, API, owner authorization, PostgreSQL, live service/worker and provider fallback         |
| Static link audit        | 24 static links checked across 12 source components; no missing local route or anchor targets                                               |
| Shared skip-link targets | Present on all four pages using the public header                                                                                           |
| Footer source link       | GitHub CLI confirms the linked repository exists and is public                                                                              |
| Mobile typography        | Measured actual font advances at 320, 360, 375, 768 and 1280px; corrected the 320px headline size                                           |
| Responsive source review | Public grids collapse at 759px; tables retain amounts, docs navigation stacks, menu scrolling is contained, long testnet addresses can wrap |
| Credential scan          | Passed before publication                                                                                                                   |

Tests validate the payment engine and service workflows; they do not constitute a browser end-to-end test of the redesigned interface. Font advance calculations do not replace rendered layout inspection.

## Current browser evidence

The public release was later checked in Chromium at 375×812, 390×844, 768×1024 and 1280×900. The landing page, wallet-free demo, testnet entry, documentation and pilot form had no horizontal overflow. Keyboard navigation, focus states and the complete simulated 700/200 then 300 remainder flow passed. Screenshots are under `docs/qa/`.

Physical-device testing and an uninterrupted browser-wallet signing recording remain unverified. Public signed-API and on-chain payout proofs cover the underlying authorization and execution path, but do not substitute for those interaction checks.
