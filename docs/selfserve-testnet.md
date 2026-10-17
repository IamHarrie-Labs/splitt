# Self-serve Arc Testnet release

The public flow is a separate `/start` workspace. It uses signed wallet sessions and a verified vault registry, not usernames or passwords. Sessions, financial history and gas reservations still require PostgreSQL. One wallet cannot read or authorize another wallet's workspace.

Visual direction: reuse Splitt's pearl canvas, deep blue, Space Grotesk headings and Poppins copy. Comfortable form spacing, open ruled sections, one active step and native details for recovery. No new card grid or decorative labels. Money uses exact micro-USDC arithmetic and tabular digits. Mobile stacks form columns; transaction confirmations retain recipients and exact amounts.

Scope: one vault per wallet, one project, one or two contractors, invoice up to 10 test USDC, batch up to 5 test USDC. New vaults use a three-minute recipient activation delay. Users pay for vault deployment, project setup and deposits from their own testnet wallet. Circle sponsors approved payout execution only.

Registration requires the exact canonical creation calldata, successful creation transaction from the signed-in wallet, correct USDC/operator/owner, and a recorded runtime-code hash. Reused or lookalike contracts are rejected. The server verifies owner, operator and runtime code before forwarding a batch.

Gas sponsorship uses fixed gas limits and EIP-1559 fee caps, with durable idempotent reservations: at most 3 batches and 0.25 native USDC reserved per wallet per UTC day, 30 batches and 1 USDC globally per day, and 10 USDC across the preview's lifetime. The wallet cap was raised from 0.05 after Circle's live dynamic fee estimate exceeded that initial allowance. Gas estimates over 600,000 units are rejected. Reservations are conservative and not refunded, including failed attempts. These are testnet service limits, not a Paymaster integration. The contract still requires the exact owner's EIP-712 batch signature.

Initial fee caps use Circle's contract-execution estimate, including its dynamic minimum priority fee. An uncertain response retries the original reservation. Only Circle's explicit HTTP 400 rejection for a priority fee below its current minimum permits a replacement quote. That path keeps the original signed calldata, gas limit and Circle idempotency key, and reserves the full old cost plus the full new cost. Replacement reservations consume the same daily limits; if there is insufficient budget, the existing job stays unresolved. A timeout never triggers automatic repricing.

The worker avoids chain verification when there are no executable jobs. Arc reads share a paced transport with small JSON-RPC batches to prevent concurrent vaults from bursting the public RPC. Metadata and approvals use an uncached head read. Public RPC capacity still limits preview responsiveness; this is not a production-scale availability claim.

Public testing exposed rate limiting while multiple vaults were indexed. Pacing now counts each inner JSON-RPC call in a batch and honors HTTP `Retry-After` or backs off structured RPC rate errors. Idle vaults poll about once a minute, recently used vaults every ten seconds, and pending jobs every five seconds when scheduled; failures add backoff. Explicit receipt refresh still runs immediately. Fresh contract and signing checks remain required for financial actions. Arc's [official connection reference](https://docs.arc.io/arc/references/connect-to-arc) lists the QuickNode testnet endpoint used for the hosted runtime.

If an attempted authorization expires, the worker reads chain time and checks execution flags again. A completed payout stays confirmed. Only an unexecuted signature whose deadline has passed becomes expired. Its original receipt can then produce a fresh proposal requiring a new owner signature; it never creates another deposit or signs automatically. All earlier jobs and gas reservations remain recorded.

Public statistics distinguish controlled tests from unverified testnet activity. Wallet counts are not people or businesses. A funded address, deployed vault, test transfer or paid transaction does not by itself establish business adoption. No outreach is sent automatically, and the builder submits the final form.

CCTP implementation is frozen for this release. It is not required for the public self-serve flow. Mainnet, smart-contract-wallet authentication, multi-project workspaces and arbitrary relaying are outside scope.

## Deployment and proof

Set `SPLITT_SELF_SERVE=true` in the private API environment, with the existing Arc Testnet, PostgreSQL and Circle operator settings. Set `SPLITT_CONTROLLED_OWNERS` to every builder-owned proof address before registration. Stop the legacy worker before starting this runtime; never run two workers against the same vault. Keep the owner signing key on the owner's device.

The API's Docker port remains bound to VPS loopback. The existing system reverse proxy serves its authenticated HTTPS endpoint alongside the other applications. Production `SPLITT_API_URL` now uses the verified temporary hostname `https://splitt-api.38-49-210-22.sslip.io` while `usesplitt.xyz` finishes registration. Public health and signed access checks passed (`public-access-proof.json`). `/start` is the public wallet flow; `/testnet` remains the earlier owner workspace.

The workspace reports each owner's remaining sponsored gas allowance, available slots and daily reset time. Prior attempts can consume the allowance even when slots remain. Failed or expired jobs can be followed by an explicitly requested fresh draft; this does not reset sponsorship limits and never creates another deposit. Exact payout hashes, plan IDs and displayed items are checked in the browser before a signature is requested. Network failures do not automatically retry signed mutations.

`scripts/prepare-selfserve-proof.ts` prepares two private local proof wallets. With `SPLITT_SELF_SERVE_PROOF=arc-testnet`, `scripts/prove-selfserve.ts setup` uses at most 6 existing test USDC to fund them and deploy their vaults. It journals signed transactions before broadcast. After the enforced three-minute activation, run the same script with `settle`. It checks automatic receipt-triggered drafts, owner signatures, Circle execution, remaining obligations and cross-wallet access denial. Resume the same journal after interruptions; do not create replacement payment intents.

Only a completed `docs/selfserve-testnet-proof.json` establishes successful controlled execution. A passing API test or build does not establish browser, mobile, public HTTPS or business-adoption proof.
