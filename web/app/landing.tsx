'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Check, LockSimple, Plus } from '@phosphor-icons/react';
import { baselinePlan, buildFacts, formatUSDC } from '@splitt/core';
import { fixtureProjects } from '../../server/src/fixtures';
import SiteHeader from './site-header';
import SiteFooter from './site-footer';
import CinematicMedia from './cinematic-media';
import './landing.css';

const steps = [
  ['Match the receipt', 'Connect the client’s payment to the right project and invoice.'],
  ['Review the split', 'See what can be paid after the reserve and agreed terms.'],
  ['Approve the payment', 'Check each recipient and amount before you sign.'],
] as const;
const questions = [
  [
    'Who is Splitt for?',
    'Agencies, studios and project teams that pay contractors from client receipts, including clients who pay in stages.',
  ],
  [
    'What happens when a client pays part of an invoice?',
    'Splitt works with the cash received. It proposes payments for approved work, keeps the reserve aside and carries unpaid obligations into the next plan.',
  ],
  [
    'Can a payment use another project’s balance?',
    'No. Each project has its own accounted balance. A proposed allocation cannot spend funds assigned to a different project.',
  ],
  [
    'Does Splitt send payments automatically?',
    'No. Live execution requires the owner’s signature for the exact recipients and amounts. Changes require a new approval.',
  ],
  [
    'Are payments made in dollars?',
    'The example displays dollar values for clarity. Payments settle in USDC on Arc Testnet; Splitt does not send bank transfers.',
  ],
  [
    'Has this run on chain?',
    'Yes. On 15 October 2026 the demo scenario ran on Arc Testnet at 1/1000 scale, with owner-signed batches executed by a Circle wallet through ProjectVault. The transactions are linked at the end of the demo.',
  ],
  [
    'Can I use Splitt with real business funds?',
    'Splitt is currently a testnet application. It is not available for mainnet business payments.',
  ],
] as const;

