# Security review — 18 October 2026

Scope: public web app, API, worker, deployment configuration, dependency lockfile and both vault
contracts. This is an internal engineering review, not an independent smart-contract audit.

## Results

| Area | Result | Evidence |
| --- | --- | --- |
| Committed credentials | No private key or provider-token pattern found | repository and tracked-file scan |
| Runtime dependencies | No known advisories | `npm audit --package-lock-only --omit=dev` |
| HTTP input controls | Present | origin allowlist, cookies, CSRF/session checks and route rate limits |
| Authorization | Present | wallet challenges, owner-bound workspaces and EIP-712 batch signatures |
| Replay resistance | Present | nonce/session expiry, plan IDs, execution IDs, project versions and deadlines |
| CI integrity | Present | GitHub actions pinned to commit SHAs with read-only repository permissions |
| Container privilege | Present | API process runs as the unprivileged `node` user |
| Browser/API headers | Added | HSTS, frame denial, MIME sniffing denial and restrictive referrer policy |

OpenZeppelin was upgraded from 5.2.0 to 5.4.0 to remove GHSA-9rcw-c2f9-2j55 while retaining
Arc's Paris EVM target. Ganache's old transitive advisories are confined to the development test
harness and are absent from the production dependency graph.

## Mainnet blockers

- `ProjectVaultV2` has not received an independent audit or formal verification.
- Arc Foundry fork, fuzz and invariant runs are not recorded.
- Production multisig, Circle `ARC` operator, database, backups and monitoring do not exist yet.
- Terms, privacy, fee disclosure, incident contact and the capped business pilot are pending.

The repository intentionally contains no mainnet deployment command. A production deployment must
remain blocked until every gate in `mainnet-readiness.md` is supported by external evidence.
