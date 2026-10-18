'use client';
import Link from 'next/link';
import { useReducedMotion } from 'framer-motion';
import CinematicMedia from './cinematic-media';
import './site-footer.css';
const REPO = process.env.NEXT_PUBLIC_REPO_URL || 'https://github.com/IamHarrie-Labs/splitt';
export default function SiteFooter({
  fit = 'app',
  motion = true,
}: { fit?: 'screen' | 'app'; motion?: boolean } = {}) {
  const reduced = useReducedMotion();
  const still = !motion || !!reduced;
  return (
    <footer className={`site-footer ${fit === 'screen' ? 'sf-full' : 'sf-app'}`}>
      <div className="sf-scene" aria-hidden="true">
        <CinematicMedia paused={still} />
        <div className="sf-scrim" />
      </div>
      <div className="sf-inner">
        <nav aria-label="Footer navigation">
          <Link href="/docs">Documentation</Link>
          <Link href="/demo">Demo</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <a href={REPO} target="_blank" rel="noopener noreferrer">
            Source code<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </nav>
        <div className="sf-identity">
          <Link href="/" className="sf-name" aria-label="Splitt home">
            splitt.
          </Link>
          <p className="sf-about">
            Splitt helps agencies manage client receipts and contractor payments, with a separate
            balance and reserve for each project.
          </p>
        </div>
        <div className="sf-bottom">
          <small>© {new Date().getFullYear()} Splitt</small>
        </div>
      </div>
    </footer>
  );
}