export default function Landing() {
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const project = fixtureProjects()[0];
  const plan = baselinePlan(buildFacts(project, new Date('2026-10-03T12:00:00Z')));
  useEffect(() => {
    const element = root.current;
    if (!element || reduced || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-visible', 'true');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12 },
    );
    element.querySelectorAll('[data-reveal]').forEach((item) => observer.observe(item));
    element.setAttribute('data-motion', 'ready');
    return () => {
      observer.disconnect();
      element.removeAttribute('data-motion');
    };
  }, [reduced]);
  return (
    <div ref={root} className="landing" id="top">
      <section className="splitt-hero" aria-labelledby="hero-heading">
        <div className="splitt-hero-stage">
          <CinematicMedia paused={!!reduced} />
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
            <Link href="/start" className="splitt-primary-link">
              Open Splitt
            </Link>
          </div>
        </div>
      </section>
      <main className="landing-body" id="main-content">
        <section className="payment-story" id="how-it-works" aria-labelledby="story-heading">
          <div className="page-width">
            <div className="section-intro" data-reveal>
              <h2 id="story-heading">
                A clear split.
                <br />
                <em>Before you pay.</em>
              </h2>
              <p>
                A $2,000 invoice. A $1,200 receipt. See exactly what goes to your team and what
                stays in reserve.
              </p>
            </div>
            <div className="cash-composition">
              <article className="cash-card cash-received" data-reveal>
                <div className="cash-card-top">
                  <h3>Client payment</h3>
                  <span className="receipt-stamp">
                    <Check size={14} aria-hidden="true" /> Received
                  </span>
                </div>
                <p className="cash-value">
                  $1,200<span>USD</span>
                </p>
                <div className="receipt-illustration">
                  <div className="receipt-progress" aria-hidden="true">
                    <span />
                  </div>
                  <p>60% of invoice received</p>
                </div>
                <dl className="receipt-foot">
                  <div>
                    <dt>Invoice total</dt>
                    <dd>$2,000</dd>
                  </div>
                  <div>
                    <dt>Still to receive</dt>
                    <dd>$800</dd>
                  </div>
                </dl>
              </article>
              {project.commitments.map((commitment, index) => {
                const amount =
                  plan.items.find((item) => item.commitment_id === commitment.id)?.amount_micro ??
                  '0';
                return (
                  <article
                    className={`cash-card cash-contractor contractor-${index}`}
                    key={commitment.id}
                    data-reveal
                  >
                    <div className="cash-card-top">
                      <span className="contractor-initial" aria-hidden="true">
                        {commitment.name.slice(0, 1)}
                      </span>
                      <span>Proposed payment</span>
                    </div>
                    <h3>{commitment.name}</h3>
                    <p className="cash-value">${formatUSDC(amount)}</p>
                    <div className="payment-track" aria-hidden="true">
                      <span
                        style={{
                          transform: `scaleX(${Number(BigInt(amount)) / Number(BigInt(commitment.maximum))})`,
                        }}
                      />
                    </div>
                    <p className="cash-caption">
                      {commitment.blocksDelivery
                        ? 'Full obligation covered'
                        : `$${formatUSDC((BigInt(commitment.maximum) - BigInt(amount)).toString())} carried forward`}
                    </p>
                  </article>
                );
              })}
              <article className="cash-card cash-reserve" data-reveal>
                <div>
                  <span className="reserve-label">
                    <LockSimple size={18} aria-hidden="true" /> Project reserve
                  </span>
                  <p>Held outside this allocation.</p>
                </div>
                <p className="reserve-value">$300</p>
              </article>
            </div>
            <p className="currency-note">Example values in USD. Payments settle in USDC.</p>
          </div>
        </section>
        <section className="workflow" aria-labelledby="workflow-heading">
          <div className="page-width">
            <div className="section-intro" data-reveal>
              <h2 id="workflow-heading">
                From client receipt
                <br />
                <em>to contractor payment.</em>
              </h2>
              <p>Follow the payment from the client’s receipt to your final review.</p>
            </div>
            <div className="workflow-stage" data-reveal>
              <div className="workflow-steps" aria-label="Explore the payment workflow">
                {steps.map(([title, description], index) => (
                  <button
                    key={title}
                    type="button"
                    className={step === index ? 'workflow-step is-active' : 'workflow-step'}
                    aria-pressed={step === index}
                    aria-controls="workflow-preview"
                    onClick={() => setStep(index)}
                  >
                    <span className="step-number">0{index + 1}</span>
                    <span>
                      <strong>{title}</strong>
                      <span className="step-description">{description}</span>
                    </span>
                    <span className="step-indicator" aria-hidden="true" />
                  </button>
                ))}
              </div>
              <div
                className="workflow-preview"
                id="workflow-preview"
                role="region"
                aria-label={steps[step][0]}
                aria-live="polite"
              >
                <div key={step} className="preview-content">
                  <div className="preview-top">
                    <span>Project payment</span>
                    <span>0{step + 1} / 03</span>
                  </div>
                  {step === 0 ? (
                    <>
                      <div className="preview-symbol">
                        <Check size={24} aria-hidden="true" />
                      </div>
                      <h3>Receipt matched</h3>
                      <p className="preview-amount">$1,200</p>
                      <p className="preview-caption">Applied to a $2,000 invoice</p>
                      <dl className="preview-lines">
                        <div>
                          <dt>Received</dt>
                          <dd>$1,200</dd>
                        </div>
                        <div>
                          <dt>Outstanding</dt>
                          <dd>$800</dd>
                        </div>
                      </dl>
                    </>
                  ) : step === 1 ? (
                    <>
                      <h3>Available for your team</h3>
                      <p className="preview-amount">$900</p>
                      <div className="split-ribbon" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </div>
                      <dl className="preview-lines">
                        <div>
                          <dt>Amara</dt>
                          <dd>$700</dd>
                        </div>
                        <div>
                          <dt>Tobi</dt>
                          <dd>$200</dd>
                        </div>
                        <div>
                          <dt>Reserve held</dt>
                          <dd>$300</dd>
                        </div>
                      </dl>
                    </>
                  ) : (
                    <>
                      <div className="preview-symbol">
                        <LockSimple size={24} aria-hidden="true" />
                      </div>
                      <h3>Ready for your approval</h3>
                      <p className="preview-caption">Two recipients. One exact batch.</p>
                      <dl className="preview-lines">
                        <div>
                          <dt>Amara</dt>
                          <dd>$700</dd>
                        </div>
                        <div>
                          <dt>Tobi</dt>
                          <dd>$200</dd>
                        </div>
                        <div className="preview-total">
                          <dt>Payment total</dt>
                          <dd>$900</dd>
                        </div>
                      </dl>
                      <p className="approval-caption">Your signature is required to send.</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="owner-controls" id="controls" aria-labelledby="controls-heading">
          <div className="page-width controls-layout">
            <div className="section-intro" data-reveal>
              <h2 id="controls-heading">
                The rules are yours.
                <br />
                <em>The plan follows.</em>
              </h2>
              <p>
                A payment should fit the project, its commitments and the cash you choose to keep.
              </p>
              <div className="reserve-diagram" data-reveal>
                <div className="reserve-diagram-labels">
                  <span>
                    Cash received <b>$1,200</b>
                  </span>
                  <span>
                    Available <b>$900</b>
                  </span>
                </div>
                <div className="reserve-diagram-bar" aria-hidden="true">
                  <span />
                  <span />
                </div>
                <p>
                  <LockSimple size={16} aria-hidden="true" /> $300 reserve excluded from the plan
                </p>
              </div>
            </div>
            <div className="control-lines">
              {[
                [
                  '01',
                  'A balance for each project',
                  'Your client’s payment stays assigned to its project. Other projects’ funds are kept out of the allocation.',
                ],
                [
                  '02',
                  'Limits before proposals',
                  'Your reserve, daily cap and per-payment limit define what the planner can propose.',
                ],
                [
                  '03',
                  'You authorize the batch',
                  'Review the exact recipients and amounts. If anything changes, a new approval is required.',
                ],
              ].map(([number, title, text]) => (
                <article key={number} data-reveal>
                  <span>{number}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="landing-questions" id="questions" aria-labelledby="questions-heading">
          <div className="page-width faq-layout">
            <div className="section-intro" data-reveal>
              <h2 id="questions-heading">
                Frequently asked
                <br />
                <em>questions.</em>
              </h2>
            </div>
            <div className="faq-list">
              {questions.map(([question, answer]) => (
                <details key={question} data-reveal>
                  <summary>
                    {question}
                    <Plus size={18} aria-hidden="true" />
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter fit="screen" />
    </div>
  );
}
