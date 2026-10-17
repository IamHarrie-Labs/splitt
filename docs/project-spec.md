# Splitt: Tameion build specification

Version 3, 3 October 2026. Replaces version 2 of this file.
Status: **approved for implementation.** Core architecture and safety decisions are closed. External integrations remain behind the explicit gates in section 14. No pilot is confirmed.
Implementation progress is tracked in `build-status.md`. The Arc runtime indexes receipts, creates receipt-triggered allocation drafts, supports evidence-checked payment-note suggestions, and queues owner-signed Circle execution. Payout and remainder proof completed on 15 October. A public run on 17 October then recorded a new wallet-owned vault, a 0.8 test-USDC receipt, an automatic Haiku draft and a confirmed 0.3 test-USDC payout. `/pilot` supports participant-owned case review without claiming adoption. Public API hosting is complete; a verified real-business pilot remains pending. See `public-onboarding-proof.json`, `agent-upgrade-release.md` and `testnet-runbook.md`. Fixture signatures use `Splitt Fixture`; the contract domain remains `Splitt`.
Name: **Splitt.** Brand, domain, trademark, and social-handle availability have not been verified. The product can be renamed without changing the architecture.

How to read this file:
- **[V]** = verified against a primary source on 3 Oct 2026.
- **[CHECK]** = must be verified on Day 1 before code depends on it.
- **[DECISION]** = a choice I made so the build can start. Section 22 lists them all so you can overrule any.

---

## 1. Product

### 1.1 Promise
When a client pays only part of a project invoice, decide which approved contractor obligations the project can afford, protect its required reserve, execute eligible USDC payments on Arc, and explain what remains unpaid and why.

### 1.2 Users
- **Owner:** a small development, design, or marketing agency owner. Signs in, approves commitments and policy, approves plans.
- **Contractor:** gets paid. Read-only status link, no login (section 8.6).
- **Client:** pays an invoice. Never logs in.

### 1.3 The one novel claim
Underpayment allocation within a project, with per-project cash isolation. Incoming payment matching, wallets, caps, invoice parsing, replay protection and settlement logs are supporting parts. They are not novelty claims.

### 1.4 What judges score and where it is shown (Tameion rubric [V])
| Criterion (weight) | Where the product earns it | Demo moment |
|---|---|---|
| Agentic sophistication (30%) | Model ranks and justifies payouts from structured facts; validator can reject it; counterfactual evidence changes the ranking | Shortfall decision, then the changed-deadline replay |
| Traction (30%) | Real agency, real client invoice, real contractors; metrics page separating pilot from fixtures | Metrics page |
| Circle tool usage (20%) | Proven: Circle Developer-Controlled Wallet execution, USDC and verified contracts on Arc. CCTP/Bridge and USYC remain gated planned integrations, not shipped claims | Remainder arrival, payout |
| Innovation (20%) | Project ledger inside one vault; evidence-linked decisions; unresolved-settlement handling | Cross-project isolation, replay rejection |

---

## 2. Scope

### 2.1 In the MVP
1. Projects with isolated accounted balances in one vault contract.
2. Owner-approved contractor commitments with partial-payment rules.
3. Inbound payment attribution (explicit deposit, or candidate match plus owner confirmation).
4. Agent allocation plan from structured facts, validated deterministically and authorized with an owner signature.
5. Enforced payouts through a Circle Developer-Controlled Wallet.
6. Settlement confirmation and unresolved-attempt handling.
7. Replan when the remainder arrives.
8. One cross-chain arrival (Base Sepolia to Arc), gated and non-blocking for the core MVP.
9. Review UI (4 screens), metrics page, public repo, deployed link, demo video.

### 2.2 Excluded from the MVP
Borrowing, credit lines, compensation bonds, tax calculation or remittance, confidential payments, contractor marketplace, ERP/accounting integration, automatic outbound messages, multi-currency (EURC), fiat on/off ramps, mobile app, multi-user teams, KYC.

### 2.3 Optional, only if the gate passes
USYC deposit and redemption. Gate in section 14.4. A simulated yield sleeve is not shipped and not counted.

---

## 3. Verified network facts

All from https://docs.arc.io (the old docs.arc.network redirects there) on 3 Oct 2026.

| Item | Testnet [V] | Mainnet [V] |
|---|---|---|
| Chain ID | 5042002 | 5042 |
| RPC | https://rpc.testnet.arc.io | https://rpc.mainnet.arc.io |
| Explorer | https://explorer.testnet.arc.io | https://explorer.arc.io |
| Faucet | https://faucet.circle.com | n/a |
| Native gas token | USDC, **18 decimals** | USDC, 18 decimals |

[CHECK] Some repos reference `rpc.testnet.arc.network` and `testnet.arcscan.app`. Confirm which RPC and explorer are live and use one consistently.

Testnet contracts [V]:

| Contract | Address | Notes |
|---|---|---|
| USDC (ERC-20 interface) | `0x3600000000000000000000000000000000000000` | **6 decimals** |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | 6 decimals, not used |
| USYC | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` | 6 decimals, optional |
| CCTP TokenMessengerV2 | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` | Arc domain 26 |
| CCTP MessageTransmitterV2 | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` | domain 26 |
| GatewayWallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` | domain 26, not planned |
| GatewayMinter | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` | domain 26, not planned |

**Decimal rule [V, from docs]:** the native balance uses 18 decimals and the ERC-20 interface uses 6, and they are the same balance. The vault uses only the ERC-20 interface, in 6-decimal base units, as `uint256`. It never reads `address(this).balance`, never accepts `msg.value`, and never mixes units. The UI and database store 6-decimal integers (`amount_micro`). Floats are forbidden for money anywhere.

Gas is paid in USDC, so the operator wallet needs a small USDC balance for gas. There is no Paymaster in this build.

---

## 4. Architecture

```
Owner browser (Next.js) ──► API (Node/TypeScript, Fastify) ──► Postgres
        │                        │         │
        │ owner txs (wagmi)      │         └─► Anthropic API (planner, extractor)
        ▼                        ▼
   ProjectVault (Solidity, Arc testnet) ◄── Circle Developer-Controlled Wallet (operator)
        ▲                        │
        │                        └─► Indexer/reconciler worker (Arc RPC, event logs)
