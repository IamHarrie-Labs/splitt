import SiteFooter from '../site-footer';
import SiteHeader from '../site-header';
import '../legal.css';

export const metadata = { title: 'Testnet terms · Splitt' };

export default function Terms() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="legal-main">
        <header>
          <h1>Testnet terms</h1>
          <p>Terms for the public Splitt preview.</p>
          <p className="legal-meta">Effective 18 October 2026</p>
        </header>
        <h2>Testnet service</h2>
        <p>
          Splitt is currently an experimental Arc Testnet application. Use only testnet tokens. They
          have no monetary value. Splitt is not offered for production payments, custody,
          investment, lending, tax, accounting or legal advice.
        </p>
        <h2>Your wallet and transactions</h2>
        <p>
          You control your wallet and review each authorization. Check the network, vault, recipient
          addresses and amounts before signing. Blockchain transactions may be irreversible, and you
          are responsible for wallet security and the information you enter.
        </p>
        <h2>Preview limits</h2>
        <p>
          Access may be rate-limited, paused or withdrawn. Sponsored execution is capped and may be
          unavailable. The software is provided for evaluation without a promise of uninterrupted or
          error-free operation.
        </p>
        <h2>Business information</h2>
        <p>
          Do not enter confidential personal data, private keys or recovery phrases. Obtain consent
          before using another person’s name, wallet address or project information.
        </p>
        <h2>Support</h2>
        <p>
          Report a reproducible, non-sensitive problem through the{' '}
          <a href="https://github.com/IamHarrie-Labs/splitt/issues">public GitHub repository</a>.
          Report security issues privately through{' '}
          <a href="https://github.com/IamHarrie-Labs/splitt/security/advisories/new">
            GitHub Security Advisories
          </a>
          . These preview terms must be replaced with reviewed production terms before a mainnet
          service launches.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
