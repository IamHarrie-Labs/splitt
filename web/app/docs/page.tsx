import Link from 'next/link';
import SiteHeader from '../site-header';
import SiteFooter from '../site-footer';
import './docs.css';
export const metadata = {
  title: 'Documentation | Splitt',
  description: 'How Splitt allocates project payments, protects reserves and records settlement.',
};
export default function Documentation() {
  return (
    <div id="top" className="documentation">
      <SiteHeader />
      <main id="main-content" className="documentation-main">
        <header>
          <h1>Documentation</h1>
          <p>How project payments, approvals and settlement work in Splitt.</p>
        </header>
        <div className="documentation-layout">
          <nav aria-label="Documentation sections">
            <a href="#workflow">Payment workflow</a>
            <a href="#limits">Balances and limits</a>
            <a href="#approval">Owner approval</a>
            <a href="#demo">Using the demo</a>
            <a href="#automation">Receipt automation</a>
            <a href="#payment-notes">Payment notes</a>
            <a href="#funding">Cross-chain funding</a>
            <a href="#evidence">Verification evidence</a>
            <a href="#pilot">Business pilot</a>
            <a href="#testnet">Testnet and status</a>
            <a href="#selfserve">Your own vault</a>
          </nav>
          <div className="documentation-content">
            <section id="workflow">
              <h2>Payment workflow</h2>
              <p>
                Record a client invoice and the contractor work approved for that project. When a
                payment arrives, match it to the invoice before generating an allocation.
              </p>
              <p>
                The planner considers cash received, accepted work, payment terms and spending
                limits. Review the proposed recipients and amounts before approving a batch.
              </p>
              <p>
                When another client payment arrives, generate a new plan. Earlier contractor
                payments are deducted from the amount still owed.
              </p>
            </section>
            <section id="limits">
              <h2>Balances and limits</h2>
              <p>
                Each project has a separate accounted balance in ProjectVault. An allocation cannot
                use funds assigned to another project.
              </p>
              <p>
                The available amount is the lower of cash above the reserve and the remaining daily
                limit. A per-payment limit also applies. Partial payments are proposed only when the
                contractor’s agreed terms permit them.
              </p>
              <p>
                The reserve limits delegated spending. The owner retains withdrawal authority,
                including the ability to withdraw below the reserve.
              </p>
            </section>
            <section id="approval">
              <h2>Owner approval</h2>
              <p>
                Deterministic validation checks eligibility, amounts, agreed terms, references and
                current state. The public demo uses the baseline planner. Optional model proposals
                must pass the same validation; invalid responses fall back to the baseline.
              </p>
              <p>
                Live execution requires the owner’s signature for the exact batch. It binds
                recipients, amounts, project version, chain, vault and expiry. The operator cannot
                use that signature to authorize a different batch.
              </p>
              <p>
                A pending or uncertain settlement blocks further allocations for that project until
                its outcome is reconciled. Reusing an execution identifier is rejected.
              </p>
            </section>
            <section id="demo">
              <h2>Using the demo</h2>
              <p>
                The <Link href="/demo">public demo</Link> needs no wallet and does not move funds.
              </p>
              <ol>
                <li>The 1,200 USDC receipt already has a draft ready for review.</li>
                <li>Review 700 for Amara and 200 for Tobi, leaving the 300 reserve.</li>
                <li>Run the approved batch in the demo.</li>
                <li>
                  Add the 800 USDC still owed by the client. A new draft appears automatically.
                </li>
                <li>Review Tobi’s remaining 300 and run the final demo batch.</li>
              </ol>
              <p>
                The project ends with 800 USDC. Fieldwork’s separate 1,000 balance is unchanged.
                Reset demo restores the starting state.
              </p>
            </section>
            <section id="automation">
              <h2>Receipt automation</h2>
              <p>
                The testnet worker watches indexed project receipts and queues allocation drafts
                automatically. It reads current chain state, validates the proposal and adds an
                in-app review notification. The owner workspace refreshes receipt activity every ten
                seconds while signed in.
              </p>
              <p>
                Durable receipt IDs and worker leases prevent duplicate work. Interrupted drafts can
                resume after a restart. Pending settlement blocks new plans; repeated drafting
                failures are escalated for review. Unattributed token transfers do not trigger an
                allocation.
              </p>
              <p>
                Automation stops at the draft. It cannot sign or submit a payment. The new draft
                worker has automated concurrency, restart and stale-state tests; its hosted
                end-to-end run remains pending the API deployment.
              </p>
            </section>
            <section id="payment-notes">
              <h2>Read a payment note</h2>
              <p>
                In the authenticated testnet workspace, select an indexed receipt and enter the
                client’s payment note. A configured model extracts the invoice reference, paid
                amount and any statement about a remainder. Extracted values must quote the original
                note and agree with the recorded invoice, payer and receipt amount. Ambiguous or
                conflicting matches stay for owner review.
              </p>
              <p>
                A note cannot create a receipt, change a reserve, select a replacement wallet or
                attribute funds. Remainder statements are unverified client statements, not
                confirmed income or promised payment dates. The model receives the note and invoice
                references; omit personal or confidential material.
              </p>
              <p>
                The note reader has a separate model setting and a literal evidence fallback. In ten
                synthetic evaluation cases, the tested model-plus-fallback path was fully correct in
                nine, compared with seven for the literal matcher. Four cases used model output.
                These results do not establish accuracy on customer data.
              </p>
            </section>
            <section id="pilot">
              <h2>Run a business pilot</h2>
              <p>
                The <Link href="/pilot">project review page</Link> accepts a business’s own
                anonymized invoice, receipt, reserve and approved contractor obligations. It uses
                the deterministic planner locally. Nothing is uploaded or retained in browser
                storage.
              </p>
              <p>
                Ask a consenting participant to compare the proposal with their own decision, record
                what they would change, then export the session and feedback. Quotes require
                separate permission. An export contains participant-reported facts and no payment
                volume; review and verify the evidence before making an adoption claim.
              </p>
              <p>
                A useful pilot includes a second session on a real project. Keep business planning
                sessions, testnet token movements and real customer payments separate. No business
                has been verified as onboarded yet.
              </p>
            </section>
            <section id="funding">
              <h2>Cross-chain invoice funding</h2>
              <p>
                The owner workspace includes a Base Sepolia to Arc Testnet funding flow using Circle
                CCTP. An invoice intent records the payer, vault, amount and fee limit before a burn
                is signed. Circle’s attestation and the actual Arc mint receipt are checked before
                the owner attributes the net USDC to the invoice.
              </p>
              <p>
                A direct mint does not automatically credit a project. Attribution is a separate
                owner transaction; the receipt worker then detects the attributed funds and prepares
                a draft. Existing transaction hashes can recover interrupted steps without another
                burn.
              </p>
              <p>
                The route’s contracts have been checked on both testnets. A completed cross-chain
                transfer has not yet been proven. The public preview does not provide an anonymous
                payment service. Paymaster, Gateway and reserve yield are outside this release.
              </p>
            </section>
            <section id="evidence">
              <h2>Verification evidence</h2>
              <p>
                Confirmed testnet payouts and missing-response recovery are documented in the{' '}
                <a href="https://github.com/IamHarrie-Labs/splitt/blob/master/docs/testnet-payout-proof.json">
                  transaction report
                </a>
                . The{' '}
                <a href="https://github.com/IamHarrie-Labs/splitt/actions">automated checks</a>{' '}
                cover allocation constraints, owner authorization, worker recovery and cross-chain
                funding verification.
              </p>
              <p>
                The{' '}
                <a href="https://github.com/IamHarrie-Labs/splitt/blob/master/docs/payment-note-evaluation-live.json">
                  payment-note experiment
                </a>{' '}
                uses ten synthetic examples. Model output was used in four; the combined model and
                fallback path corrected two cases missed by literal matching. Allocation model
                testing has not established a benefit over the deterministic planner.
              </p>
              <p>
                A later{' '}
                <a href="https://github.com/IamHarrie-Labs/splitt/blob/master/docs/anthropic-evaluation.md">
                  Claude Haiku 5.5 regression check
                </a>{' '}
                scored ten of ten twice after an amount-parser fix, with five accepted model
                responses and five safety fallbacks per run. These are the same small development
                cases, not a production accuracy estimate. A separate allocation check fell back
                after both model proposals failed validation.
              </p>
              <p>
                An{' '}
                <a href="https://github.com/IamHarrie-Labs/splitt/blob/master/docs/anthropic-hosted-note-proof.json">
                  authenticated VPS check
                </a>{' '}
                also used Haiku to match a synthetic note to an existing testnet receipt. Balances
                and payout jobs stayed unchanged. This verifies hosted note analysis; public API
                access still awaits HTTPS.
              </p>
              <p>
                In the owner workspace, each proposal exposes its triggering receipts, model or
                fallback, baseline comparison and recorded facts. A pilot intake or test wallet
                transfer does not establish business adoption.
              </p>
              <p>
                The{' '}
                <a href="https://github.com/IamHarrie-Labs/splitt/blob/master/docs/selfserve-testnet-proof.json">
                  two-wallet testnet report
                </a>{' '}
                records three confirmed payouts, automatic drafts, expired-signature recovery and
                private workspace isolation. These controlled tests used the deterministic fallback;
                they are API and chain evidence, rather than a browser recording or business pilot.
              </p>
            </section>
            <section id="selfserve">
              <h2>Your own vault</h2>
              <p>
                <Link href="/start">The self-serve workspace</Link> connects MetaMask or Rabby to
                Arc Testnet. Your wallet deploys and owns its vault. Create one project with up to
                two contractors, wait three minutes for recipient activation, then deposit test
                USDC. The worker drafts from the payment receipt; you review and sign before Circle
                executes.
              </p>
              <p>
                The preview supports invoices up to 10 USDC and batches up to 5 USDC. Your wallet
                pays setup and deposit fees; sponsored payouts have wallet and service limits. The
                API runs on a VPS, with public HTTPS awaiting the supplied domain. Until connected,
                the workspace shows its availability status. The allocation demo remains available.
              </p>
              <p>
                Each wallet has a private workspace. Builder-controlled tests and unverified public
                testnet activity are reported separately; neither counts as a verified business
                pilot.
              </p>
            </section>
            <section id="testnet">
              <h2>Testnet and status</h2>
              <p>
                Splitt is a testnet application. ProjectVault is deployed on Arc Testnet, with
                independently verified source code. Circle wallet execution and PostgreSQL-backed
                receipt indexing are implemented separately from the public demo.
              </p>
              <p>
                On 15 October 2026 the demo scenario ran on Arc Testnet at 1/1000 scale:
                owner-signed batches executed by a Circle developer-controlled wallet paid{' '}
                <a href="https://explorer.testnet.arc.io/tx/0x938ea7d6370c06d25daf6c73493e5c43f304abf9938563b7bd934325edaebdc5">
                  0.7 and 0.2 USDC
                </a>
                , recorded the{' '}
                <a href="https://explorer.testnet.arc.io/tx/0xde2ce4f47108ab118ef30b7dd835b7da7dae60ed7b83504ead5011acddd35c6d">
                  0.8 USDC remainder
                </a>{' '}
                and paid the{' '}
                <a href="https://explorer.testnet.arc.io/tx/0x098fa70efda77e5f22396521bce7d5ccdeb3bbbaab8997e9ae8551a0ceb32881">
                  final 0.3 USDC
                </a>
                . The project kept 0.8 USDC and the separate project’s balance was unchanged. A
                deliberately lost provider response resumed as the same job without a duplicate
                payment. Recipients were test wallets.
              </p>
              <p>
                The authenticated API and worker are not publicly hosted yet. The{' '}
                <Link href="/testnet">testnet workspace</Link> shows connection status and requires
                the configured owner wallet when enabled. It is not a mainnet payment service.
              </p>
              <p>
                Allocation model evaluations do not establish an improvement over the baseline. No
                real business pilot or customer payment volume is claimed.
              </p>
              <p>
                Review the <a href="https://github.com/IamHarrie-Labs/splitt">source repository</a>{' '}
                for implementation details and evidence, and the{' '}
                <a href="https://repo.sourcify.dev/5042002/0x724c12bea7fab30e27a9b3f4d5581351ebc2c6c6">
                  verified contract source
                </a>{' '}
                for the deployed vault. The contract is not independently security-audited.
              </p>
            </section>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
