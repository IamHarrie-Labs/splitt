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

Splitt turns a partial client receipt into an owner-approved contractor payment plan. Owners record accepted work, payment terms and project limits. The planner proposes payments or permitted deferrals with references to structured facts. A deterministic validator checks eligibility, cumulative obligations, partial-payment rules, project reserves, daily limits and stale state. Model failures visibly fall back to the deterministic baseline.

The owner reviews the exact amounts and recipients and signs an EIP-712 authorization. A Circle developer-controlled operator executes the approved batch against ProjectVault on Arc Testnet. The contract enforces project isolation, authorized recipients, replay guards and atomic payouts. PostgreSQL stores execution intents and receipt cursors; unresolved attempts block further allocations until their outcome is reconciled.

The public synthetic demo starts with a 2,000-USDC invoice, a 1,200 receipt and a 300 reserve. It allocates 700 to one contractor and a permitted 200 to another. When the 800 remainder arrives, it proposes only the outstanding 300. Browser demo settlement is simulated. A scaled scenario is funded on Arc Testnet; the deployed source is independently verified. Contractor payout and recovery evidence are still pending the contract's activation delay.

## Traction

No real business pilot is onboarded yet. Real customer payment volume is zero. The public demo, synthetic model evaluation and funded testnet scenario demonstrate development progress, not adoption. The owner is seeking a business with a real invoice and approved contractor obligations for a consenting pilot.

## Public source and demo

- Source: https://github.com/IamHarrie-Labs/splitt
- Hosted demo: https://splitt-dun.vercel.app/demo
- Verified vault: https://explorer.testnet.arc.io/address/0x724c12bea7fab30e27a9b3f4d5581351ebc2c6c6
- Independent exact bytecode match: https://repo.sourcify.dev/5042002/0x724c12bea7fab30e27a9b3f4d5581351ebc2c6c6

## Video field

The organizer requests a Loom, YouTube or Vimeo link, under three minutes. The 2:40 draft is available from the GitHub preview release, but its closing publication status is outdated and it lacks the final payout evidence. Refresh the recording after the chain proof, then upload it to an accepted service. The GitHub release URL alone does not satisfy that field.

## Owner-provided fields

Fill contact email, Discord/Telegram handles, team names/size and previous participation/awards yourself. Do not infer them from a signed-in browser account. If the project is new, state that honestly in the prior-work field; use “Not applicable — new project” for the comparison field if the form allows it. Optional future open-source commitments and call participation require your own choice.

## Before final submission

Record actual payout/remainder and recovery proof after 15 October 2026 at 16:18:53 Lagos. Replace pending statements only after verification. Include the AI acceptance/fallback result without claiming an improvement over the baseline unless demonstrated. Link the accepted video host and confirm the latest public demo works. Add a pilot only when real participants and activity exist.
