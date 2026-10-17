# Splitt first-agency pilot

Status: no business onboarded; no pilot payment volume. Prepared 4 October 2026.

## Practical pilot options

1. Your own business, with a real current or recent client invoice and agreed contractor commitments. Fastest if these records already exist. Disclose that the builder owns the business; never describe this as an independent customer.
2. A design, development or marketing agency you know. Best independent validation: partial client receipts and two accepted contractor obligations fit Splitt directly.
3. A freelancer who manages subcontractors. Smaller setup, same payment problem; choose one with actual subcontractor terms rather than hypothetical invoices.

Use anonymized real facts with explicit consent. Testnet USDC demonstrates the business workflow but is not real customer payment revenue. Record the source as pilot_mirrored for anonymized/mirrored data; pilot_real only when the classification is justified by actual business use. Existing Northstar and Fieldwork fixtures must stay fixture.

Recommended session input: business name or agreed pseudonym, owner consent, invoice amount, partial receipt, reserve, two contractor obligations, acceptance status, due dates and whether partial/deferred payment is permitted. No private keys or confidential client documents are needed.

## Recruit one agency or studio

Choose an owner with an active client invoice, two or more approved contractor obligations and a client who sometimes pays in installments. Ask the owner to bring an anonymized recent underpayment example and their reserve rule. Do not request private client documents until they explicitly consent and choose a storage location.

Invitation draft (not sent):

> I'm building Splitt for agencies that receive a partial client payment while contractors are waiting. It proposes who can be paid now, shows the tradeoffs, and keeps a project reserve protected. Would you try one anonymized invoice in a 20-minute session? We'll start with a simulation so you can compare its plan with your own decision.

## Observe a 20-minute session

1. First five minutes: ask what arrived, which work is accepted, what each contractor agreed to, and how much cash must remain.
2. Next ten minutes: let the owner create the project and review the proposal without coaching. Record confusion, errors and whether the allocation matches their judgment.
3. Final five minutes: show the remainder scenario and ask whether they would use it for the next project. Agree on a follow-up only if they want one.

## Record adoption honestly

Track consenting business identity, onboarding date, number of real invoices reviewed, accepted versus edited plans, reserve breaches (target zero), failed/duplicate payments (target zero), time to first useful plan and repeat use. Separate real, mirrored/anonymized and fixture sources. Testnet token movement alone is not real business payment volume.

Exit criteria: one consenting business completes a useful workflow and returns for a second review. Without that evidence, submission traction stays zero. Live customer payments require a separate production readiness review; this build supports testnet only.

## Product-assisted session

Open `/pilot`. Enter business and contractor aliases, the actual invoice, receipt, reserve and approved obligations. The participant confirms permission and that this is a real case. The page computes a local baseline proposal; it does not upload data or request a wallet. Have the participant give feedback and choose whether it may be quoted, then export the session. Keep that file private until the participant agrees to sharing. The export is explicitly unverified and has zero customer-payment volume. Verify the case with the participant before counting it, and book a second session only if they want to continue.

Use the authenticated `/start` workspace separately for the self-serve testnet workflow once public API HTTPS is connected. Each participant deploys and owns their own vault. Select an indexed receipt, optionally review a payment-note suggestion, wait for the automatic draft and review it before signing. Test wallets and testnet tokens remain distinct from real customer revenue. Until public API connection passes, `/pilot` can support a local case review but cannot demonstrate hosted payouts.
