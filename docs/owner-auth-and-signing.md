# Owner authentication and signing

The default localhost preview needs no credentials. These options add authentication and durable fixture storage; they do not enable live payments.

## Configure

Copy `.env.example` to the root `.env`. Set `OWNER_ADDRESS` to the public address of your browser wallet (EOA). Restart the server. **Sign in as owner** now requires a wallet signature before loading projects or changing the workspace. Any other wallet is rejected.

To enable durable storage, also set `SPLITT_STORAGE=postgres` and `DATABASE_URL`. Start your Postgres server, run `npm run db:migrate`, then restart Splitt. The migration reads `.env` and applies both schema.sql and runtime.sql. A fresh owner workspace receives the sample projects once, using deterministic UUIDs. The file demo's history is not imported. Database reset is disabled because audit entries are append-only.

Set a non-zero `VAULT_ADDRESS` to enable fixture batch signing. This is a domain reference, not evidence of deployment. Open Allocation review, generate a plan, choose **Sign exact fixture batch**, review recipients, amounts, project version, plan hash, vault reference and expiry, then choose **Sign fixture authorization**. Select Arc Testnet (5042002) in your wallet. Rejected wallet prompts leave the plan unsigned; preparing again reuses an unexpired batch.

Fixture signing uses **Splitt Fixture**, not the deployed contract's **Splitt** domain. These signatures cannot authorize a live payout. The API stores approval once after checking the configured owner, current facts, canonical hashes, ordered execution items, project version and deadline. Signing does not alter balances or mark settlement complete. Simulation is still separate.

## Session behavior

- EIP-4361 challenges bind domain, URI, Arc chain ID, wallet, nonce and a five-minute expiry. Nonces are consumed atomically and cannot be reused.
- Sessions last eight hours. Random opaque cookie tokens are stored only as SHA-256 hashes in the repository. A shared signing secret is unnecessary.
- Cookies are HttpOnly, SameSite=Strict, scoped to `/api`, and Secure on HTTPS. Loopback HTTP uses a development cookie without Secure.
- Sessions are origin-bound. State-changing requests require the configured Origin and a separate CSRF token. Authentication and mutations are rate-limited.
- File-mode sessions are in memory and expire when the API restarts. Postgres stores sessions durably. Disconnecting through the wallet button revokes the browser session; reauthentication rotates it.
- Batch approvals expire after fifteen minutes. Changed facts, newer plans, tampered signatures, wrong owners and duplicate approval attempts are rejected. Refresh the plan after changes.

Current authentication checks the configured fixture owner. Live mode must additionally verify the current owner of the deployed vault, chain-derived balance and caps, approved on-chain commitments, daily spending and replay flags. Live execution is not enabled.

## Verification limits

Tests use ephemeral test-wallet keys generated in memory, Fastify requests, and PGlite's embedded PostgreSQL engine. They cover the authenticated planning/signing/simulation lifecycle, migrations applied twice, relational rollback, exact large integers, concurrent repository access and persistent nonce/session rows. A real wallet-extension prompt and standalone Postgres TCP connection are not verified on this machine. Wallet private keys never belong in the browser UI, repository or chat.
