# Cross-chain invoice funding

Implemented route: Base Sepolia (84532, Circle domain 6) to Arc Testnet (5042002, domain 26), standard finalized CCTP V2. Not a mainnet service. A completed transfer is not yet evidenced; see `cctp-readiness.json` for the last read-only route and balance check.

## Operator flow

1. Sign in to `/testnet` with the workspace owner. Register the existing onchain project metadata first.
2. Fund the source payer with Base Sepolia USDC and ETH. The payer must be the registered client or the owner funding on its behalf. Arc funding is a different balance. `npx tsx scripts/check-cctp.ts` checks the known owner without reading its private key.
3. Save an invoice funding intent. Enter the amount and maximum protocol fee in USDC; calculations use exact six-decimal integers. Circle's live fee quote must be available and within the limit. Base's deployed TokenMessenger lacks the newer fee-switch getter; the quote comes from Circle's route fee API.
4. Review the invoice, payer, vault and fee limit. With the source wallet on Base Sepolia, approve only the burn amount and sign `depositForBurn`. The browser journals submission before progressing; the server verifies successful receipt, sender, exact calldata, canonical MessageSent emitter and message fields.
5. Check the attestation later. Standard transfers wait for source finality; this is not instant settlement. Do not burn again while waiting. The server rechecks the recorded source event, verifies the fixed route and simulates Circle's `receiveMessage` signature check unless the nonce is already consumed.
6. With the owner wallet on Arc, sign the direct `receiveMessage` transaction. The gateway requires the matching Circle MessageReceived event AND one unambiguous USDC mint into the vault for amount minus the attested fee. Batched relayer receipts are outside this release.
7. Review and sign owner attribution to the invoice. An identity derived from destination chain, actual mint transaction and USDC log index prevents assigning one mint twice. Source burn identity and Circle nonce are independently unique. Attribution evidence binds the source event, mint, invoice and net amount. This destination-based key supersedes the source-key design in D11 of the initial spec.
8. The existing indexer observes PaymentAttributed; only then do chain-derived project balances and the automatic draft worker reflect the funding. API calls never increment a project balance or authorize a payout.

## Recovery

Reloaded sessions retain server intents. The recovery disclosure accepts existing burn, mint or attribution hashes and verifies the relevant receipt. A saved browser burn hash can also be recovered. If a wallet closed after submission but before the hash was returned, inspect its history; the UI keeps the uncertain submission blocked. Do not clear the submission marker or create another burn to escape an uncertain result. A reverted burn needs explicit operator review and a new intent; it is never automatically retried.

If someone already relayed the Circle message, recover the direct destination transaction hash rather than calling receiveMessage again. Conflicting source evidence, duplicate nonce, reused mint receipt, wrong token/domain/payer/vault, fee mismatch and ambiguous receipts are rejected. Standard messages without hooks only.

## Proof still required

Record an actual source burn, attestation, destination mint and owner attribution in `docs/cctp-transfer-proof.json` only after verification. Include chain IDs, gross/net amounts, fee, transaction hashes, attribution ID, invoice and unchanged other-project balance. Use controlled testnet classification unless it was consenting business use. A source burn alone and mocked protocol tests are not an end-to-end transfer proof.

Primary references: [Circle addresses](https://developers.circle.com/cctp/references/contract-addresses), [message format](https://developers.circle.com/cctp/references/technical-guide), [fees and deployed versions](https://developers.circle.com/cctp/concepts/fees).
