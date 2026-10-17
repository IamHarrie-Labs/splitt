# Publishing Splitt

The web app is published at https://splitt-dun.vercel.app, with a public interactive demo at /demo. Unauthenticated HTTP access and the browser allocation/remainder flow were verified on 14 October. `NEXT_PUBLIC_DEMO_ONLY=true` keeps the earlier local workspace routes in demo mode. The API/worker now runs in an isolated VPS container; its public HTTPS connection awaits the supplied domain. `/start` is the new self-serve wallet flow and shows an unavailable state until that API connection is configured.

The public web app can run independently on Vercel. `/demo` uses the real deterministic allocation engine with synthetic data and browser-only settlement. It requires no API credentials, wallet or database. `/testnet` remains the authenticated owner workspace and needs a separately hosted API.

## Vercel web

Import the public GitHub repository, choose **web** as the Root Directory, and use Node 22 or later. `web/vercel.json` installs the monorepo dependencies and builds Next.js. Leave "Include source files outside of the Root Directory" enabled for shared packages and the pure fixture module.

Optional public variables: `NEXT_PUBLIC_REPO_URL`, `NEXT_PUBLIC_PILOT_EMAIL`, `NEXT_PUBLIC_X_URL`. Set `SPLITT_API_URL` only once the authenticated API has a reachable HTTPS URL. Never place Circle or model secrets in NEXT_PUBLIC variables or the web deployment.

Validation: home → Open demo → generate → review 700/200 → simulate → add 800 remainder → generate → review 300 remaining → simulate → Northstar balance 800 and Fieldwork balance 1,000. Reset and reload return to synthetic initial state. These are not on-chain transfers.

## Live API and continuous worker

Use a persistent container host and PostgreSQL database. Vercel request functions do not keep the receipt-indexing/queue worker running. `Dockerfile.api` builds successfully in GitHub CI and refuses startup without testnet configuration. The isolated VPS service binds its API to loopback port 4400 and has persistent PostgreSQL. Other applications already use the system Caddy proxy: do not start the optional Compose TLS profile on this VPS. See `vps-deployment.md` and `selfserve-testnet.md`.

Configure server-only secrets through the host's secret manager: DATABASE_URL, CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, CIRCLE_WALLET_ID. Public deployment identifiers: OWNER_ADDRESS, VAULT_ADDRESS, OPERATOR_ADDRESS, VAULT_DEPLOYMENT_BLOCK, ARC_RPC_URL. Set SPLITT_MODE=arc-testnet, SPLITT_TESTNET_CONFIRM=arc-testnet, WEB_ORIGIN to the exact Vercel origin, and HOST=0.0.0.0. Use TLS and a fixed production web origin; preview deployments should not share owner sessions.

Do not publish `.env`, `.env.testnet.local`, server/.secrets, server/.data or Circle recovery files. Only the necessary private API settings are transferred to the dedicated VPS over SSH and saved with restrictive permissions. The cloud API does not need the owner's private key: owners sign in their own wallets. Migrate the database with server/src/db/migrate.ts before starting. For `/start`, set `SPLITT_SELF_SERVE=true` and classify builder-owned wallets using `SPLITT_CONTROLLED_OWNERS` before registration. Only one worker runtime should run against a vault.

## Model evaluation

`npm run planner:eval` makes no model calls. Live evaluation uses ANTHROPIC_API_KEY and PLANNER_MODEL, or PLANNER_PROVIDER=vercel-gateway with a server-only AI_GATEWAY_API_KEY / local VERCEL_OIDC_TOKEN. The gateway evaluator refuses nonzero model pricing and models without tool support. PLANNER_EVAL_INTERVAL_MS spaces synthetic cases to respect rate limits; each has at most two requests. The local OIDC token expires and is not a durable VPS credential. Review provider retention terms before sending confidential pilot facts. Ten cases record hashes, correction counts, validation, fallback and allocation differences. A fallback does not count as a model success. Compare changed decisions manually; fluent explanations are not evidence of improvement. Anthropic is the implemented adapter, not a product requirement.

## Evidence and pending work

The original Arc vault's creation/runtime bytecode match Sourcify exactly: see sourcify-verification.json. Arc explorer also returns verified source code; see arc-verification.json. The original controlled payout/remainder/lost-response recovery completed on 15 October: see testnet-payout-proof.json. The VPS login and legacy workspace check is recorded separately in vps-api-proof.json. New self-serve vaults use a three-minute activation delay; their two-wallet proof has its own durable journal and must complete before being described as verified. These checks do not establish business adoption or a browser recording.

Publication requires authenticated GitHub/Vercel access. A real pilot requires a consenting business with a real invoice and agreed contractor obligations; synthetic projects never count as customers. The final hackathon video must show the functioning product and distinguish simulated steps from confirmed chain transactions.
