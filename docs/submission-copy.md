# Splitt submission copy

Prepared for the owner to fill the organizer's form. Recheck the evidence below before submitting. Do not present synthetic fixtures as customers or describe the completed contract query as a contractor payment.

Form: https://docs.google.com/forms/d/e/1FAIpQLSfa2hSdVQUqsBY_ntiXNLfxUQTW1v0BR0blv17aeQ2KjYxLfw/viewform

## Project name

Splitt

## GitHub handle

IamHarrie-Labs

## Problem statement

Small agencies receive partial client payments while contractor obligations come due. They need to determine which accepted work can be paid now, which payments can wait under agreed terms, and how much working cash must remain protected. A wallet balance alone does not explain the commitments behind that decision or prevent one project's funds from covering another project's obligations.

## Project description

Splitt turns a partial client receipt into an owner-approved contractor payment plan. Owners record accepted work, payment terms and project limits. The Arc worker detects attributed receipts and queues validated drafts with in-app owner notifications; it cannot sign or submit payments. The planner proposes payments or permitted deferrals with references to structured facts. A deterministic validator checks eligibility, cumulative obligations, partial-payment rules, project reserves, daily limits and stale state. Model failures visibly fall back to the deterministic baseline.

The owner reviews the exact amounts and recipients and signs an EIP-712 authorization. A Circle developer-controlled operator executes the approved batch against ProjectVault on Arc Testnet. The contract enforces project isolation, authorized recipients, replay guards and atomic payouts. PostgreSQL stores execution intents and receipt cursors; unresolved attempts block further allocations until their outcome is reconciled.

The public synthetic demo starts with a 2,000-USDC invoice, a 1,200 receipt and a 300 reserve. It allocates 700 to one contractor and a permitted 200 to another. When the 800 remainder arrives, it proposes only the outstanding 300. Browser demo settlement is simulated. The same flow ran on Arc Testnet at scaled amounts (1.2 of 2 USDC, 0.3 reserve) through the verified vault and a Circle developer-controlled operator: 0.7 + 0.2 USDC payouts (https://explorer.testnet.arc.io/tx/0x938ea7d6370c06d25daf6c73493e5c43f304abf9938563b7bd934325edaebdc5), the 0.8 remainder (https://explorer.testnet.arc.io/tx/0xde2ce4f47108ab118ef30b7dd835b7da7dae60ed7b83504ead5011acddd35c6d) and the final 0.3 (https://explorer.testnet.arc.io/tx/0x098fa70efda77e5f22396521bce7d5ccdeb3bbbaab8997e9ae8551a0ceb32881). The project ended at 0.8 USDC with its reserve intact, and a separate project's 1 USDC was untouched. A deliberately lost provider response resumed as the same job without a duplicate payment. Recipients are controlled test wallets, not real contractors.

A separate payment-note reader extracts quoted invoice, paid-amount and remainder evidence and checks it against indexed receipts. A ten-case synthetic evaluation scored the tested model-plus-fallback path 9/10 against 7/10 for literal matching; model output was used in four cases. This is not a production accuracy or payout-model improvement claim. The new automatic draft worker has concurrency, lease recovery, stale-state and PostgreSQL persistence tests; hosted end-to-end evidence remains pending API deployment.

## Traction

No real business pilot is onboarded yet. Real customer payment volume is zero. The public demo, synthetic model evaluation and funded testnet scenario demonstrate development progress, not adoption. The owner is seeking a business with a real invoice and approved contractor obligations for a consenting pilot. The public /pilot page accepts anonymized participant facts and exports feedback locally; an unverified export does not count as adoption.

## Public source and demo

- Source: https://github.com/IamHarrie-Labs/splitt
- Hosted demo: https://splitt-dun.vercel.app/demo
- Participant case review: https://splitt-dun.vercel.app/pilot
- Verified vault: https://explorer.testnet.arc.io/address/0x724c12bea7fab30e27a9b3f4d5581351ebc2c6c6
- Independent exact bytecode match: https://repo.sourcify.dev/5042002/0x724c12bea7fab30e27a9b3f4d5581351ebc2c6c6

## Video field

The organizer requests a Loom, YouTube or Vimeo link, under three minutes. The 2:40 draft is available from the GitHub preview release, but its closing publication status is outdated and it lacks the final payout evidence. Refresh the recording after the chain proof, then upload it to an accepted service. The GitHub release URL alone does not satisfy that field.

## Owner-provided fields

Fill contact email, Discord/Telegram handles, team names/size and previous participation/awards yourself. Do not infer them from a signed-in browser account. If the project is new, state that honestly in the prior-work field; use “Not applicable — new project” for the comparison field if the form allows it. Optional future open-source commitments and call participation require your own choice.

## Before final submission

Payout/remainder and recovery proof recorded 15 October 2026 (docs/testnet-payout-proof.json). Include the AI acceptance/fallback result without claiming an improvement over the baseline unless demonstrated. Link the accepted video host and confirm the latest public demo works. Add a pilot only when real participants and activity exist.
