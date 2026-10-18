import SiteFooter from '../site-footer';
import SiteHeader from '../site-header';
import '../legal.css';

export const metadata = { title: 'Privacy · Splitt' };

export default function Privacy() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="legal-main">
        <header>
          <h1>Privacy</h1>
          <p>What the Splitt testnet preview processes.</p>
          <p className="legal-meta">Effective 18 October 2026</p>
        </header>
        <h2>Information processed</h2>
        <p>
          The live preview processes public wallet addresses, wallet-signed login messages, project
          details you submit, testnet transaction records and technical request data needed to
          secure and operate the service. The pilot calculator runs in your browser and exports only
          when you choose to download a file.
        </p>
        <h2>Why it is used</h2>
        <p>
          Data is used to authenticate wallet owners, isolate vault workspaces, prepare allocations,
          execute authorized testnet batches, reconcile transactions, prevent abuse and diagnose
          failures. Splitt does not sell testnet workspace data.
        </p>
        <h2>AI processing</h2>
        <p>
          A configured server-side model may read payment-note text to suggest a matching receipt.
          Deterministic validation and fallback remain in control. Do not submit secrets or
          sensitive personal information in payment notes.
        </p>
        <h2>Public blockchain data</h2>
        <p>
          Wallet addresses and Arc transactions are public and may remain available independently of
          Splitt. Removing application records does not remove blockchain history.
        </p>
        <h2>Security and retention</h2>
        <p>
          Sessions use secure cookies and signed challenges. During the public testnet preview,
          workspace and operational records are retained for the life of the preview so transactions
          can be reconciled and abuse investigated; there is currently no automatic deletion
          schedule. Public blockchain records are permanent. A fixed production retention and
          deletion policy requires legal review before mainnet launch.
        </p>
        <h2>Questions and security reports</h2>
        <p>
          Report a sensitive security issue privately through{' '}
          <a href="https://github.com/IamHarrie-Labs/splitt/security/advisories/new">
            GitHub Security Advisories
          </a>
          . Use the public repository only for non-sensitive product or documentation issues. Never
          include a private key, recovery phrase or confidential business data.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
