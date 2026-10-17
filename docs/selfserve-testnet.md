# Self-serve Arc Testnet release

The public flow is a separate `/start` workspace. It uses signed wallet sessions and a verified vault registry, not usernames or passwords. Sessions, financial history and gas reservations still require PostgreSQL. One wallet cannot read or authorize another wallet's workspace.

Visual direction: reuse Splitt's pearl canvas, deep blue, Space Grotesk headings and Poppins copy. Comfortable form spacing, open ruled sections, one active step and native details for recovery. No new card grid or decorative labels. Money uses exact micro-USDC arithmetic and tabular digits. Mobile stacks form columns; transaction confirmations retain recipients and exact amounts.

Scope: one vault per wallet, one project, one or two contractors, invoice up to 10 test USDC, batch up to 5 test USDC. New vaults use a three-minute recipient activation delay. Users pay for vault deployment, project setup and deposits from their own testnet wallet. Circle sponsors approved payout execution only.

Registration requires the exact canonical creation calldata, successful creation transaction from the signed-in wallet, correct USDC/operator/owner, and a recorded runtime-code hash. Reused or lookalike contracts are rejected. The server verifies owner, operator and runtime code before forwarding a batch.

Gas sponsorship uses fixed gas limits and EIP-1559 fee caps, with durable idempotent reservations: at most 3 batches and 0.05 native USDC reserved per wallet per UTC day, 30 batches and 1 USDC globally per day, and 10 USDC across the preview's lifetime. Gas estimates over 600,000 units are rejected. Reservations are conservative and not refunded, including failed attempts. These are testnet service limits, not a Paymaster integration. The contract still requires the exact owner's EIP-712 batch signature.

Public statistics distinguish controlled tests from unverified testnet activity. Wallet counts are not people or businesses. A funded address, deployed vault, test transfer or paid transaction does not by itself establish business adoption. No outreach is sent automatically, and the builder submits the final form.

CCTP implementation is frozen for this release. It is not required for the public self-serve flow. Mainnet, smart-contract-wallet authentication, multi-project workspaces and arbitrary relaying are outside scope.

## Deployment and proof

Set `SPLITT_SELF_SERVE=true` in the private API environment, with the existing Arc Testnet, PostgreSQL and Circle operator settings. Set `SPLITT_CONTROLLED_OWNERS` to every builder-owned proof address before registration. Stop the legacy worker before starting this runtime; never run two workers against the same vault. Keep the owner signing key on the owner's device.

The API remains bound to VPS loopback until a supplied domain has valid HTTPS. The existing system reverse proxy serves other applications; add only Splitt's virtual host after validating its configuration. Set the web server's `SPLITT_API_URL` to that HTTPS endpoint and redeploy after API checks pass. `/start` is the public wallet flow; `/testnet` remains the earlier owner workspace.

`scripts/prepare-selfserve-proof.ts` prepares two private local proof wallets. With `SPLITT_SELF_SERVE_PROOF=arc-testnet`, `scripts/prove-selfserve.ts setup` uses at most 6 existing test USDC to fund them and deploy their vaults. It journals signed transactions before broadcast. After the enforced three-minute activation, run the same script with `settle`. It checks automatic receipt-triggered drafts, owner signatures, Circle execution, remaining obligations and cross-wallet access denial. Resume the same journal after interruptions; do not create replacement payment intents.

Only a completed `docs/selfserve-testnet-proof.json` establishes successful controlled execution. A passing API test or build does not establish browser, mobile, public HTTPS or business-adoption proof.