Client wallet ── deposit() or plain transfer ──┘
Client on Base Sepolia ── CCTP V2 / Circle Bridge ──► mint to vault on Arc
```

### 4.1 Stack [DECISION D1]
| Layer | Choice | Reason |
|---|---|---|
| Contracts | Solidity 0.8.28, Foundry, OpenZeppelin (`SafeERC20`, `ReentrancyGuard`, `Pausable`, `Ownable2Step`, `EIP712`, `ECDSA`) | Fast tests, fuzzing, deploy scripts |
| Backend | Node 22, TypeScript, Fastify, `viem` | Same language as frontend |
| Database | Postgres everywhere (local Docker; Neon or Supabase hosted) | One SQL dialect and one migration path |
| Frontend | Next.js, custom CSS, direct `viem` injected wallet | Owner wallet signing; wagmi may be added for more connectors |
| Signing | Circle Developer-Controlled Wallets, `contractExecution` | Required Circle tool; key not held by the model or app |
| Model | Anthropic API, model selected by `PLANNER_MODEL`, tool use with a JSON schema | The deployed model ID is verified from the account before use; no model ID is hardcoded |
| Worker | Same repo, separate process, polls every 5 s | Reconciliation and event indexing |
| Hosting | API + worker on Render; frontend on Vercel | Free tiers, public review link |

### 4.2 Repository layout
```
/contracts   src/ProjectVault.sol, test/, script/Deploy.s.sol
/server      src/{api,agent,validator,chain,circle,reconcile,db}/
/web         app/{projects,payments,allocation,settlement,metrics}/
/docs        project-spec.md, demo-script.md, eval-report.md
/fixtures    demo-scenario.json, eval cases
README.md, LICENSE (MIT), .env.example
```

### 4.3 Environment variables
`ARC_RPC_URL`, `ARC_CHAIN_ID`, `USDC_ADDRESS`, `VAULT_ADDRESS`, `OWNER_ADDRESS`, `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `CIRCLE_WALLET_ID`, `OPERATOR_ADDRESS`, `ANTHROPIC_API_KEY`, `PLANNER_MODEL`, `DATABASE_URL`, `SPLITT_STORAGE`. Secrets live only in the host's secret store and local `.env`. Never committed. `.env.example` has placeholders only. Wallet authentication uses opaque server-side sessions, so no shared owner password or session signing secret is needed.

---

## 5. Smart contract: `ProjectVault`

One vault holds the aggregate USDC. It keeps separate accounted balances per project.

### 5.1 Roles
- **owner:** the agency. Creates projects, sets reserves and limits, adds and cancels commitments, attributes unclaimed funds, withdraws, pauses, sets operator.
- **operator:** the Circle wallet address. Can call only `payBatch`. Cannot withdraw, change policy, add commitments, or touch another project.

### 5.2 State
```solidity
struct Project {
    uint256 balance;        // accounted USDC, 6 decimals
    uint256 reserveMin;     // protected from the operator path
    uint256 maxPerPayment;  // cap per item in payBatch()
    uint256 maxPerDay;      // cap per UTC day
    uint64  version;        // bumps on any policy or commitment change
    bool    active;
}
struct Commitment {
    bytes32 projectId;
    address payee;
    uint256 maxAmount;      // authorized total
    uint256 paid;           // cumulative
    uint64  activeAfter;    // timestamp; payee-change delay
    uint64  version;
    bool    partialAllowed;
    bool    cancelled;
}
mapping(bytes32 => Project) projects;
mapping(bytes32 => Commitment) commitments;
mapping(bytes32 => bool) executed;                       // executionId replay guard
mapping(bytes32 => bool) executedPlan;                   // planId replay guard
mapping(bytes32 => bool) usedAttribution;                // attributionId replay guard
mapping(bytes32 => mapping(uint256 => uint256)) spentOnDay; // projectId => day => amount
uint256 totalAccounted;                                  // sum of project balances
uint64 payeeChangeDelay;                                 // seconds, owner-set (demo: 0, pilot: 86400)
```
Unattributed funds = `USDC.balanceOf(this) - totalAccounted`. No event parsing is needed to know they exist.

### 5.3 Functions
| Function | Caller | Behaviour |
|---|---|---|
| `createProject(id, reserveMin, maxPerPayment, maxPerDay)` | owner | New active project |
| `setPolicy(id, reserveMin, maxPerPayment, maxPerDay)` | owner | Updates limits, `version++`, emits `PolicyChanged` |
| `addCommitment(cid, pid, payee, maxAmount, partialAllowed)` | owner | `activeAfter = now + payeeChangeDelay`; `version++` on project |
| `cancelCommitment(cid)` | owner | Sets `cancelled`; project `version++` |
| `deposit(pid, invoiceId, amount)` | anyone | `transferFrom` payer; `balance += amount`; emits `PaymentReceived(pid, invoiceId, payer, amount)` |
| `attribute(attributionId, pid, invoiceId, amount, evidenceHash)` | owner | Rejects a used ID, marks it used, and moves `amount` from unattributed to the project. Reverts if `amount` exceeds unattributed. Emits `PaymentAttributed` |
| `payBatch(planId, planHash, projectId, projectVersion, deadline, ownerSignature, items[])` | operator | Verifies the owner-approved plan, validates every item, then transfers the batch atomically |
| `ownerWithdraw(pid, amount, to)` | owner | Debits project balance, emits `OwnerWithdrawal` |
| `setOperator(addr)`, `pause()`, `unpause()` | owner | Revoke or restore agent authority |

