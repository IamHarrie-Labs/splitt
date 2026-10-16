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
            <a href="#testnet">Testnet and status</a>
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
                <li>Generate an allocation for the 1,200 USDC received.</li>
                <li>Review 700 for Amara and 200 for Tobi, leaving the 300 reserve.</li>
                <li>Run the approved batch in the demo.</li>
                <li>Add the 800 USDC still owed by the client, then generate a new allocation.</li>
                <li>Review Tobi’s remaining 300 and run the final demo batch.</li>
              </ol>
              <p>
                The project ends with 800 USDC. Fieldwork’s separate 1,000 balance is unchanged.
                Reset demo restores the starting state.
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
                The authenticated API and worker are not publicly hosted yet. The{' '}
                <Link href="/testnet">testnet workspace</Link> shows connection status and requires
                the configured owner wallet when enabled. It is not a mainnet payment service.
              </p>
              <p>
                Current model evaluations do not establish an improvement over the baseline. No real
                business pilot or customer payment volume is claimed.
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
