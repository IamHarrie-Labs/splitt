'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  CurrencyCircleDollar,
  GithubLogo,
  SealCheck,
  ShieldCheck,
  XLogo,
} from '@phosphor-icons/react';
import './site-footer.css';

const VIDEO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260912_105953_21ad8049-9088-4a00-bad3-aee6b5575a2b.mp4';
const FOOTER_POSTER =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260912_105822_bf7c2d53-9957-4521-bbbf-7c1ab7a70130.png';

// Optional public links. Unset values are not rendered, so the footer never shows a dead link.
const PILOT_EMAIL = process.env.NEXT_PUBLIC_PILOT_EMAIL;
const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL;
const X_URL = process.env.NEXT_PUBLIC_X_URL;

const workspaceLinks =
  process.env.NEXT_PUBLIC_DEMO_ONLY === 'true'
    ? ([
        ['Interactive demo', '/demo'],
        ['Testnet connection status', '/testnet'],
      ] as const)
    : ([
        ['Overview', '/workspace'],
        ['Payments', '/payments'],
        ['Allocation', '/allocation'],
        ['Settlement', '/settlement'],
        ['Metrics', '/metrics'],
      ] as const);
const productLinks = [
  ['How it works', '/#how-it-works'],
  ['Your controls', '/#controls'],
  ['Build status', '/#questions'],
  ['Arc Testnet workspace', '/testnet'],
] as const;
const builtOnLinks = [
  ['Arc', 'https://www.arc.io'],
  ['Circle developers', 'https://developers.circle.com'],
  ['Arc docs', 'https://docs.arc.io'],
  ['Tameion hackathon', 'https://tameion.thecanteenapp.com'],
] as const;

const delay = (seconds: number) => ({ '--d': `${seconds}s` }) as CSSProperties;

function Wordmark() {
  return (
    <Link href="/" className="sf-lockup sf-anim" style={delay(0.04)}>
      <svg className="sf-mark" viewBox="12 10 40 46" aria-hidden="true">
        <g transform="rotate(-16 32 32)" fill="currentColor">
          <rect x="18" y="16" width="12" height="33" rx="2" />
          <rect x="34" y="24" width="12" height="25" rx="2" />
        </g>
      </svg>
      <span className="sf-name">
        splitt<span className="sf-period">.</span>
      </span>
    </Link>
  );
}