### 5.4 `payBatch` authorization and checks
The owner signs EIP-712 typed data containing `chainId`, vault address, `planId`, `planHash`, `projectId`, `projectVersion`, `deadline`, and `itemsHash`. `itemsHash` is the keccak256 hash of the ABI-encoded ordered array of `(executionId, commitmentId, amount)`. The signature is valid only for this chain and deployed vault. `planId` and every execution ID are single-use. The operator cannot alter an item without invalidating the signature.

Checks, in order, with named custom errors:
1. Not paused; caller is operator; signature recovers the current owner; `block.timestamp <= deadline`.
2. Batch is non-empty; `planId` is unused; it contains no duplicate commitment or execution ID; every `executionId` is unused.
3. Project is active and its version equals `projectVersion` (stale plans fail).
4. Every commitment belongs to `projectId`, exists, is not cancelled, and is active.
5. Every amount is positive; cumulative paid does not exceed the commitment maximum. A non-partial commitment receives its full remaining amount.
6. Every amount is within `maxPerPayment`; the whole batch plus prior UTC-day spending is within `maxPerDay`.
7. The batch total is at most the project balance minus its reserve.

All effects are recorded before transfers: the plan ID and execution IDs become used, commitment paid totals increase, the project balance and `totalAccounted` decrease, and daily spending increases. The contract then transfers each item with `SafeERC20`. Any failed transfer reverts the entire batch and all preceding effects and transfers. Emit one `PayoutExecuted` per item and `PlanExecuted(planId, planHash, projectId, totalAmount)`. The function is `nonReentrant`.

`ownerWithdraw` deliberately may spend below the reserve because the reserve limits delegated operator authority, not the owner. The UI must state this before signing. A payee correction is cancel-and-recreate; commitments are never edited in place. The contract is non-upgradeable for the hackathon.

### 5.5 Required invariants (fuzzed, section 16)
- I1: `sum(project.balance) == totalAccounted <= USDC.balanceOf(vault)`.
- I2: for every commitment, `paid <= maxAmount`.
- I3: after any operator call, `project.balance >= project.reserveMin` (given it was at start).
- I4: a `planId`, an `executionId`, and an `attributionId` each succeed at most once.
- I5: no operator call changes any other project's balance.
- I6: the operator can never send USDC to an address other than a commitment's payee.
- I7: a batch either settles every item or settles none.

Because Solidity cannot iterate an arbitrary mapping, invariant tests maintain a test-only registry of created project IDs and sum their balances to prove I1. Production safety relies on every accounting mutation updating `totalAccounted` in the same transaction.

### 5.6 Known limits, disclosed
USDC can blocklist addresses, so a payee transfer can revert; the plan fails cleanly and escalates. The owner key can withdraw anything, which is intended and logged. The contract is unaudited and testnet-only.

---

## 6. Inbound payments and attribution

A memo or amount alone is not proof of which project a payment belongs to. Two routes:

### 6.1 Route A: explicit deposit (auto-attributed)
The client (or the owner on their behalf) calls `deposit(projectId, invoiceId, amount)` after approving USDC. The contract credits the named project immediately. Invoice metadata is untrusted: the app marks invoice matching `confirmed` only when the payer equals the registered client wallet. A different payer needs owner confirmation of the invoice association. That confirmation never calls `attribute()` or credits the balance again. Until reviewed, the app excludes the candidate amount from planner spendable cash; the owner's exact signed batch remains the on-chain authorization boundary.

### 6.2 Route B: plain transfer or cross-chain mint (candidate then owner confirms)
Funds sent directly to the vault, or minted there by CCTP, are unattributed. The worker creates an `inbound_payment` row and scores candidates:
- registered client wallet equals sender, and exactly one open invoice has outstanding >= amount: `candidate` (single match)
- more than one open invoice, or unknown sender: `ambiguous`
Either way **the owner confirms in the UI**, which calls `attribute()` with `attributionId = keccak256(sourceChainId, txHash, logIndex)`. The contract rejects a reused attribution ID. Nothing is allocated to contractors until attribution is confirmed. The model is not involved in attribution decisions; it may only draft an explanation.

A CCTP mint does not prove the original payer because the Arc-side sender can be Circle infrastructure. The app therefore records the source-chain burn transaction and invoice payment intent before the burn. Matching a CCTP receipt requires that intent or manual owner confirmation; it never relies on the Arc mint sender.

### 6.3 Edge cases
| Case | Behaviour |
|---|---|
| Overpayment | Excess above invoice outstanding stays in the project balance, flagged `overpaid`. The agent never spends it on contractors beyond their commitments. Owner decides: refund via `ownerWithdraw` or credit. |
| Two payments for one invoice | Each is its own row; cumulative received tracked against the invoice |
| Wrong project | Owner rejects the candidate; funds stay unattributed |
| Unknown sender | `ambiguous`, owner must confirm or leave unattributed |
| Dust (< 0.01 USDC) | Ignored by the worker, shown in a collapsed list |

---

## 7. Domain data model (Postgres)

All money columns are `bigint` micro-USDC. All chain identifiers are lowercase hex.

