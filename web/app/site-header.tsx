'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { List, X } from '@phosphor-icons/react';
import './site-header.css';
const navigation = [
  ['Docs', '/docs'],
  ['Launch app', '/start'],
] as const;
export default function SiteHeader({
  demo = false,
  onReset,
}: {
  demo?: boolean;
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
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
  const links = navigation.map(([label, href]) => (
    <Link
      key={href}
      href={href}
      aria-current={pathname === href ? 'page' : undefined}
      onClick={() => setOpen(false)}
    >
      {label}
    </Link>
  ));
  return (
    <header className="splitt-header" ref={root}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Link href="/" className="splitt-wordmark" aria-label="Splitt home">
        <span className="splitt-mark" aria-hidden="true">
          <i />
          <i />
        </span>
        splitt<span>.</span>
      </Link>
      <nav className="splitt-desktop-nav" aria-label="Main navigation">
        {links}
      </nav>
      <div className={demo ? 'splitt-header-actions' : 'splitt-header-actions menu-only'}>
        {demo && (
          <button className="splitt-header-cta" onClick={onReset}>
            Reset demo
          </button>
        )}
        <button
          className="splitt-menu-trigger"
          ref={trigger}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="splitt-mobile-menu"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={22} aria-hidden="true" /> : <List size={22} aria-hidden="true" />}
        </button>
      </div>
      {open && (
        <nav id="splitt-mobile-menu" className="splitt-mobile-menu" aria-label="Mobile navigation">
          {links}
        </nav>
      )}
    </header>
  );
}
