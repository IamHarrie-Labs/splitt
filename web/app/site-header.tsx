'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, List, X, ArrowCounterClockwise } from '@phosphor-icons/react';
import './site-header.css';
export default function SiteHeader({
  demo = false,
  onReset,
}: {
  demo?: boolean;
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const query = matchMedia('(min-width: 760px)');
    const resize = () => {
      if (query.matches) setOpen(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', outside);
    query.addEventListener('change', resize);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', outside);
      query.removeEventListener('change', resize);
    };
  }, [open]);
  return (
    <header className="splitt-header" ref={root}>
      <Link href="/" className="splitt-wordmark" aria-label="Splitt home">
        <span className="splitt-mark" aria-hidden="true">
          <i />
          <i />
        </span>
        splitt<span>.</span>
      </Link>
      <nav className="splitt-desktop-nav" aria-label="Main navigation">
        <Link href="/#how-it-works">How it works</Link>
        <Link href="/#controls">Your controls</Link>
        <Link href={demo ? '/testnet' : '/#questions'}>
          {demo ? 'Testnet workspace' : 'Build status'}
        </Link>
      </nav>
      <div className="splitt-header-actions">
        {demo ? (
          <button className="splitt-header-cta" onClick={onReset}>
            <span>Reset demo</span>
            <ArrowCounterClockwise size={18} aria-hidden="true" />
          </button>
        ) : (
          <Link href="/demo" className="splitt-header-cta">
            <span>Open demo</span>
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        )}
        <button
          className="splitt-menu-trigger"
          ref={trigger}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="splitt-mobile-menu"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={22} /> : <List size={22} />}
        </button>
      </div>
      {open && (
        <nav id="splitt-mobile-menu" className="splitt-mobile-menu" aria-label="Mobile navigation">
          {[
            ['How it works', '/#how-it-works'],
            ['Your controls', '/#controls'],
            ['Build status', '/#questions'],
            ['Testnet workspace', '/testnet'],
          ].map(([label, href]) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}>
              {label}
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