| Table | Key columns |
|---|---|
| `owners` | id, email (optional), wallet_address (unique), created_at |
| `projects` | id, owner_id, name, client_name, client_wallet, onchain_id (bytes32), reserve_micro, max_per_payment_micro, max_per_day_micro, approval_mode (`manual`\|`auto_under`), auto_threshold_micro, status, policy_version, created_at |
| `invoices` | id, project_id, reference, total_micro, received_micro, due_date, status (`open`\|`partial`\|`paid`\|`void`) |
| `commitments` | id, project_id, onchain_id, payee_name, payee_address, max_micro, paid_micro, due_date, defer_until (latest allowed deferral date), partial_allowed, work_status (`pending`\|`accepted`), blocks_next_delivery (bool), depends_on (commitment id, nullable), accepted_at, status (`draft`\|`active`\|`cancelled`\|`complete`), terms_excerpt, source_document_id, share_token |
| `inbound_payments` | id, project_id (nullable until confirmed), invoice_id (nullable), tx_hash, log_index, chain (`arc`\|`base-sepolia`), payer, amount_micro, route (`deposit`\|`transfer`\|`cctp`), attribution (`confirmed`\|`candidate`\|`ambiguous`\|`rejected`), confirmed_by, evidence_hash, is_fixture (bool) |
| `plans` | id, project_id, trigger_payment_id, policy_version, facts_json, facts_hash, plan_hash, model, approval_deadline, owner_signature, status (`proposed`\|`validated`\|`rejected`\|`awaiting_owner`\|`approved`\|`executing`\|`done`\|`stale`\|`failed`), model_output_json, validator_report_json, fallback_used (bool) |
| `plan_items` | id, plan_id, commitment_id, action (`pay`\|`defer`), amount_micro, reason_codes[], fact_refs[], explanation, execution_id (unique), exec_status (`queued`\|`submitted`\|`confirmed`\|`failed`\|`unresolved`), tx_hash, circle_tx_id |
| `escalations` | id, project_id, kind, detail_json, status (`open`\|`resolved`), resolution |
| `documents` | id, project_id, kind, filename, text, uploaded_at |
| `drafts` | id, project_id, plan_id, audience (`client`\|`contractor`), body, status (`draft`) |
| `ledger` | id, ts, project_id, event, payload_json, prev_hash, hash (hash-chained append-only log) |

Constraints: `commitments.paid_micro <= max_micro`; `plan_items.execution_id` unique; `inbound_payments (tx_hash, log_index)` unique; one `executing` plan per project at a time (partial unique index).

---

## 8. Workflow in full

### 8.1 Setup (owner)
1. Create project: client name, client wallet, invoice reference and total, due date.
2. Add commitments, manually or via extraction (8.2). Payee addresses are typed or pasted by the owner and checksummed. **A model-extracted address is never accepted.**
3. Set reserve, per-payment cap, daily cap, approval mode.
4. Owner signs on-chain: `createProject`, `addCommitment` for each, `setPolicy`. UI shows each transaction link.
5. Owner sets the operator and funds the operator wallet with a little USDC for gas.
Spending authority starts only after step 4.

Setup validation rejects zero addresses, zero or duplicate IDs, a reserve or cap configuration that makes an active non-partial commitment impossible to pay, and `maxPerDay < maxPerPayment`. If a later policy change makes a commitment temporarily unpayable, the UI blocks plan approval and shows the exact conflicting limits.

### 8.2 Commitment intake from messy sources
Input: pasted text (WhatsApp message, email, agreement clause) or an uploaded PDF converted to text. The model returns draft fields: payee name, amount, due date, partial-payment wording, dependency, acceptance condition, and the quoted source excerpt for each. Every field shows its excerpt; missing fields are blank, not guessed. The owner edits and confirms each commitment. Ambiguous wording about partial payment defaults to `partial_allowed = false`. Extraction is a convenience; confirmed fields are the only source of truth.

### 8.3 Payment arrival
Worker sees a transfer or `PaymentReceived`, creates the `inbound_payment`, scores attribution (section 6), and raises an escalation if it needs the owner. After confirmation the project's `received_micro` and `balance` update.

### 8.4 Allocation (the agent)
Trigger: a confirmed inbound payment, or an owner clicking Replan.
1. **Facts builder (deterministic).** Reads chain balance, reserve, per-commitment remaining, due dates, accepted status, dependencies, defer limits, days waiting, plus daily cap headroom. Produces `facts_json` with stable IDs (`F1..Fn`) and `facts_hash`. Canonicalization and hashes follow section 9.3.1.
2. **Eligibility filter (deterministic).** Excludes commitments that are cancelled, not yet `activeAfter`, not `accepted`, or fully paid. These can never appear in a plan.
3. **Baseline planner (deterministic).** Scores eligible commitments (section 9.2) and fills spendable cash by score. Stored for comparison and used as fallback only.
4. **Model planner.** Receives `facts_json` and the baseline. Must call `submit_plan` (section 9.3). It may deviate from the baseline but must cite fact IDs and explain the deviation.
5. **Validator (section 9.4).** Accepts or rejects. On rejection the model gets the report once to correct; a second failure creates an escalation and falls back to the baseline plan marked `fallback_used = true`. Fallback plans always need owner approval.
6. **Approval.** In the MVP, the owner signs every validated plan as EIP-712 typed data. `auto_under` remains in the schema for a later contract-level delegated allowance and is disabled in the UI until that mechanism exists. A database approval alone never authorizes payment.
7. **Execution (8.5).**
8. **Drafts.** Model drafts a client and a contractor message for review. Never sent by the system.

`spendable = project.balance - reserveMin - in_flight_amounts`.

### 8.5 Execution and settlement
1. For each `pay` item: `executionId = keccak256(abi.encode(projectId, commitmentId, planId, itemIndex))`. Deterministic, so a retry reuses the same ID.
2. The owner reviews the exact batch and signs its EIP-712 authorization. The backend verifies the signature locally before storing it.
3. Backend calls Circle `contractExecution` on `payBatch(...)` once for the whole plan.
4. Poll Circle for state, then confirm on Arc by receipt, every `PayoutExecuted` log, and `PlanExecuted`.
5. States: `submitted`, `confirmed`, `failed`, `unresolved`.
6. **Unresolved rule.** If the call times out, the webhook never arrives, or Circle and the chain disagree, every item in the batch is `unresolved`. The reconciler reads all `executed(executionId)` values. All true: mark the batch confirmed and record the transaction. All false and Circle reports failed or dropped: mark failed. A mixed result violates the atomicity invariant and creates a critical escalation. While unresolved, no new plan is submitted for the project and no new execution ID is minted for its items. A confirmed on-chain failure may be retried with a fresh plan ID and owner signature.
7. Cumulative `paid_micro` is updated only from confirmed on-chain events, never from the model or the API call result.

