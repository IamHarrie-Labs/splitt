# Splitt Arc Testnet runbook

Prepared 4 October 2026. The local fixture demo and Arc Testnet mode use separate state. Neither mode supports mainnet.

## Current gate

Updated 14 October: owner funded, entity secret registered, Circle operator created/funded and vault deployed. Run `npm run testnet:start` for the connected API/worker and `npm run dev -w @splitt/web` for the web. Evidence is in `arc-deployment.json`, `testnet-bootstrap.json`, `circle-execution-proof.json` and `testnet-api-proof.json`. Explorer source verification remains rate-limited and unconfirmed. The chain scenario is scaled down 1,000× to fit faucet funding; the local fixture example keeps its original amounts.

Contractor activation expires **15 October at 16:18:53 Lagos time**. After that, set `SPLITT_PROOF_CONFIRM=arc-testnet` and run `npm run testnet:prove` to execute the reviewed test sequence using the local owner key, Circle operator and saved journals. It pays 0.7/0.2 USDC, deposits the 0.8 remainder and pays the outstanding 0.3. It refuses before activation and stops on unresolved or failed outcomes rather than replacing a batch automatically. These are payments to controlled demo wallets; real agency adoption remains zero.

Updated 13 October: local PostgreSQL is configured and restart-verified on `127.0.0.1:55432`; run `npm run db:start` after restarting the computer. Its connection is saved in the ignored root `.env`. The Circle entity secret is generated locally but not registered. After a test API key is saved in `.env`, run `npm run circle:register`, then `npm run circle:wallet`; wallet ID and operator address are saved automatically. Use `npm run testnet:start` when deployment and Circle gates are complete; it loads the prepared owner/testnet settings from `.env.testnet.local`. The regular `npm run dev` continues to use the existing file-fixture demo.

The owner wallet was generated locally: `0x8bE0633d4fd1E8828338d4BC779dDb7dd2121fD1`. Its private file is `server/.secrets/owner-wallet.json`, ignored by Git and restricted to the current Windows account. Do not upload this file, display it during a recording, or use this development wallet for real funds. It is a local key file, not a hardware wallet.

Read-only RPC verification found zero native gas balance and zero ERC-20 USDC. Circle credentials, operator wallet, vault and PostgreSQL connection are not configured. `integration-readiness.json` records the current check. No deployment or payout has occurred.

## Complete the connection

1. Use the [Circle faucet](https://faucet.circle.com/) to fund the owner with **Arc Testnet USDC**. Any login, account terms or CAPTCHA must be completed by the account holder.
2. In your Circle developer account, create a test API key and register an entity secret using Circle's supported process. Set `CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET` in the ignored root `.env`. Never paste them into chat or frontend fields.
3. Run `npm run circle:wallet`. It creates one developer-controlled EOA on `ARC-TESTNET`. Creation keys are saved before requests, so a retry reuses them. Set the returned public `OPERATOR_ADDRESS` and `CIRCLE_WALLET_ID` in `.env`. Fund the operator with testnet USDC for gas.
4. Set `OWNER_ADDRESS` to the public owner address above. Run `npm run contracts:compile`, then set `SPLITT_DEPLOY_CONFIRM=arc-testnet` and run `npm run vault:deploy`. The command uses the local owner key unless `DEPLOYER_PRIVATE_KEY` is explicitly configured. Record `VAULT_ADDRESS` and `VAULT_DEPLOYMENT_BLOCK` from the receipt saved to `docs/arc-deployment.json`.
5. Verify the contract on the testnet explorer with compiler **0.8.28**, optimizer **200**, **viaIR**, **Paris** and `artifacts/verification-input.json`. Constructor arguments are the Arc USDC address, owner, Circle operator and activation delay **86400** seconds. Explorer source verification is not automatic or currently completed.
6. Set `DATABASE_URL` for a dedicated PostgreSQL database and run `npm run db:migrate`. Use a database you control; credentials stay server-side. The testnet repository creates its separate `arc_workspaces` table when started.
7. Two test-only recipient wallets have been generated locally. Their public addresses are in `docs/test-payees.json`, with keys in the ignored secrets folder. Run `npm run testnet:prepare` to generate `docs/testnet-transactions.json` and `docs/testnet-projects.json`. Review wallet calls before executing them. Project creation, commitment registration, token allowance and deposits require actual wallet transactions. The command only prepares calldata. These projects are demonstrations, not pilot businesses.
8. Respect the vault's 24-hour payee activation delay. Set `SPLITT_MODE=arc-testnet` and `SPLITT_TESTNET_CONFIRM=arc-testnet`, then restart the API. Startup verifies the network, deployed bytecode presence, token, owner, operator and Circle wallet address/network. It refuses mismatches.
9. Open `/testnet` in a browser containing the owner wallet. Sign in, register each project metadata object, propose an allocation, inspect exact recipients/amounts and sign the batch. The Circle worker submits the owner-approved calldata. A signature is executable in this mode; fixture signatures remain in their separate domain.

## Evidence sequence

- Deposit 1,200 of the 2,000-USDC invoice into Northstar. Verify the contract balance and indexed `PaymentReceived` receipt.
- Review 700 to Amara and 200 to Tobi; the 300 reserve remains protected.
- Verify both `PayoutExecuted` events, the batch's replay flags and the actual Circle transaction hash. Record the links; do not synthesize them.
- Test interrupted polling: stop and restart the worker after submission. It reconciles the saved batch and its replay flags; it does not create a new plan ID.
- Deposit the 800 remainder after the first settlement. Replan only Tobi's unpaid 300. The final Northstar balance is 800.
- Separately fund Fieldwork if demonstrating its balance. Its on-chain balance must remain unchanged by Northstar payouts.
- Direct ERC-20 transfers are indexed separately and never automatically credited to an invoice. On-chain attribution is not yet exposed in the testnet UI.

## Recovery and implementation limits

Pending/unknown attempts keep their project blocked. The same Circle idempotency key and calldata are reused after a lost response. Provider `COMPLETE` alone is insufficient: all execution replay flags must be set. Partial flags stop the project as an invariant violation. First submissions require simulation; already-attempted unresolved submissions continue reconciliation even after approval expiry. Failed/expired batches require a fresh proposal and signature.

The queue and event cursor are PostgreSQL transactions with row locking. Tests exercise them with PGlite, including reopening and competing workers. Actual standalone PostgreSQL/TCP restart behavior, a live Circle request, wallet prompts, receipt indexing on a deployed vault and explorer verification remain external validation gates. Event history is currently stored in a per-vault JSONB workspace; partitioning/retention and normalized analytics are future scale work.

## Hosting

The default loopback app is for local development. Host Next.js and the Fastify worker on a private server network, with PostgreSQL and secret storage. Set `SPLITT_API_URL` in the **web build environment** to the API origin; Next.js proxies `/api`. Set `WEB_ORIGIN` on the API to the public HTTPS web origin. Run the worker as a continuously running Node process, not an ephemeral serverless function. Use a private reverse proxy/tunnel to the loopback API; do not expose its port indiscriminately. `npm run build` builds the web, `npm run start -w @splitt/web` serves it, and `npm run start -w @splitt/server` runs the API/worker. A hosting account and public repository destination are still needed.

Sources: [Arc network settings](https://docs.arc.io/arc/references/connect-to-arc), [Circle supported wallet networks](https://developers.circle.com/wallets/supported-blockchains), [Circle contract execution API](https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/create-developer-transaction-contract-execution).
