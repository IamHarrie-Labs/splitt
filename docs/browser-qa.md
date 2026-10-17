# Public browser QA, 17 October 2026

Checked the deployed custom-domain release in the Codex in-app browser. Public routes `/`, `/start`, `/docs`, `/demo` and `/pilot` loaded. Responsive viewport overrides included 375×812, 390×844, 768×1024 and 1280×900. Measured page widths were 360, 375, 753 and 1265 pixels after scrollbar space; the inspected pages had matching scroll widths and no page-level horizontal overflow. This is Chromium viewport testing, not physical iOS/Android device certification.

| Check                   | Observed result                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| Wallet unavailable      | Connect wallet produced a clear MetaMask/Rabby message; no signature or transaction requested              |
| Mobile navigation       | Pointer and Enter opened the menu; Escape closed it and restored focus; selecting a link closed it         |
| Onboarding touch target | Connect wallet was 44px high                                                                               |
| Documentation           | Navigation worked and every inspected local section anchor had a target                                    |
| Demo first receipt      | Simulated 700 + 200 USDC; enabled the remaining receipt action                                             |
| Demo remainder          | Proposed only the unpaid 300 USDC; final project balance 800, reserve 300, separate project 1,000          |
| Pilot form              | Inputs had labels, required fields blocked an empty submission; no business facts or consent were invented |
| Pilot readability       | Found 12px inputs, changed them to 16px, then verified deployed 16px text and 50px input height            |
| Landing interaction     | Workflow selector changed its pressed state and FAQ disclosure opened                                      |
| Browser errors          | No captured console errors during these checks                                                             |

One immediate menu click after a fresh navigation did not initially toggle it. Rechecks after loading, by pointer and keyboard, passed. Cold-load interaction timing on slow networks has not been measured.

The browser had no wallet extension. No wallet was injected and no private key was entered into a page. Actual signed access and a new on-chain payout were verified separately through the public API in [public-access-proof.json](public-access-proof.json) and [public-onboarding-proof.json](public-onboarding-proof.json). A browser wallet-signing walkthrough, physical-device checks, broad load testing and genuine business adoption remain unverified. No 10/10 UX or judging guarantee is claimed.

Screenshots: [desktop onboarding](qa/onboarding-desktop.png), [phone onboarding](qa/onboarding-mobile.png), [phone pilot form](qa/pilot-mobile.png), [phone documentation](qa/docs-mobile.png), [completed demo](qa/demo-completed-mobile.png), [desktop landing](qa/landing-desktop.png), [phone landing](qa/landing-mobile.png).