### 8.6 Replan on remainder
When the next payment is attributed, Replan runs on fresh facts. Already confirmed payouts are subtracted; they are never re-proposed. The plan's `policy_version` must equal the current one; otherwise it is marked `stale` and rebuilt.

### 8.7 Contractor status link
`/s/<share_token>`: read-only page for one commitment (agreed amount, paid so far, remaining, status, tx links). No login. Token is random 128-bit. Optional; cut first if time is short.

### 8.8 Owner actions outside the agent
Revoke operator, pause vault, withdraw project funds (including below reserve after an explicit UI warning), change reserve, cancel commitment, refund overpayment. All are owner-signed on-chain, appear in the ledger, and are visible on the settlement timeline.

---

## 9. Agent specification

### 9.1 What the model may and may not do
May: rank eligible payments, propose full, partial, or deferred amounts where the commitment allows, explain trade-offs from cited facts, flag contradictions, draft messages.
May not: invent reserve rules, override agreed terms, change payees or addresses, add commitments, borrow, move money across projects, mark work accepted, confirm attribution, or run any transaction. It has no key and no network access to the chain.

### 9.2 Baseline scoring (deterministic, used for comparison and fallback)
For each eligible commitment `c`:
```
score = 40 * blocksNextDelivery
      + 30 * overdue(c)                    // due_date < today
      + 15 * min(daysWaiting / 14, 1)
      + 10 * (remaining == fits in spendable)
      +  5 * dueSoon(c)                    // due within 7 days
```
Fill in descending score. Where a commitment has `partial_allowed = false` it receives full remaining or nothing. Where partial is allowed, the remainder of spendable goes to it. Ties break by earlier due date, then smaller remaining. Weights are a documented heuristic, not a claim about optimality.

### 9.3 `submit_plan` tool schema
```json
{
  "items": [{
    "commitment_id": "string",
    "action": "pay | defer",
    "amount_micro": "base-10 integer string (\"0\" when defer)",
    "reason_codes": ["BLOCKS_DELIVERY | OVERDUE | LONG_WAIT | PARTIAL_PERMITTED | WITHIN_DEFER_TERMS | RESERVE_PROTECTED | CASH_INSUFFICIENT | DEVIATES_FROM_BASELINE"],
    "fact_refs": ["F3", "F7"],
    "explanation": "string, max 400 chars, must reference the cited facts"
  }],
  "unfunded_shortfall_micro": "base-10 integer string",
  "escalations": [{"kind": "string", "detail": "string"}],
  "confidence": "low | medium | high"
}
```
Prompt rules: use only provided facts; never output an address; if facts conflict, escalate; do not exceed `spendable`.

### 9.3.1 Canonicalization and hashing
All API monetary values are canonical base-10 integer strings with no sign, whitespace, decimal point, exponent, or leading zero except `"0"`; TypeScript parses them to `bigint`, and Postgres stores them as `bigint`. Floats and JavaScript `number` money values are forbidden. Before hashing, JSON uses RFC 8785 JSON Canonicalization Scheme encoded as UTF-8. `facts_hash = keccak256(canonicalFactsJson)` and `plan_hash = keccak256(canonicalValidatedPlanJson)`. The validated plan excludes display-only prose changes after validation. Solidity hashes the execution items with `keccak256(abi.encode(items))`; the EIP-712 message binds that `itemsHash` to `plan_hash`. Shared test vectors in `/fixtures/hash-vectors.json` must produce identical results in TypeScript and Solidity.

### 9.4 Validator (all must pass; any failure rejects the whole plan)
- V1 Every `commitment_id` is in the eligible set.
- V2 `sum(pay amounts) <= spendable` and each payout `<= remaining`.
- V3 `defer` items have amount 0 and `defer_until >= today`.
- V4 For `partial_allowed = false`, `pay` amount equals remaining.
- V5 Each `pay` leaves `balance - amount >= reserve`.
- V6 Each payout `<= maxPerPayment`; total today within `maxPerDay`.
- V7 Every `fact_ref` exists in `facts_json`.
- V8 No item references another project's data.
- V9 Reason codes belong to the allowed list; `DEVIATES_FROM_BASELINE` is required if the item differs from the baseline.
- V10 `facts_hash` matches current facts; project `policy_version` is current.
- V11 No `pay` for a commitment with an `unresolved` execution.
- V12 If any hard obligation cannot be met, `unfunded_shortfall_micro` is reported and an escalation exists. The validator rejects a plan that hides a shortfall.
- V13 A non-partial payment must be possible under the current per-payment and daily caps; otherwise the plan is rejected with a policy-conflict escalation.
- V14 The canonical `plan_hash`, ordered item hash, signature deadline, and owner signature all verify before execution is queued.
The contract re-checks the cap, reserve, partial, cumulative, replay, and version rules, so validator failure does not make the system unsafe.

### 9.5 Shortfall behaviour
If obligations cannot all be met, the product reports the shortfall and escalates. It does not silently shrink or rewrite agreements.

### 9.6 Honest framing
The model's job is to weigh competing facts and explain; the safety is deterministic. Without model access the baseline plan runs, marked as fallback, so the demo and tests never depend on the model being up. The demo shows at least one case where the model's plan differs from the baseline with a cited reason, otherwise it reads as automation.

---

## 10. Cross-chain arrival (the Circle tool-usage item)

[DECISION D2] Use CCTP V2 (Circle Bridge/App Kit if it supports Base Sepolia to Arc testnet, otherwise direct CCTP). Mint recipient is the vault. The funds arrive unattributed and go through route B (6.2). Gateway is not planned; it is not claimed.

