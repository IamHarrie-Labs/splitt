'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ShieldCheck, ArrowDownLeft } from '@phosphor-icons/react';
import { motion, useReducedMotion, useScroll, useSpring } from 'framer-motion';
import { AnimatedValue, PaymentFlow, PaymentScene, TIMING } from './landing-motion';
import ScrollStory, { DotField } from './landing-story';
import SiteFooter from './site-footer';
import './landing.css';

export default function Landing() {
  const [remainder, setRemainder] = useState(false);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useReducedMotion();
  const enabled = !paused && !reducedMotion;
  const [stage, setStage] = useState(0);
  const { scrollYProgress } = useScroll();
  const readingProgress = useSpring(scrollYProgress, { stiffness: 180, damping: 30 });
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enabled) return;
    const timers = [TIMING.card, TIMING.flow, TIMING.branches].map((delay, index) =>
      window.setTimeout(() => setStage((current) => Math.max(current, index + 1)), delay),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [enabled]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !('IntersectionObserver' in window) || !enabled) return;
    root.classList.add('landing-reveals');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
      },
      { threshold: 0.08 },
    );
    root.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      root.classList.remove('landing-reveals');
    };
  }, [enabled]);
  return (
    <div className={`landing ${enabled ? 'motion-enabled' : 'motion-paused'}`} ref={rootRef}>
      {enabled && (
        <motion.div
          className="landing-reading-progress"
          style={{ scaleX: readingProgress }}
          aria-hidden="true"
        />
      )}
      <header className="landing-nav landing-width">
        <Link href="/" className="brand" aria-label="Splitt home">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
          </span>
          splitt<span className="brand-period">.</span>
        </Link>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#controls">Your controls</a>
        </nav>
        <Link href="/demo" className="landing-button small">
          Open demo <ArrowRight size={16} />
        </Link>
      </header>

      <main>
        <section className="landing-hero landing-width">
          <DotField enabled={enabled} />
          <div className="landing-hero-copy landing-enter">
            <p className="landing-kicker">
              <span /> Project payments, with a plan
            </p>
            <h1>
              A partial payment.
              <br />A clear next <em>move.</em>
            </h1>
            <p className="landing-intro">
              Your client paid less than the invoice. Splitt helps you decide who gets paid now,
              what can wait, and how much stays with the project.
            </p>
            <div className="landing-hero-actions">
              <Link href="/demo" className="landing-button">
                Explore the demo <ArrowRight size={18} />
              </Link>
              <a href="#how-it-works" className="landing-text-link">
                See how it works <span>↗</span>
              </a>
            </div>
            <p className="landing-footnote">
              For small agencies and studios. Built for USDC on Arc.
            </p>
          </div>

          <PaymentScene enabled={enabled}>
            <motion.div
              className="landing-example"
              initial={false}
              animate={{ y: enabled && stage < 1 ? 18 : 0 }}
              transition={
                enabled ? { type: 'spring', stiffness: 300, damping: 30 } : { duration: 0 }
              }
              aria-label="Interactive illustrative payment example"
            >
              <div className="example-heading">
                <span>The Northstar project</span>
                <span className="example-label">Illustrative example</span>
              </div>
              <PaymentFlow enabled={enabled} remainder={remainder} stage={stage} />
              <div className="example-arrival">
                <span className="example-arrival-icon">
                  <ArrowDownLeft size={23} />
                </span>
                <div>
                  <span>
                    {remainder ? 'The remaining payment arrives' : 'A client payment arrives'}
                  </span>
                  <strong>
                    <AnimatedValue enabled={enabled}>{remainder ? '800' : '1,200'}</AnimatedValue>{' '}
                    <small>USDC</small>
                  </strong>
                </div>
                <span className="example-invoice">
                  Invoice total
                  <br />
                  <b>2,000 USDC</b>
                </span>
              </div>
              <div className="example-progress" aria-hidden="true">
                <motion.span
                  initial={false}
                  animate={{ scaleX: remainder ? 1 : 0.6 }}
                  transition={
                    enabled ? { type: 'spring', stiffness: 160, damping: 25 } : { duration: 0 }
                  }
                  style={{ transformOrigin: 'left', width: '100%' }}
                />
              </div>
              <p className="example-progress-label">
                {remainder
                  ? 'Invoice fully received. Earlier payments stay accounted for.'
                  : '60% of the invoice received. The project still needs to move.'}
              </p>
              <div className="example-allocation-heading">
                <h2>
                  {remainder ? 'Pay the remaining obligation' : 'A plan for the money you have'}
                </h2>
                <ShieldCheck size={20} />
              </div>
              <div className="example-payee">
                <span className="example-initials">AO</span>
                <div>
                  <strong>Amara Okafor</strong>
                  <span>Brand direction · unlocks delivery</span>
                </div>
                <div className="example-payee-amount">
                  <strong>
                    <AnimatedValue enabled={enabled}>
                      {remainder ? 'Paid' : '700 USDC'}
                    </AnimatedValue>
                  </strong>
                  <span>{remainder ? '700 USDC earlier' : 'Full obligation'}</span>
                </div>
              </div>
              <div className="example-payee">
                <span className="example-initials muted">TA</span>
                <div>
                  <strong>Tobi Adebayo</strong>
                  <span>Development · partial payment agreed</span>
                </div>
                <div className="example-payee-amount">
                  <strong>
                    <AnimatedValue enabled={enabled}>{remainder ? '300' : '200'}</AnimatedValue>{' '}
                    USDC
                  </strong>
                  <span>{remainder ? 'Final balance' : '300 USDC remains'}</span>
                </div>
              </div>
              <div className="example-total">
                <span>Proposed batch</span>
                <strong>
                  <AnimatedValue enabled={enabled}>{remainder ? '300' : '900'}</AnimatedValue> USDC
                </strong>
              </div>
              <div className="example-reserve">
                <ShieldCheck size={18} />
                <span>
                  {remainder
                    ? '800 USDC stays in the project after this batch.'
                    : '300 USDC stays protected as the project reserve.'}
                </span>
              </div>
              <div className="example-switch" role="group" aria-label="Choose a payment stage">
                <button aria-pressed={!remainder} onClick={() => setRemainder(false)}>
                  {!remainder && (
                    <motion.span
                      className="example-switch-active"
                      layoutId="payment-stage"
                      transition={
                        enabled ? { type: 'spring', stiffness: 400, damping: 32 } : { duration: 0 }
                      }
                    />
                  )}
                  <span>First payment</span>
                </button>
                <button aria-pressed={remainder} onClick={() => setRemainder(true)}>
                  {remainder && (
                    <motion.span
                      className="example-switch-active"
                      layoutId="payment-stage"
                      transition={
                        enabled ? { type: 'spring', stiffness: 400, damping: 32 } : { duration: 0 }
                      }
                    />
                  )}
                  <span>When the rest arrives</span> <ArrowRight size={13} />
                </button>
              </div>
            </motion.div>
          </PaymentScene>
        </section>

        <div className="landing-principles landing-width">
          <span>Project funds stay separate.</span>
          <span>The reserve stays protected.</span>
          <span>You approve the plan.</span>
        </div>

        <ScrollStory enabled={enabled} />

        <section className="landing-process landing-width" id="how-it-works" data-reveal>
          <div className="landing-section-heading">
            <p className="landing-kicker">From arrival to allocation</p>
            <h2>
              Less guesswork.
              <br />
              More room to keep working.
            </h2>
            <p>A smaller payment doesn’t change what you owe. It changes what you can do today.</p>
          </div>
          <div className="landing-steps">
            <article className="process-card">
              <div className="process-visual visual-match" aria-hidden="true">
                <i />
                <i />
                <i />
                <span>↙</span>
              </div>
              <span className="step-number">01 / Match</span>
              <h3>
                Put the money with
                <br />
                the right project.
              </h3>
              <p>
                Track the invoice, the incoming payment, and the work it belongs to. Review
                uncertain arrivals before allocating them.
              </p>
            </article>
            <article className="process-card">
              <div className="process-visual visual-split" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </div>
              <span className="step-number">02 / Decide</span>
              <h3>
                Make the tradeoffs
                <br />
                visible.
              </h3>
              <p>
                Splitt proposes an allocation from approved work, due dates, partial-payment terms,
                and your reserve. See the reason behind each amount.
              </p>
            </article>
            <article className="process-card">
              <div className="process-visual visual-review" aria-hidden="true">
                <span>
                  <Check size={24} />
                </span>
                <i />
                <i />
              </div>
              <span className="step-number">03 / Review</span>
              <h3>
                Keep the final
                <br />
                decision yours.
              </h3>
              <p>
                Review the recipients and exact amounts before approval. When more money arrives,
                plan for the unpaid balance instead of paying twice.
              </p>
            </article>
          </div>
        </section>

        <section className="landing-controls" id="controls">
          <div className="landing-width landing-controls-grid" data-reveal>
            <div>
              <p className="landing-kicker">A project is a boundary</p>
              <h2>
                Your commitments.
                <br />
                Your limits.
                <br />
                <em>Your call.</em>
              </h2>
              <p>Allocation should come with an explanation and a set of rules you can trust.</p>
              <Link href="/allocation" className="landing-text-link">
                Try allocation review <ArrowRight size={17} />
              </Link>
            </div>
            <div className="landing-rule-list">
              {[
                [
                  'Separate project balances',
                  'One project’s shortfall should never quietly spend another project’s money.',
                ],
                [
                  'A reserve before payouts',
                  'Set the cash that needs to stay put, alongside per-payment and daily caps.',
                ],
                [
                  'Terms before suggestions',
                  'Only approved work is eligible. Agreed partial-payment and deferral terms shape the plan.',
                ],
                [
                  'An exact owner approval',
                  'Review the batch, not a blanket spending permission. Changes require a fresh review.',
                ],
              ].map(([title, body]) => (
                <article key={title}>
                  <Check size={19} />
                  <div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-faq landing-width" id="questions" data-reveal>
          <div className="landing-section-heading">
            <p className="landing-kicker">Before you open it</p>
            <h2>A few useful details.</h2>
          </div>
          <div>
            <details>
              <summary>
                Who is Splitt for?<span aria-hidden="true">+</span>
              </summary>
              <p>
                Small agencies and studios that coordinate contractors, receive partial client
                payments, and need to keep each project’s obligations and cash separate.
              </p>
            </details>
            <details>
              <summary>
                Does the demo move real money?<span aria-hidden="true">+</span>
              </summary>
              <p>
                No. The public demo uses synthetic balances and browser-only simulations. Live
                Arc Testnet operations are separate and require the configured owner’s authorization.
              </p>
            </details>
            <details>
              <summary>
                Is Splitt live on Arc?<span aria-hidden="true">+</span>
              </summary>
              <p>
                The vault is deployed on Arc Testnet and its source matches the bytecode exactly.
                Circle contract execution and receipt indexing are verified. Contractor payouts
                await activation on 15 October 2026. A real business pilot is still pending.
              </p>
            </details>
            <details>
              <summary>
                Does an agent decide who gets paid?<span aria-hidden="true">+</span>
              </summary>
              <p>
                It proposes a plan. Deterministic rules check eligibility, amounts, reserves, caps
                and agreed terms. The owner reviews the result. Without an AI provider configured,
                the demo uses a labelled deterministic baseline.
              </p>
            </details>
          </div>
        </section>

        <section className="landing-final landing-width" data-reveal>
          <p className="landing-kicker">Start with one project</p>
          <h2>
            See what the next
            <br />
            payment can do.
          </h2>
          <Link href="/demo" className="landing-button">
            Open the sample workspace <ArrowRight size={18} />
          </Link>
          <p>Explore the underpayment, allocation, and remainder flow. No funds move.</p>
        </section>
      </main>
      <button
        className="landing-motion-toggle"
        aria-pressed={paused}
        onClick={() => setPaused((value) => !value)}
        disabled={!!reducedMotion}
      >
        <span className="motion-indicator" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        {reducedMotion ? 'Reduced motion enabled' : paused ? 'Play animation' : 'Pause animation'}
      </button>
      <SiteFooter motion={enabled} />
    </div>
  );
}
