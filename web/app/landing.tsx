'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Pause,
  Play,
  ShieldCheck,
  Fingerprint,
  ArrowsSplit,
  LockKey,
} from '@phosphor-icons/react';
import { motion, useReducedMotion } from 'framer-motion';
import { baselinePlan, buildFacts, formatUSDC } from '@splitt/core';
import { fixtureProjects } from '../../server/src/fixtures';
import SiteHeader from './site-header';
import SiteFooter from './site-footer';
import CinematicMedia from './cinematic-media';
import './landing.css';
const controls = [
  {
    icon: ArrowsSplit,
    title: 'A boundary for every project',
    text: 'One project’s shortfall cannot spend another project’s accounted balance.',
  },
  {
    icon: ShieldCheck,
    title: 'Your reserve, before payouts',
    text: 'Protected cash, per-payment limits and daily caps shape every proposed batch.',
  },
  {
    icon: Check,
    title: 'Agreed terms come first',
    text: 'Only approved work is eligible. Partial payments and deferrals follow the terms you confirmed.',
  },
  {
    icon: LockKey,
    title: 'An exact owner approval',
    text: 'Authorization binds the recipients, amounts and expiry. A changed plan needs a fresh review.',
  },
];
/* Entrance storyboard: shell and CTA are immediately usable.
   80ms headline rises; 180ms copy settles; 300ms scene annotation enters.
   Scroll reveals run once. Reduced motion and pause show the resting frame. */