Facts: Arc is CCTP domain 26 [V]. Base Sepolia is domain 6 [CHECK].
Known pitfalls to confirm on Day 1 [CHECK], taken from another team's README, not from Circle docs: Arc finality threshold `2000`, V2 seven-parameter `depositForBurn` only, attestation can stay `pending` until finality.
Requirements: a Base Sepolia wallet with test USDC (Circle faucet) and a little Base Sepolia ETH; a worker step that polls Circle's attestation service and calls `receiveMessage` on Arc if the route is not forwarded by Circle.
A client cannot be swept from an arbitrary wallet. The client (or the owner on their behalf) initiates the burn.
Fallback if this fails by 6 Oct: the remainder arrives via route A on Arc, and the README states cross-chain was not completed.

---

## 11. UI: four screens plus metrics

1. **Project overview:** received, reserve, spendable, commitments (paid / remaining), invoice outstanding, operator status, pause button.
2. **Payment arrival:** transfer evidence, route, candidate invoice, attribution status, Confirm / Reject. Unresolved or ambiguous items at top.
3. **Allocation review:** proposed pay and defer items, cited facts, validator results (pass or named failure), baseline vs model diff, shortfall, Approve and Execute.
4. **Settlement timeline:** each payout with state, tx link, unresolved attempts, cumulative paid, outstanding. Owner actions appear here too.
5. **Metrics (public):** see section 17. Counts split into pilot, fault-injection, and fixtures.

Empty, loading, and error states are required for each screen. Money is displayed with six-decimal precision trimmed, from integers.

---

## 12. API (wallet-authenticated owner session required unless noted)

Current fixture routes use `POST /auth/challenge`, `GET /auth/session`, `POST /auth/logout`, `GET /workspace`, `POST /plans/:id/prepare` and `POST /plans/:id/approve`. Simulation remains fixture-only. Owner protection is optional for file fixtures and required for Postgres; database reset is disabled. The self-serve live API adds wallet-owned vault registration, public activity metrics, receipt synchronization and Circle execution. Document extraction and external accounting synchronization remain pending. See `build-status.md` for implemented behavior.

`POST /auth/challenge`, `POST /auth/verify`, `POST /projects`, `GET /projects/:id`, `POST /projects/:id/commitments`, `POST /extract` (text to draft commitments), `POST /projects/:id/sync` (read chain), `GET /payments?project=`, `POST /payments/:id/confirm|reject`, `POST /projects/:id/replan`, `GET /plans/:id`, `POST /plans/:id/authorize`, `GET /executions/:id`, `POST /executions/:id/reconcile`, `GET /ledger?project=`, `GET /s/:token` (public), `GET /metrics` (public), `GET /health` (public). All inputs are schema-validated; money fields use the canonical integer-string format in section 9.3.1. Mutating endpoints require origin and CSRF checks in addition to the authenticated owner session.

---

## 13. Security and abuse

- Owner login uses a one-time EIP-4361 challenge bound to domain, URI, chain ID, nonce and a five-minute expiry. Fixture authentication verifies the configured EOA owner; live mode must also check the current on-chain owner. Sessions use random opaque tokens stored as hashes, expire after eight hours and are revocable. Cookies are HttpOnly, SameSite=Strict, scoped to `/api`, and Secure on HTTPS; loopback HTTP uses a non-Secure development cookie. Sessions are origin-bound. Nonces are single-use; authentication and mutations are rate-limited and mutations require a separate CSRF token. Postgres stores sessions durably; file fixtures use in-memory sessions.
- Operator key is held by Circle. App holds only the API key and entity secret in the host secret store.
- The vault enforces limits and verifies the owner's signed plan. A compromised app cannot change payees, amounts, project, version, or deadline after authorization, exceed caps, or reach the reserve through the operator path.
- Model prompt includes untrusted text (contracts, messages). Extracted text is data; extraction cannot change policy or addresses; validator ignores any instruction in text.
- No private keys, API keys, or the entity secret appear in the repo, logs, or the model prompt.
- Public pages (`/metrics`, `/s/:token`) expose no addresses beyond what the owner publishes and no contract amounts for non-pilot data without consent.

---

## 14. Integrations and gates

| Item | Use | Required? | Gate |
|---|---|---|---|
| Arc testnet USDC | settlement | yes | n/a |
| Circle Developer-Controlled Wallets | operator signing | yes | API key and entity secret created Day 1 |
| Deployed contract on Arc | vault | yes | deploy + verify Day 2 |
| CCTP / Bridge | one cross-chain arrival | target | works by 6 Oct, else fallback in section 10 |
| USYC | reserve yield | **optional** | 14.4 |
| Gateway | none | no | not claimed |
| Paymaster | none | no | gas is USDC |

### 14.1 Build gates
- **Gate A, core build:** Arc RPC responds; the documented USDC address supports `balanceOf`, `approve`, and `transferFrom`; native and ERC-20 decimal behavior is reproduced with a small test transfer.
- **Gate B, required payout path:** Circle DCW can create or identify the operator wallet and submit a simple contract execution on Arc. If unavailable by the end of 5 Oct, use a server-side testnet signer, disclose it prominently, and continue building; the submission cannot claim DCW usage.
- **Gate C, cross-chain:** Base Sepolia to Arc CCTP completes end to end by 6 Oct. Otherwise use an Arc deposit and label CCTP incomplete.
- **Gate D, model:** the configured Anthropic model is listed for the account and passes one structured-tool call. Otherwise use another available structured-output model through the same adapter; the deterministic baseline remains functional without it.

Only Gate A blocks contract work. Gates B through D are adapter-level and must not block the contract, database, validator, or interface.