function ExternalLink({ href, children }: { href: string; children: string }) {
  // Keep the arrow on the same line as the last word when the label wraps.
  const split = children.lastIndexOf(' ');
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children.slice(0, split + 1)}
      <span className="sf-nowrap">
        {children.slice(split + 1)}
        <ArrowUpRight className="sf-ext" size={13} aria-hidden="true" />
      </span>
      <span className="sf-sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function LinkColumn({
  title,
  label,
  stagger,
  links,
  external = false,
}: {
  title: string;
  label: string;
  stagger: number;
  links: readonly (readonly [string, string])[];
  external?: boolean;
}) {
  return (
    <nav className="sf-col" aria-label={label}>
      <h2 className="sf-col-title sf-anim" style={delay(stagger)}>
        {title}
      </h2>
      <ul className="sf-links">
        {links.map(([text, href], index) => (
          <li key={href} className="sf-anim" style={delay(stagger + 0.08 * (index + 1))}>
            {external ? (
              <ExternalLink href={href}>{text}</ExternalLink>
            ) : (
              <Link href={href}>{text}</Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function FooterVideo({ motion }: { motion: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [load, setLoad] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const video = ref.current;
    if (!video || reduced) return;
    // React does not serialise `muted`; set it before play so autoplay policies allow it.
    video.muted = true;
    video.defaultMuted = true;
    if (!('IntersectionObserver' in window)) {
      setLoad(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setLoad(true);
        if (!entry.isIntersecting || !motion) video.pause();
        else void video.play().catch(() => undefined);
      },
      { rootMargin: '480px 0px' },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [motion, reduced]);
  useEffect(() => {
    const video = ref.current;
    if (!video || !load || reduced) return;
    if (motion) void video.play().catch(() => undefined);
    else video.pause();
  }, [load, motion, reduced]);
  if (reduced) return null;
  return (
    <video
      ref={ref}
      className="sf-video"
      muted
      loop
      playsInline
      preload="none"
      poster={FOOTER_POSTER}
      src={load ? VIDEO : undefined}
      data-paused={motion ? undefined : 'true'}
    />
  );
}

/**
 * Site-wide footer using the same pearl-and-glass visual as the landing hero.
 * `fit="screen"` (landing) fills the viewport. `fit="app"` (workspace, testnet) is shorter, so
 * a dashboard does not end in a full screen of footer.
 */
export default function SiteFooter({
  fit = 'screen',
  motion = true,
}: {
  fit?: 'screen' | 'app';
  motion?: boolean;
}) {
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !('IntersectionObserver' in window)) return;
    root.classList.add('sf-armed');
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        root.classList.add('sf-in');
        observer.disconnect();
      },
      { threshold: 0.12 },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const year = new Date().getFullYear();

  return (
    <footer className={`site-footer sf-full${fit === 'app' ? ' sf-app' : ''}`} ref={rootRef}>
      <div className="sf-media" aria-hidden="true">
        <FooterVideo motion={motion} />
      </div>
      <div className="sf-inner">
        <div className="sf-grid">
          <div className="sf-brand">
            <Wordmark />
            <p className="sf-blurb sf-anim" style={delay(0.12)}>
              When a client pays part of an invoice, Splitt proposes who gets paid now, protects
              each project&rsquo;s reserve, and leaves the final call with you.
            </p>
            <ul className="sf-facts">
              <li className="sf-anim" style={delay(0.2)}>
                <ShieldCheck size={19} aria-hidden="true" />
                <span>Every project keeps its own balance</span>
              </li>
              <li className="sf-anim" style={delay(0.28)}>
                <SealCheck size={19} aria-hidden="true" />
                <span>You approve every payout batch</span>
              </li>
              <li className="sf-anim" style={delay(0.36)}>
                <CurrencyCircleDollar size={19} aria-hidden="true" />
                <span>USDC on Arc</span>
              </li>
            </ul>
          </div>
          <LinkColumn title="Workspace" label="Workspace" stagger={0.16} links={workspaceLinks} />
          <LinkColumn title="Product" label="Product" stagger={0.24} links={productLinks} />
          <LinkColumn
            title="Built on"
            label="Built on"
            stagger={0.32}
            links={builtOnLinks}
            external
          />
          <div className="sf-pilot">
            <h2 className="sf-col-title sf-anim" style={delay(0.4)}>
              {PILOT_EMAIL ? 'Run a pilot' : 'Try it'}
            </h2>
            <p className="sf-anim" style={delay(0.48)}>
              {PILOT_EMAIL
                ? 'Bring one real underpayment. We’ll walk it through Splitt with you in 20 minutes. No funds move.'
                : 'Walk through an underpayment, an allocation and the remainder in the sample workspace. No funds move.'}
            </p>
            {PILOT_EMAIL ? (
              <a
                className="sf-cta sf-anim"
                style={delay(0.56)}
                href={`mailto:${PILOT_EMAIL}?subject=${encodeURIComponent('Splitt pilot session')}`}
              >
                <span>Request a pilot session</span>
                <span className="sf-cta-icon" aria-hidden="true">
                  <ArrowRight size={22} />
                </span>
              </a>
            ) : (
              <Link className="sf-cta sf-anim" style={delay(0.56)} href="/demo">
                <span>Open the sample workspace</span>
                <span className="sf-cta-icon" aria-hidden="true">
                  <ArrowRight size={22} />
                </span>
              </Link>
            )}
          </div>
        </div>

        <div className="sf-bottom">
          <div className="sf-status sf-anim" style={delay(0.64)}>
            <span className="sf-status-dot" aria-hidden="true" />
            <span className="sf-status-text">
              {fit === 'app'
                ? 'Sample data unless marked otherwise · fixture payments are not customers'
                : 'Arc Testnet · demo build · no funds move in the sample workspace'}
            </span>
            {(REPO_URL || X_URL) && (
              <span className="sf-socials">
                {REPO_URL && (
                  <a
                    href={REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Splitt on GitHub"
                  >
                    <GithubLogo size={24} aria-hidden="true" />
                  </a>
                )}
                {X_URL && (
                  <a
                    href={X_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Splitt on X"
                  >
                    <XLogo size={24} aria-hidden="true" />
                  </a>
                )}
              </span>
            )}
          </div>
          <nav className="sf-legal" aria-label="Footer details">
            <span className="sf-anim" style={delay(0.7)}>
              © {year} Splitt
            </span>
            <Link className="sf-anim" style={delay(0.78)} href="/#questions">
              Build status
            </Link>
            <a className="sf-anim" style={delay(0.86)} href="#top">
              Back to top
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
