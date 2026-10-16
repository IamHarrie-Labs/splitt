'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Pause, Play } from '@phosphor-icons/react';
import { useReducedMotion } from 'framer-motion';
import { baselinePlan, buildFacts, formatUSDC } from '@splitt/core';
import { fixtureProjects } from '../../server/src/fixtures';
import SiteHeader from './site-header';
import SiteFooter from './site-footer';
import CinematicMedia from './cinematic-media';
import './landing.css';

export default function Landing() {
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const still = paused || !!reduced;
  const project = fixtureProjects()[0];
  const plan = baselinePlan(buildFacts(project, new Date('2026-10-03T12:00:00Z')));
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
            <h1 id="hero-heading">
              Project payments,
              <br />
              <em>under control.</em>
            </h1>
            <p className="hero-description">
              Manage contractor payments from partial client receipts, with a separate balance and
              reserve for each project.
            </p>
            <Link href="/demo" className="splitt-primary-link">
              Open demo
            </Link>
          </div>
          <button
            className="hero-motion"
            aria-pressed={paused}
            disabled={!!reduced}
            onClick={() => setPaused((value) => !value)}
            aria-label={
              reduced
                ? 'Reduced motion enabled'
                : paused
                  ? 'Play background animation'
                  : 'Pause background animation'
            }
          >
            {still ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
            <span>
              {reduced ? 'Reduced motion' : paused ? 'Play background' : 'Pause background'}
            </span>
          </button>
        </div>
      </section>
      <main className="landing-body" id="main-content">
        <section className="payment-story" id="how-it-works" aria-labelledby="story-heading">
          <div className="page-width">
            <div className="story-intro">
              <h2 id="story-heading">A payment plan for the cash received.</h2>
              <p>
                A client pays 1,200 USDC against a 2,000 USDC invoice. With 300 held in reserve, 900
                is available for approved work.
              </p>
            </div>
            <div className="payment-ledger">
              <div className="ledger-title">
                <h3>Sample allocation</h3>
                <p>Amounts in USDC</p>
              </div>
              <dl className="ledger-summary">
                <div>
                  <dt>Invoice</dt>
                  <dd>2,000</dd>
                </div>
                <div>
                  <dt>Received</dt>
                  <dd>1,200</dd>
                </div>
                <div>
                  <dt>Reserve</dt>
                  <dd>300</dd>
                </div>
                <div>
                  <dt>Available</dt>
                  <dd>900</dd>
                </div>
              </dl>
              <table className="allocation-table">
                <caption className="sr-only">
                  Sample contractor allocation from a partial client payment
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Contractor</th>
                    <th scope="col">Amount owed</th>
                    <th scope="col">Proposed payment</th>
                  </tr>
                </thead>
                <tbody>
                  {project.commitments.map((commitment) => {
                    const payment = plan.items.find((item) => item.commitment_id === commitment.id);
                    return (
                      <tr key={commitment.id}>
                        <th scope="row">
                          {commitment.name}
                          <span>
                            {commitment.blocksDelivery
                              ? 'Full payment required'
                              : 'Partial payment agreed'}
                          </span>
                        </th>
                        <td>{formatUSDC(commitment.maximum)}</td>
                        <td>{formatUSDC(payment?.amount_micro ?? '0')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="allocation-summary">
                The reserve remains intact. Tobi’s remaining 300 is included in the next plan when
                more funds arrive.
              </p>
            </div>
          </div>
        </section>
        <section className="workflow" aria-labelledby="workflow-heading">
          <div className="page-width">
            <h2 id="workflow-heading">From receipt to payment.</h2>
            <div className="workflow-rows">
              {[
                ['Record the payment', 'Match the client’s payment to its invoice and project.'],
                [
                  'Review the allocation',
                  'Check the proposed amounts against approved work, agreed terms and available cash.',
                ],
                [
                  'Approve the batch',
                  'Authorize the exact recipients and amounts. Future plans account for payments already made.',
                ],
              ].map(([title, text]) => (
                <article key={title}>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="owner-controls" id="controls" aria-labelledby="controls-heading">
          <div className="page-width">
            <div>
              <h2 id="controls-heading">Your approval sets the limit.</h2>
              <p>Payment proposals follow the rules you set for each project.</p>
            </div>
            <div className="control-lines">
              {[
                [
                  'Project balances',
                  'Each project has its own accounted balance. An allocation cannot use another project’s funds.',
                ],
                [
                  'Spending limits',
                  'A reserve, per-payment limit and daily cap determine how much can be paid.',
                ],
                [
                  'Batch approval',
                  'The owner reviews recipients and amounts before signing. Changes require a new approval.',
                ],
              ].map(([title, text]) => (
                <article key={title}>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="landing-questions" id="questions" aria-labelledby="questions-heading">
          <div className="page-width">
            <h2 id="questions-heading">About Splitt</h2>
            <p>
              Splitt is built for agencies managing client invoices and contractor payments. The
              public demo uses sample data and simulated payments. Technical details, testnet access
              and current limitations are in the <Link href="/docs">documentation</Link>.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter fit="screen" motion={!still} />
    </div>
  );
}
