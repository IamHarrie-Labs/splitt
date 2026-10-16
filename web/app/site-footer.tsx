'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Pause, Play } from '@phosphor-icons/react';
import CinematicMedia from './cinematic-media';
import './site-footer.css';
const REPO = process.env.NEXT_PUBLIC_REPO_URL || 'https://github.com/IamHarrie-Labs/splitt';
export default function SiteFooter({
  fit = 'app',
  motion = true,
}: { fit?: 'screen' | 'app'; motion?: boolean } = {}) {
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const still = paused || !motion || !!reduced;
  return (
    <footer className={`site-footer ${fit === 'screen' ? 'sf-full' : 'sf-app'}`}>
      <div className="sf-scene" aria-hidden="true">
        <CinematicMedia paused={still} />
        <div className="sf-scrim" />
      </div>
      <div className="sf-inner">
        <nav aria-label="Footer navigation">
          <Link href="/docs">Documentation</Link>
          <a href={REPO} target="_blank" rel="noopener noreferrer">
            Source code<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </nav>
        <div className="sf-identity">
          <Link href="/" className="sf-name" aria-label="Splitt home">
            splitt.
          </Link>
        </div>
        <div className="sf-bottom">
          <small>© {new Date().getFullYear()} Splitt</small>
          <button
            className="sf-motion"
            aria-pressed={paused}
            disabled={!!reduced || !motion}
            onClick={() => setPaused((value) => !value)}
            aria-label={
              reduced
                ? 'Reduced motion enabled'
                : !motion
                  ? 'Page animations paused'
                  : paused
                    ? 'Play footer background'
                    : 'Pause footer background'
            }
          >
            {still ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
            <span>
              {reduced
                ? 'Reduced motion'
                : !motion
                  ? 'Motion paused'
                  : paused
                    ? 'Play background'
                    : 'Pause background'}
            </span>
          </button>
        </div>
      </div>
    </footer>
  );
}
