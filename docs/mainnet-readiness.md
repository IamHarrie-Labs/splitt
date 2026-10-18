# Mainnet readiness

Splitt is live on Arc Testnet. It is **not ready to hold customer funds on Arc Mainnet yet**. The production path should preserve the current owner-signature model while replacing test credentials, adding operational controls and completing independent contract review.

## Network facts

Arc Mainnet uses chain ID `5042`, `https://rpc.mainnet.arc.io` and `https://explorer.arc.io`. USDC is the native gas asset with 18-decimal native units. Its optional ERC-20 interface remains `0x3600000000000000000000000000000000000000` and uses 6 decimals. Splitt uses the ERC-20 interface for project accounting and must keep gas values separate from project amounts.

## Launch gates

| Gate            | Required evidence                                                                  | Status  |
| --------------- | ---------------------------------------------------------------------------------- | ------- |
| Contract review | Independent audit, Arc Foundry tests and a resolved findings report                | Blocked |
| Ownership       | Multisig or policy-controlled owner; two-step ownership transfer exercised         | Blocked |
| Operator        | Separate Circle `ARC` wallet, entity controls and least-privilege operating policy | Blocked |
| Deployment      | Reproducible mainnet bytecode, constructor review and explorer verification        | Blocked |
| Data plane      | Separate production database, backups, restore drill and event-indexer replay      | Blocked |
| Operations      | Alerts for stuck jobs, balance drift, paused vault and Circle/RPC failures         | Blocked |
| Product         | Mainnet terms, privacy notice, fee disclosure and support/recovery path            | Blocked |
| Pilot           | One consenting business, low caps and a reviewed first payment                     | Blocked |

The testnet operator, wallet ID, database and vault must never be promoted into production. Production starts with new resources and a separate domain/environment.

## Recommended contract hardening

`contracts/src/ProjectVaultV2.sol` is the mainnet review candidate. It is deliberately separate
from the deployed testnet contract and uses EIP-712 domain version `2`. The candidate makes the
recipient activation delay immutable and prevents owner withdrawals through a project reserve.
Those choices are covered by focused tests, but they still require independent review.
Owner signatures are checked with ERC-1271 for contract owners and ECDSA for EOAs, so a
multisig owner can authorize payments. [`mainnet-launch-plan.md`](mainnet-launch-plan.md)
orders the remaining engineering and external work.

Run `npm run mainnet:artifact` after any contract or dependency change. It writes
`docs/mainnet-candidate.json` with the exact compiler version, settings, source hash, creation-code
hash and runtime-template hash. The template contains immutable placeholders; the final deployed
runtime hash must be recorded and compared by `npm run mainnet:check` after constructor values are
embedded. This manifest improves reproducibility but is not an audit.

Before audit, review these remaining design decisions with the auditor:

1. Use a multisig owner and exercise pause, operator revocation, ownership transfer and recovery in a fork rehearsal.
2. Confirm that a reserve is a hard custody constraint in every production workflow; V2 enforces it for operator payouts and owner withdrawals.
3. Extend invariant and fuzz coverage for `totalAccounted`, unattributed funds, all batch permutations and Arc's blocklist behavior.
4. Compile and replay with Arc Foundry against a mainnet fork. The existing Ganache suite and Paris-target build are engineering evidence, not an Arc Mainnet audit.

## Product workflow before mainnet

The public workspace needs a production mode with these additions:

- A persistent network badge on every transaction screen, with mainnet using a distinct warning treatment.
- A pre-sign summary showing vault, recipients, exact USDC amounts, reserve after payment, operator fee policy and authorization expiry.
- A funding screen that separates ERC-20 project USDC from native gas precision and never displays two USDC balances as different assets.
- Clear pending, final, rejected and recovery states. Arc has deterministic finality; the UI should avoid Ethereum-style confirmation counts.
- Recipient verification, address-book confirmation and a delay before a newly added contractor can be paid.
- An owner-visible pause control, operator-revocation runbook and exportable audit history.

## Release sequence

1. Freeze the audited contract candidate and run the full suite with Arc Foundry.
2. Provision a new production database, API origin, Circle `ARC` operator and multisig owner.
3. Run `npm run mainnet:check`. A nonzero exit means deployment remains blocked.
4. Deploy with a reviewed script that requires chain `5042`, records the transaction before waiting and verifies constructor arguments and runtime bytecode.
5. Start with strict per-project and daily caps. Fund only the gas/operator amount needed for the first pilot.
6. Complete a small owner-signed payment, reconcile it from chain events, then test pause and operator revocation.
7. Publish the verified address, audit report, incident contact and exact product limitations.

The current release intentionally contains no command that deploys to mainnet. Adding that command is the final engineering step after the audit, owner and operator gates are satisfied.
