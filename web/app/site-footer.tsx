import Link from 'next/link';
import './site-footer.css';
const REPO = process.env.NEXT_PUBLIC_REPO_URL || 'https://github.com/IamHarrie-Labs/splitt';
export default function SiteFooter(_props: { fit?: 'screen' | 'app'; motion?: boolean } = {}) {
  return (
    <footer className="site-footer">
      <div className="sf-inner">
        <Link href="/" className="sf-name" aria-label="Splitt home">
          splitt.
        </Link>
        <nav aria-label="Footer navigation">
          <Link href="/docs">Documentation</Link>
          <a href={REPO} target="_blank" rel="noopener noreferrer">
            Source code<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </nav>
        <small>© {new Date().getFullYear()} Splitt</small>
      </div>
    </footer>
  );
}
