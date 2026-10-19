# Mainnet launch guide

This is the checklist for taking Splitt live on Arc Mainnet. The code side is ready: a
network switch, the V2 contract wired in, multisig signing and a checked deploy script. What's
left needs your accounts, your keys or outside parties, so this guide is written for you to
follow in order. Never paste a private key, API key or entity secret into a chat or a commit.

Before you start, confirm two facts we could not check from the build environment:

- **Safe on Arc Mainnet.** Check that [Safe{Wallet}](https://app.safe.global) lists Arc
  Mainnet. If it doesn't, ask Arc or Safe whether the official Safe contracts (v1.4.1, with the
  default `CompatibilityFallbackHandler`) are deployed there.
- **Network details.** Confirm the chain ID `5042`, RPC `https://rpc.mainnet.arc.io` and
  explorer `https://explorer.arc.io` against Arc's own docs.

## 1. Book the audit (start today, it takes longest)

1. Send the auditor:
   - the contract `contracts/src/ProjectVaultV2.sol`;
   - the commit you want audited;
   - `docs/mainnet-candidate.json`, which records the exact compiler settings and bytecode hashes.
2. Ask them to confirm those hashes in their report, so it's provable the deployed code is the
   audited code.
3. When findings come back, I can fix them. Then run `npm run mainnet:artifact`, commit, and have
   the auditor confirm the final hashes. That commit is your **release commit**.

Typical time is two to four weeks. Do steps 2 to 6 while you wait.

## 2. Create the owner Safe

1. In Safe{Wallet}, create a Safe on Arc Mainnet with **2 of 3** signers. Use three wallets on
   separate devices, ideally hardware wallets, held by different people where possible.
2. Save the Safe address. This is `MAINNET_OWNER_ADDRESS`.
3. Fund the Safe with a little USDC for gas. On Arc, gas is paid in USDC.

The Safe owns the vault. Any one Safe member can sign in to Splitt, but a payout only goes
through once two of them sign the exact batch.

## 3. Set up the Circle operator for mainnet

1. In the Circle developer console, use a **production (mainnet) API key**. Never reuse the
   testnet key or entity secret.
2. Register a new entity secret, create a new wallet set, and create one wallet on blockchain
   **`ARC`**.
3. Save these four values:
   - `CIRCLE_API_KEY` (the production key);
   - `CIRCLE_ENTITY_SECRET` (the new one);
   - `CIRCLE_WALLET_ID`;
   - the wallet address, which is `MAINNET_OPERATOR_ADDRESS`.
4. Send that wallet a small amount of USDC for gas.

## 4. Create a deployer key

Create a fresh wallet used only to pay for the deployment. Fund it with a few USDC on Arc
Mainnet. It never owns anything; the Safe is set as owner in the deployment itself. Keep its key
in your local shell as `DEPLOYER_PRIVATE_KEY`, never in a file you commit.

## 5. Production infrastructure

- **Database.** Create a new managed Postgres for mainnet with daily backups. Restore a backup
  once to prove it works. Never point mainnet at the testnet database.
- **API host.** Run a separate API for mainnet, for example `api.usesplitt.xyz`, and move
  testnet to its own subdomain such as `testnet-api.usesplitt.xyz`.
- **Monitoring.** At minimum, set up an uptime check on `/health` and alerts for failed or
  stuck payout jobs. Automated balance-drift alerts are still on the engineering list.

## 6. Legal and support

Publish mainnet terms, a privacy notice and a fee disclosure. Add a support contact and say what
happens if a payment fails. The existing `/terms` and `/privacy` pages are written for
testnet and need updating.

## 7. Dry run the deployment

Do this once the audit is final. On your own machine, check out the release commit with no local
changes, then set these in your shell:

```sh
export DEPLOYER_PRIVATE_KEY=0x...            # from step 4
export MAINNET_OWNER_ADDRESS=0x...           # the Safe, from step 2
export MAINNET_OPERATOR_ADDRESS=0x...        # the Circle ARC wallet, from step 3
export MAINNET_AUDIT_REPORT_URL=https://...  # the published audit report
export MAINNET_RELEASE_COMMIT=<40-character commit the auditor confirmed>
npm run mainnet:deploy
```

This sends nothing. It lists every check. Fix anything it reports as blocked until it says
**All checks pass**.

## 8. Deploy

```sh
SPLITT_DEPLOY_CONFIRM=arc-mainnet npm run mainnet:deploy -- --broadcast
```

The script records the transaction in `docs/mainnet-deployment.json` before waiting. It then
checks the deployed code against the audited build and prints the values for the next step. If
it reports a verification failure, stop and don't fund the vault.

## 9. Start the mainnet API

Set these on the mainnet API server:

```sh
SPLITT_MODE=arc-mainnet
SPLITT_MAINNET_CONFIRM=arc-mainnet
ARC_RPC_URL=https://rpc.mainnet.arc.io
OWNER_ADDRESS=<the Safe>
OPERATOR_ADDRESS=<the Circle ARC wallet>
VAULT_ADDRESS=<printed by the deploy>
VAULT_DEPLOYMENT_BLOCK=<printed by the deploy>
MAINNET_EXPECTED_RUNTIME_CODE_HASH=<printed by the deploy>
DATABASE_URL=<the mainnet database>
CIRCLE_API_KEY=... CIRCLE_ENTITY_SECRET=... CIRCLE_WALLET_ID=...
WEB_ORIGIN=https://www.usesplitt.xyz
```

The API refuses to start if the vault's code isn't the audited build, if the Circle wallet isn't
on `ARC`, or if the owner, operator or USDC differ from the vault.

Then run `npm run mainnet:check` with the `MAINNET_*` values set. It must exit with no blockers.

## 10. Switch the website

In the production web deployment (Vercel), set `NEXT_PUBLIC_SPLITT_NETWORK=mainnet` and point
`/api` at the mainnet API. Every page then shows the red "Arc Mainnet · real USDC" badge. "Launch
app" sends teams to mainnet onboarding, because self-serve vaults stay off until after the audit.
Keep the testnet site as a separate deployment if you want it public.

## 11. Set up the first project through the Safe

Creating projects and adding payees are owner actions, so they're Safe transactions. In Safe{Wallet}:

1. Open **Transaction Builder**. Enter the vault address and paste the ABI from
   `artifacts/ProjectVaultV2.json` (created by `npm run contracts:compile`).
2. Call `createProject` with small caps for the pilot, then `addCommitment` for each payee.
3. Have a second signer approve, then execute.
4. Register the project in the Splitt workspace.
5. Payees become payable **24 hours** after they're added. That delay is deliberate.

## 12. First payment

1. A client pays a small invoice into the vault.
2. Splitt drafts the plan. One Safe member clicks **Add my Safe signature**, a second does the
   same, and the batch is queued and paid.
3. Check it on the explorer and in Splitt.
4. Rehearse an emergency: pause the vault from the Safe, unpause it, and practise removing the
   operator.

Only after that, raise the caps and announce.

## Still on the engineering list

These don't need your keys, and I can do them next:

- separate on-screen displays for project USDC (6 decimals) and gas USDC (18 decimals);
- balance-drift and stuck-job alerts;
- a full rehearsal on an Arc Mainnet fork with a real Safe;
- fuzz and invariant tests for the contract's accounting.
