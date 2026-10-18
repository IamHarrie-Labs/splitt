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

## Phase 1: engineering (about 2 weeks, no external dependency)

1. **Integrate V2 into the app.** The server, core package and web app only know the V1 testnet
   vault and EIP-712 domain version `1`. Add a V2 ABI and domain, then point the self-serve and live
   paths at it by network.
2. **Network configuration.** Chain ID `5042002` is hardcoded in 27 places across 16 files
   (`server/src/live/*`, `server/src/approvals.ts`, `server/src/auth/routes.ts`,
   `server/src/selfserve/registry.ts`, `server/src/bridge/gateway.ts`, `packages/core/src/*`,
   `web/app/start/*`, `web/app/workspace.tsx`, `web/app/testnet/*`, `web/app/docs/page.tsx`). Replace
   them with one `SPLITT_NETWORK=testnet|mainnet` setting that resolves chain ID, RPC, explorer, USDC
   and the vault. Unknown values fail closed.
3. **Smart-account signatures off-chain.** `server/src/approvals.ts`, `server/src/live/service.ts`
   and `server/src/auth/routes.ts` use viem's standalone `verifyTypedData` and `verifyMessage`. These
   only recover EOA signatures, so a Safe owner's signature would be rejected before reaching the
   chain. Switch to the public-client actions, which check ERC-1271 and ERC-6492.
4. **Safe signing flow in the UI.** A multisig signature needs threshold collection, for example
   through the Safe app or Safe Transaction Service, before the batch is submitted. The pre-sign
   summary must show the vault, recipients, exact amounts, reserve after payment and expiry, as listed
   in the readiness doc.
5. **Mainnet treatment in the UI.** Add a persistent network badge, a distinct mainnet warning and
   separate ERC-20 (6-decimal) and native-gas (18-decimal) USDC display.
6. **Fork rehearsal.** Script a run against an Arc Mainnet fork with a real Safe as owner: deploy,
   create a project, add and activate a payee, pay, pause, revoke the operator, transfer ownership,
   withdraw above reserve. Record the transcript as evidence.
7. **Fuzz and invariant tests** for `totalAccounted`, unattributed funds, batch permutations and
   blocklisted payees, as the readiness doc asks.

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
