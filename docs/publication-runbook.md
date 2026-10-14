# Publishing Splitt

The web app is now published at https://splitt-dun.vercel.app, with a public interactive demo at /demo. Unauthenticated HTTP access and the browser allocation/remainder flow were verified on 14 October. `NEXT_PUBLIC_DEMO_ONLY=true` is configured for Vercel production/preview: local-only workspace routes redirect to the demo and testnet access explains its hosting status. The API/worker is not cloud-hosted yet.

The public web app can run independently on Vercel. `/demo` uses the real deterministic allocation engine with synthetic data and browser-only settlement. It requires no API credentials, wallet or database. `/testnet` remains the authenticated owner workspace and needs a separately hosted API.

## Vercel web

Import the public GitHub repository, choose **web** as the Root Directory, and use Node 22 or later. `web/vercel.json` installs the monorepo dependencies and builds Next.js. Leave "Include source files outside of the Root Directory" enabled for shared packages and the pure fixture module.

Optional public variables: `NEXT_PUBLIC_REPO_URL`, `NEXT_PUBLIC_PILOT_EMAIL`, `NEXT_PUBLIC_X_URL`. Set `SPLITT_API_URL` only once the authenticated API has a reachable HTTPS URL. Never place Circle or model secrets in NEXT_PUBLIC variables or the web deployment.

Validation: home → Open demo → generate → review 700/200 → simulate → add 800 remainder → generate → review 300 remaining → simulate → Northstar balance 800 and Fieldwork balance 1,000. Reset and reload return to synthetic initial state. These are not on-chain transfers.

## Live API and continuous worker

Use a persistent container host and PostgreSQL database. Vercel request functions do not keep the receipt-indexing/queue worker running. `Dockerfile.api` builds successfully in GitHub CI and refuses startup without testnet configuration. The owner has a VPS; `compose.vps.yaml` validates with public placeholders. See `vps-deployment.md`. Actual deployment awaits SSH access and an API subdomain.

Configure server-only secrets through the host's secret manager: DATABASE_URL, CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, CIRCLE_WALLET_ID. Public deployment identifiers: OWNER_ADDRESS, VAULT_ADDRESS, OPERATOR_ADDRESS, VAULT_DEPLOYMENT_BLOCK, ARC_RPC_URL. Set SPLITT_MODE=arc-testnet, SPLITT_TESTNET_CONFIRM=arc-testnet, WEB_ORIGIN to the exact Vercel origin, and HOST=0.0.0.0. Use TLS and a fixed production web origin; preview deployments should not share owner sessions.

Do not upload `.env`, `.env.testnet.local`, server/.secrets, server/.data or Circle recovery files. The cloud API does not need the owner's private key: the owner signs in the browser. Migrate the database with server/src/db/migrate.ts before starting, then register the public project metadata through owner authentication.

## Model evaluation

`npm run planner:eval` makes no model calls. Live evaluation uses ANTHROPIC_API_KEY and PLANNER_MODEL, or PLANNER_PROVIDER=vercel-gateway with a server-only AI_GATEWAY_API_KEY / local VERCEL_OIDC_TOKEN. The gateway evaluator refuses nonzero model pricing and models without tool support. PLANNER_EVAL_INTERVAL_MS spaces synthetic cases to respect rate limits; each has at most two requests. The local OIDC token expires and is not a durable VPS credential. Review provider retention terms before sending confidential pilot facts. Ten cases record hashes, correction counts, validation, fallback and allocation differences. A fallback does not count as a model success. Compare changed decisions manually; fluent explanations are not evidence of improvement. Anthropic is the implemented adapter, not a product requirement.

## Evidence and pending work

The Arc vault's creation/runtime bytecode both match Sourcify exactly: see sourcify-verification.json. Arc explorer also now returns verified source code; see arc-verification.json. Contractor activation is 15 October 2026 at 15:18:53 UTC. After that, stop the local API worker and run `npm run testnet:prove -- --recovery` with SPLITT_PROOF_CONFIRM=arc-testnet. The controlled proof loses one accepted provider response, resumes the original durable job and verifies the same calldata/job, successful vault receipts and final cumulative paid amounts. It must actually run before being claimed as evidence. Restart the API afterward. Check on-chain payouts/remainder/isolation before updating the final video.

Publication requires authenticated GitHub/Vercel access. A real pilot requires a consenting business with a real invoice and agreed contractor obligations; synthetic projects never count as customers. The final hackathon video must show the functioning product and distinguish simulated steps from confirmed chain transactions.