### 14.4 USYC gate
USYC is permissioned. Another team reports an allowlist and a high mainnet minimum [CHECK; not from Circle docs]. Ask Circle for testnet allowlisting for the vault and operator on 3 Oct. If access works by 6 Oct EOD, deposit a project's idle reserve and show one real redemption. If not, drop it and say nothing about yield.

---

## 15. Demo scenario (labelled fixture until a pilot supplies real numbers)

Project: invoice 2,000 USDC, protected reserve 300. Commitments:
- **A:** 700, accepted, due now, blocks next delivery, partial not allowed.
- **B:** 500, accepted, due in 10 days, partial allowed, deferral allowed within terms.
- Second project **P2** funded with 1,000 USDC.

Arithmetic: client pays 1,200. `spendable = 1,200 - 300 = 900`.
The facts favour A (blocks delivery, due now). A gets 700. The remaining 200 may go to B as a partial payment or B may be deferred within terms. The implementation does not hardcode either; the facts and model decide, and the validator confirms legality.
After A=700 and B=200: balance 300 = reserve. Then 800 arrives from Base Sepolia. Balance 1,100, spendable 800, B remaining 300 is paid. Left: 800 balance, 300 reserve, 500 is the agency's margin above reserve.
Counterfactual run: change A's `blocks_next_delivery` to false and B's `due_date` to overdue. Ranking changes, with different cited facts.

Do not hardcode the ranking in code or in the prompt. Fixtures live in `/fixtures/demo-scenario.json`.

---

## 16. Test plan

### 16.1 Contract (Foundry)
Unit: every revert in 5.4 with its custom error; deposit, attribute, withdraw, pause; operator cannot withdraw or change policy; `activeAfter` delay blocks early pay.
Fuzz and invariant tests for I1 to I7, including cross-project isolation, partial sequences summing to `maxAmount`, replayed execution and attribution IDs, signature mutation and expiry, and atomic rollback when any transfer fails.
Gate: all pass before deploy.

### 16.2 Agent evaluation (`/docs/eval-report.md`)
Eight fixed cases, run against the model and baseline, recorded with pass or fail:
| Case | Expectation |
|---|---|
| E1 base demo | A paid in full; B partial or deferred; validator passes |
| E2 changed dependency/deadline | Ranking changes and cites different facts |
| E3 partial not permitted | Never pays B a partial amount |
| E4 reserve would be breached | Amount reduced or escalated |
| E5 unaccepted work | Never paid |
| E6 shortfall bigger than cash | Shortfall reported and escalated |
| E7 injected instruction in a contract text | Ignored; validator unaffected |
| E8 model returns an invalid plan | Rejected; retry once; then fallback with owner approval |
Report model-vs-baseline differences honestly, including cases where the model is worse.

### 16.3 Fault injection (real runs on Arc testnet)
Replay the same executionId (reverts). Kill the confirmation callback mid-payment (one payment only, status `unresolved` then `confirmed`). Operator revoked mid-plan (stops, escalates). Stale plan after a policy change (rejected). Attempt payment from project P2's funds (reverts). Unknown sender deposit (stays unattributed).

### 16.4 End to end
One scripted run of the demo scenario on testnet, from invoice creation to remainder payout, repeated twice from clean state.

### 16.5 Definition of done for the MVP
All of 16.1 pass; E1 to E8 recorded; all six fault injections in 16.3 shown; one scripted run completes twice; repo public and runs from README in under 15 minutes; deployed review link works; video recorded.

---

## 17. Pilot and traction

### 17.1 Target
One operating agency or freelancer business, one real client project, two genuine contractor commitments. The user's own business qualifies if it has that workflow. A second project provides the isolation case.

### 17.2 Intake form (what to collect on 3 Oct)
Business name and type; project description; client invoice number, amount, due date, currency; contractor names, amounts, due dates, partial-payment terms, dependencies; how contractors are paid today; whether the client can pay in USDC (testnet acceptable); who the owner is and consent to publish metrics.

### 17.3 Pilot terms stated up front
Testnet funds only; mainnet only if the pilot asks and funds it. If the client will not pay on testnet, the pilot mirrors the real payment on testnet and labels it "mirrored". The product shows the pilot's real obligations and amounts.

### 17.4 Metrics page
Counts from the database, never typed by hand, each with a label:
`pilot_real`, `pilot_mirrored`, `fault_injection`, `fixture`. Shows: businesses onboarded, projects, commitments, USDC received, USDC paid out, plans proposed, plans approved, owner overrides, unresolved settlements recovered, deferrals, repeat usage (plans per project). Fixtures never count as traction. No inference of users from wallet counts.

### 17.5 If no pilot appears by 5 Oct
Run the product on the builder's own real workflow if one exists; otherwise submit with fixtures only and state in the README and video that no pilot users were reached. Do not present fixture payments as customers.

---

## 18. Demo video (under 3:00, `docs/demo-script.md`)

| Time | Show |
|---|---|
| 0:00 to 0:15 | The problem: a client pays 1,200 of 2,000; two contractors, Friday |
| 0:15 to 0:35 | Project overview: reserve, commitments, spendable 900 |
| 0:35 to 1:10 | Allocation review: model ranking with cited facts, baseline comparison, validator pass; approve |
| 1:10 to 1:30 | Payout confirmed on the explorer; settlement timeline |
| 1:30 to 1:55 | Safety: replay rejected; P2 funds unreachable; validator rejects a bad plan |
| 1:55 to 2:20 | Remainder arrives from Base Sepolia; owner confirms attribution; replan pays B |
| 2:20 to 2:40 | Killed callback ends as one confirmed payout |
| 2:40 to 3:00 | Metrics page (pilot vs fixture), Circle tools used, repo link |
Record twice; keep the changed-deadline counterfactual in the cut if time allows.

---

## 19. Schedule

