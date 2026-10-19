# Mainnet launch plan

Written 18 October 2026. This plan turns the eight blocked gates in
[`mainnet-readiness.md`](mainnet-readiness.md) into ordered work. Nothing here deploys to Arc
Mainnet. `npm run mainnet:check` remains the release gate and must exit zero first.

## Done in this pass

- **Multisig owners can now authorize payments.** `ProjectVaultV2.payBatch` used
  `ECDSA.recover(...) == owner()`, which a Safe or other contract owner can never satisfy. The
  ownership gate requires a multisig, so V2 could not have paid anyone once that gate was met. V2
  now accepts ERC-1271 signatures from contract owners and ECDSA signatures from EOAs. The check is
  inlined because OpenZeppelin 5.4's `SignatureChecker` needs Cancun's `mcopy` opcode and this
  build targets Paris. The new test `accepts plans signed through an ERC-1271 multisig owner`
  transfers ownership to a mock multisig through `Ownable2Step`, pays through it, and rejects the
  old owner's and a stranger's signatures.
- `docs/mainnet-candidate.json` was regenerated for the changed source. The new hashes are the
  ones to hand the auditor.

## Phase 1: engineering

### Done (19 October 2026)

1. **One network setting.** `packages/core/src/network.ts` defines Arc Testnet and Arc Mainnet:
   chain ID, RPC, explorer, USDC, Circle blockchain, vault EIP-712 version and which testnet-only
   features exist. The API takes the network from `SPLITT_MODE` (`arc-testnet` or
   `arc-mainnet`); the web app from `NEXT_PUBLIC_SPLITT_NETWORK` (`testnet` or `mainnet`). Unset
   means testnet; unknown values fail closed. The live API, approvals, sign-in, Circle wallet check,
   event indexing and the live and fixture web pages read it instead of hardcoded IDs.
2. **V2 in the live path.** V1 and V2 share the server-facing ABI, so mainnet approvals now use the
   V2 domain (`Splitt`, version `2`, chain `5042`), and an approval for the wrong network or version
   is rejected. On mainnet the API refuses to start unless the vault's deployed runtime matches
   `MAINNET_EXPECTED_RUNTIME_CODE_HASH`, so it only ever runs against the audited build.
3. **Multisig signatures off-chain.** Owner approvals and sign-in are verified through the chain
   with viem's ERC-1271 and ERC-6492 aware checks, and signatures up to 2 KB are accepted, so a Safe
   owner is no longer rejected by the API. A V2 contract test checks this against a mock multisig on
   a local chain.
4. **Mainnet safeguards in the UI.** A mainnet build shows a red "Arc Mainnet · real USDC" badge in
   the header on every page; testnet builds show the network on pages that move funds. A mainnet
   API needs its own `SPLITT_MAINNET_CONFIRM=arc-mainnet`, so a testnet config can never start it.
   Self-serve vaults and the CCTP bridge stay testnet-only: on mainnet, `/start` routes teams to
   onboarding instead of deploying the unaudited V1 artifact.

5. **Safe signing in the app.** When the vault owner is a Safe, any current Safe member can sign
   in, and membership is re-read on every request, so removal takes effect at once. Each member
   adds their signature to the exact batch from the review screen. The API stores the
   signatures, combines them in the order Safe requires once the threshold is met, and queues the
   batch through the same ERC-1271 check as any other approval.
6. **Checked deploy script.** `npm run mainnet:deploy` is a dry run by default. It refuses to
   deploy unless:
   - the chain is 5042;
   - the owner is a multisig and differs from the operator and deployer;
   - the payee delay is at least 24 hours;
   - an audit report link is set;
   - the checkout is clean and at the release commit;
   - the bytecode matches the audited manifest.

   With `--broadcast` it records the transaction first, verifies the deployed code against the
   audited template and every constructor value, and prints the runtime hash the API pins.

7. **Separate USDC displays.** The live workspace shows the vault's balances separately:
   - project USDC (the 6-decimal ERC-20);
   - USDC received but not yet attributed to a project;
   - the operator's gas balance (native USDC, 18 decimals).

   They are never added together.

8. **Alerts.** Every minute the API checks for:
   - the vault holding less USDC than it has accounted for;
   - a paused vault;
   - low operator gas;
   - repeated worker failures, which point to the RPC or Circle;
   - an unreachable RPC;
   - payout jobs that are stuck, failed or stopped by an invariant violation.

   New alerts go to `ALERT_WEBHOOK_URL` (Slack or Discord), repeat hourly while active, and send
   a "resolved" message when they clear. They also appear at the top of the workspace.

9. **Rehearsal with a real Safe.** `tests/mainnet-rehearsal.test.ts` deploys the official Safe
   v1.4.1 contracts and runs the mainnet flow with a 2-of-3 Safe as owner:
   - owner setup through Safe transactions;
   - single-signature rejection and two-signature payment, checked by both the contract and
     the API's verifier;
   - replay protection, pause, operator revocation, the reserve on withdrawals and the
     two-step ownership handover.

   `REHEARSAL_FORK_URL=<Arc Mainnet RPC> npm run mainnet:rehearse` repeats it on a fork of Arc
   Mainnet.

10. **Fuzz and invariant tests.** `tests/vault-v2-invariants.test.ts` runs seeded random sequences
    of every vault operation, including blocklisted payees and stale approvals. After each step
    it checks the accounting, payout, cap, reserve and atomicity invariants. Seeds 20261019, 7 and
    99 pass; `npm run test:fuzz` runs 300 steps.

### Still open

- The audit and the external gates below.
- Run the rehearsal against a real Arc Mainnet fork once RPC access is available. This
  environment cannot reach Arc's RPC.

Your step-by-step checklist is [`mainnet-launch-guide.md`](mainnet-launch-guide.md).

## Phase 2: external gates (in parallel, owner: Harrie)

| Gate       | Action                                                                      | Typical lead time |
| ---------- | --------------------------------------------------------------------------- | ----------------- |
| Audit      | Engage an auditor with the regenerated `mainnet-candidate.json` scope       | 2–4 weeks         |
| Ownership  | Create an Arc Mainnet Safe (2-of-3 suggested, keys on separate devices)     | 1 day             |
| Operator   | New Circle `ARC` mainnet wallet set and wallet ID; never reuse testnet      | 1 day             |
| Data plane | Separate production Postgres with backups and a restore drill               | 2–3 days          |
| Operations | Alerts for stuck jobs, balance drift, paused vault and RPC or Circle errors | 2–3 days          |
| Product    | Mainnet terms, privacy notice, fee disclosure, support and recovery path    | 1 week            |
| Pilot      | One consenting business with low caps and a reviewed first payment          | Ongoing           |

## Phase 3: release

Follow the release sequence in `mainnet-readiness.md`. Freeze the audited commit, set every
`MAINNET_*` variable, run `npm run mainnet:check` until it exits zero, deploy with a reviewed
script that refuses any chain but `5042`, then start with strict caps and one pilot payment.

## Not before then

Do not promote the testnet vault, operator, wallet ID, database or owner key. Do not deploy V1 to
mainnet. It has no ERC-1271 path, so a multisig cannot own it.