export default function Landing() {
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const still = paused || !!reduced;
  const [remainder, setRemainder] = useState(false);
  const example = useMemo(() => {
    const project = fixtureProjects()[0];
    if (remainder) {
      project.received = '2000000000';
      project.balance = '1100000000';
      project.commitments[0].paid = '700000000';
      project.commitments[1].paid = '200000000';
    }
    const plan = baselinePlan(buildFacts(project, new Date('2026-10-03T12:00:00Z')));
    const total = plan.items.reduce((sum, item) => sum + BigInt(item.amount_micro), 0n);
    return { project, plan, total, retained: BigInt(project.balance) - total };
  }, [remainder]);
  const reveal = {
    initial: still ? (false as const) : { y: 16 },
    whileInView: { y: 0 },
    transition: { duration: still ? 0 : 0.4 },
    viewport: { once: true, amount: 0.15 },
  };
  return (
    <div className={`landing${still ? ' landing-still' : ''}`} id="top">
      <section className="splitt-hero" aria-labelledby="hero-heading">
        <div className="splitt-hero-stage">
          <CinematicMedia paused={still} />
          <div className="splitt-hero-scrim" />
        </div>
        <SiteHeader />
        <div className="splitt-hero-content page-width">
          <div className="splitt-hero-copy">
            <p className="hero-eyebrow">Project payments, with a plan</p>
            <h1 id="hero-heading">
              <span>Every payment.</span>
              <span>
                A clearer <em>next move.</em>
              </span>
            </h1>
            <p className="hero-description">
              Pay approved work. Protect your reserve. Know what comes next, even when your client
              pays in parts.
            </p>
            <div className="hero-actions">
              <Link href="/demo" className="splitt-primary-link">
                Explore the demo
                <span>
                  <ArrowUpRight size={21} aria-hidden="true" />
                </span>
              </Link>
              <a href="#how-it-works" className="splitt-text-link">
                See how it works
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            </div>
          </div>
          <div className="hero-scene-note">
            <span className="scene-note-symbol">
              <ArrowsSplit size={25} aria-hidden="true" />
            </span>
            <div>
              <strong>One receipt. A considered split.</strong>
              <p>
                Approved obligations.
                <br />A reserve that stays yours.
              </p>
            </div>
          </div>
          <div className="hero-bottom">
            <p>
              Built for agencies.
              <br />
              <span>Settled in USDC on Arc.</span>
            </p>
            <a href="#controls" className="hero-owner-note">
              <Fingerprint size={28} aria-hidden="true" />
              <span>
                Your money.
                <br />
                <strong>Your final approval.</strong>
              </span>
              <ArrowUpRight size={19} aria-hidden="true" />
            </a>
            <button
              className="hero-motion"
              aria-pressed={paused}
              disabled={!!reduced}
              onClick={() => setPaused((value) => !value)}
              aria-label={
                reduced ? 'Reduced motion enabled' : paused ? 'Play animation' : 'Pause animation'
              }
            >
              {still ? <Play size={15} /> : <Pause size={15} />}
              <span>{reduced ? 'Reduced motion' : paused ? 'Play motion' : 'Pause motion'}</span>
            </button>
          </div>
        </div>
      </section>
      <main className="landing-body">
        <section
          className="payment-story page-width"
          id="how-it-works"
          aria-labelledby="story-heading"
        >
          <motion.div {...reveal} className="story-intro">
            <p className="section-caption">A familiar situation</p>
            <h2 id="story-heading">
              The invoice says one thing.
              <br />
              Your balance says <em>another.</em>
            </h2>
            <p>
              The work is approved. The client has paid part of the invoice. Make a plan for the
              money you actually have.
            </p>
          </motion.div>
          <div
            className="story-stage-picker"
            role="group"
            aria-label="Choose an illustrative payment stage"
          >
            <button aria-pressed={!remainder} onClick={() => setRemainder(false)}>
              <span>01</span> First payment
            </button>
            <ArrowRight size={19} aria-hidden="true" />
            <button aria-pressed={remainder} onClick={() => setRemainder(true)}>
              <span>02</span> The remainder arrives
            </button>
          </div>
          <div className="payment-ledger" aria-label="Illustrative Northstar payment allocation">
            <div className="ledger-title">
              <div>
                <span>Northstar Studio</span>
                <h3>Brand launch</h3>
              </div>
              <p>Illustrative example · USDC</p>
            </div>
            <dl className="ledger-summary">
              <div>
                <dt>Invoice total</dt>
                <dd>2,000</dd>
              </div>
              <div>
                <dt>Received to date</dt>
                <dd>{formatUSDC(example.project.received)}</dd>
              </div>
              <div>
                <dt>Proposed this time</dt>
                <dd key={String(remainder)} className="ledger-figure">
                  {formatUSDC(String(example.total))}
                </dd>
              </div>
              <div>
                <dt>Left after this batch</dt>
                <dd>{formatUSDC(String(example.retained))}</dd>
              </div>
            </dl>
            <div className="ledger-columns" aria-hidden="true">
              <span>Approved work</span>
              <span>Payment terms</span>
              <span>This batch</span>
            </div>
            {example.project.commitments.map((commitment) => {
              const payment = example.plan.items.find(
                (item) => item.commitment_id === commitment.id,
              );
              return (
                <div className="ledger-row" key={commitment.id}>
                  <div>
                    <strong>{commitment.name}</strong>
                    <p>{commitment.blocksDelivery ? 'Brand direction' : 'Development'}</p>
                  </div>
                  <p>
                    {commitment.blocksDelivery
                      ? remainder
                        ? '700 USDC already paid'
                        : 'Full payment unlocks delivery'
                      : 'Partial payment agreed'}
                  </p>
                  <strong className="ledger-amount">
                    {payment?.action === 'pay' ? formatUSDC(payment.amount_micro) : 'Paid'}
                    <small>{payment?.action === 'pay' ? 'USDC' : 'earlier'}</small>
                  </strong>
                </div>
              );
            })}
            <div className="ledger-bottom">
              <p>
                <ShieldCheck size={20} aria-hidden="true" />
                300 USDC reserve protected in both stages.
              </p>
              <span>
                {remainder
                  ? 'Earlier payouts stay accounted for.'
                  : 'The unpaid balance stays visible.'}
              </span>
            </div>
          </div>
          <p className="story-disclosure">
            Try both stages. This example and the public demo use synthetic data. No funds move.
          </p>
        </section>
        <section className="workflow page-width" aria-labelledby="workflow-heading">
          <div className="workflow-title">
            <h2 id="workflow-heading">
              From money received
              <br />
              to work <em>moving.</em>
            </h2>
            <Link href="/demo" className="splitt-text-link">
              Try the complete flow
              <ArrowUpRight size={19} aria-hidden="true" />
            </Link>
          </div>
          <div className="workflow-rows">
            {[
              [
                'Match the receipt.',
                'Keep the invoice, the payment and the project together. Review uncertain arrivals before allocating them.',
              ],
              [
                'Make the tradeoffs visible.',
                'See which approved obligations fit the available cash, agreed terms and protected reserve.',
              ],
              [
                'Review. Then authorize.',
                'Check the exact recipients and amounts. When the remainder arrives, pay only what is still owed.',
              ],
            ].map(([title, text], index) => (
              <motion.article {...reveal} key={title}>
                <span className="workflow-number">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
                <ArrowUpRight size={24} aria-hidden="true" />
              </motion.article>
            ))}
          </div>
        </section>
        <section
          className="owner-controls page-width"
          id="controls"
          aria-labelledby="controls-heading"
        >
          <div className="control-manifesto">
            <span className="control-seal">
              <Fingerprint size={58} weight="thin" aria-hidden="true" />
            </span>
            <h2 id="controls-heading">
              A suggestion.
              <br />
              Never a blank <em>cheque.</em>
            </h2>
            <p>Splitt prepares the plan. You keep the authority.</p>
          </div>
          <div className="control-lines">
            {controls.map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <Icon size={23} weight="light" aria-hidden="true" />
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section
          className="landing-questions page-width"
          id="questions"
          aria-labelledby="questions-heading"
        >
          <h2 id="questions-heading">A few useful details.</h2>
          <div>
            {[
              [
                'Who is Splitt for?',
                'Small agencies and studios that coordinate contractors, receive partial client payments and need to keep each project’s obligations and cash separate.',
              ],
              [
                'Does the demo move money?',
                'No. The public demo uses synthetic balances and browser-only settlement. It runs the deterministic allocation engine and does not require a wallet or live AI model.',
              ],
              [
                'What is live on Arc?',
                'ProjectVault is deployed on Arc Testnet with independently verified source code. The owner workspace is separate from the public demo. Testnet evidence and current limitations are recorded in the public repository; no real business adoption is claimed.',
              ],
              [
                'Can an agent pay without my approval?',
                'No. A proposed allocation must pass deterministic validation. Live payouts require the owner’s signature for the exact batch. Model errors fall back to the labelled baseline.',
              ],
            ].map(([title, text]) => (
              <details key={title}>
                <summary>
                  {title}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{text}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="landing-closing page-width">
          <p>Start with one project.</p>
          <h2>
            A little less guesswork.
            <br />A lot more <em>clarity.</em>
          </h2>
          <Link href="/demo" className="splitt-primary-link">
            Open the sample workspace
            <span>
              <ArrowUpRight size={21} aria-hidden="true" />
            </span>
          </Link>
        </section>
      </main>
      <SiteFooter fit="app" motion={!still} />
    </div>
  );
}