| Date | Deliverable | Exit check |
|---|---|---|
| Sat 3 Oct | Pilot outreach sent; intake form; Circle API key, entity secret, wallet; USYC allowlist request; confirm RPC and explorer; confirm CCTP route | Pilot contacted; wallet created; RPC working |
| Sun 4 Oct | `ProjectVault` and Foundry tests (16.1 unit); DB schema; deploy to Arc testnet | Contract deployed and verified |
| Mon 5 Oct | API, facts builder, baseline planner, validator, Circle execution, worker; pilot decision (17.5) | Plan executes end to end with baseline |
| Tue 6 Oct | Model planner and extractor; four screens; CCTP arrival; USYC go/no-go | Demo scenario runs on testnet |
| Wed 7 Oct | Eval E1 to E8; fault injections; fuzz and invariants | 16.5 items passing |
| Thu 8 Oct | Pilot data on the product; metrics page; deploy review link | Live link works |
| Fri 9 Oct | Bug fixes; README; record and cut video | Video under 3:00 |
| Sat 10 Oct | Submit by evening; deadline 11:59 PM ET (4:59 AM Lagos on 18 Oct) | Submission confirmed |

Cut order if behind: contractor status links, drafts, USYC, cross-chain (use fallback), extraction (manual entry).

---

## 20. Risks and fallbacks

| Risk | Impact | Fallback |
|---|---|---|
| No pilot by 5 Oct | Traction score low | 17.5 |
| Circle DCW setup delays | Cannot sign | viem signer on a funded testnet key, disclosed |
| CCTP fails on Arc testnet | Weak Circle score | Route A deposit; README says so |
| USYC no access | No yield | Drop it |
| Model slow or down | Demo risk | Baseline planner with `fallback_used` label; pre-recorded model outputs are not presented as live |
| Faucet limits | Cannot fund | Multiple faucet requests early; keep demo amounts small (the demo uses scaled fixtures, e.g. 12/20/3/7/5 USDC) |
| A competitor ships partial-payment allocation | Differentiation shrinks | Lead with per-project isolation, validator, and unresolved-settlement handling; no "first" claims |
| Unaudited contract | Reviewer concern | Disclosed, testnet only, caps enforced |

Demo amounts: real testnet USDC from the faucet is limited, so the video may use scaled amounts with the same ratios. The README states the scale.

---

## 21. Submission checklist

- [ ] Public GitHub repo, MIT license, no secrets in history
- [ ] README: what it is, how to run in under 15 minutes, architecture diagram, contract addresses, Circle tools used (and which were not), limits and disclosures, traction table with labels
- [ ] Deployed review link
- [ ] Demo video under 3:00 (Loom, YouTube or Vimeo)
- [ ] `docs/eval-report.md` with E1 to E8 results
- [ ] Metrics page live
- [ ] Contract verified on the explorer
- [ ] Submission made before 11:59 PM ET, 10 Oct (multiple submissions allowed)

---

## 22. Decisions made for you (change any)

| # | Decision | Alternative |
|---|---|---|
| D1 | Stack: Foundry, Fastify, Postgres, Next.js, Anthropic API, Render and Vercel | Hardhat, other host |
| D2 | Cross-chain via CCTP V2 (or Circle Bridge), not Gateway | Gateway unified balance |
| D3 | Reserve is a fixed USDC amount per project, owner-set | Percent of receipts |
| D4 | Every MVP plan requires an EIP-712 owner signature; `auto_under` is disabled until a contract-level delegated allowance exists | Fully autonomous |
| D5 | Attribution always owner-confirmed except exact deposit from the registered payer | Fully automatic |
| D6 | Owner admin transactions signed by the owner's browser wallet | Operated for the pilot by the builder, disclosed as such |
| D7 | Contractor links are optional and cut first | Required |
| D8 | Demo may use scaled amounts, labelled | Full amounts |
| D9 | Product name is Splitt; availability checks remain | Rename before submission if unavailable |
| D10 | One owner-authorized `payBatch` settles a plan atomically | Sequential item transactions |
| D11 | CCTP attribution IDs use destination chain, mint transaction and USDC log index, enforced on-chain; source burn and Circle nonce are independently unique (16 Oct implementation) | Source-only IDs; database-only replay protection |
| D12 | JSON uses RFC 8785 and keccak256; execution arrays use Solidity ABI encoding | Implementation-specific serialization |
| D13 | Direct viem wallet connection, owner login and exact fixture signing are implemented; live chain validation remains a gate | wagmi connector layer when more wallet types are needed |
| D14 | Opaque hashed sessions with revocation/CSRF; fixture signatures use a non-executable domain | Self-contained signed cookies with revocation machinery |

## 23. Operational inputs still needed (do not block scaffolding)

1. Who is the pilot, or is it your own business? Can they or their client pay in USDC?
2. Do you have a Circle developer account and an Anthropic API key, or should I plan around creating them today?
3. Does the owner use a browser wallet (MetaMask, Rabby), or should the pilot owner be operated for them (D6)?
4. Which wallet address will own the deployed vault?
5. Who is on the team and who owns which part (contracts, backend, frontend, outreach, video)? Until assigned, the builder owns all implementation tracks.

---

## 24. Competitive position

Research suggests a narrow opening relative to Vestiarion, SettleKit, Syncly, Syn DAO, and Veris. Competitor details come from their public READMEs and showcases as of 3 Oct 2026. They are not audited, and private submissions and later changes are unknown. In that research Vestiarion's repo has live USYC, CCTP and receivables features, and none of the repos searched handled partial-payment allocation across a project's contractors. The pitch is project isolation plus evidence-based decisions under partial funding. Do not claim to be the first, the only product, or a guaranteed winner.

Broad scan: `../research/arc-opportunity-report.html`. This spec supersedes its five-option shortlist.

Hackathon requirements: https://tameion.thecanteenapp.com/ (deadline 17 Oct 11:59 PM ET; public repo; video under 3 minutes; real businesses and USDC flowing weighted heavily).

