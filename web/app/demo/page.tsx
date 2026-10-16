'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  baselinePlan,
  buildFacts,
  formatUSDC,
  hashJson,
  validatePlan,
  type PlanOutput,
} from '@splitt/core';
import { fixtureProjects } from '../../../server/src/fixtures';
import SiteFooter from '../site-footer';
import SiteHeader from '../site-header';
import styles from './demo.module.css';

// The shell and controls appear immediately; only the secondary review panel enters.
export default function PublicDemo() {
  const [project, setProject] = useState(() => fixtureProjects()[0]);
  const [plan, setPlan] = useState<PlanOutput | null>(null);
  const [settled, setSettled] = useState<string[]>([]);
  const applied = useRef(new Set<string>());
  const [remainder, setRemainder] = useState(false);
  const [message, setMessage] = useState('');
  const reduced = useReducedMotion();
  const facts = useMemo(() => buildFacts(project, new Date('2026-10-03T12:00:00Z')), [project]);
  const validation = plan ? validatePlan(plan, facts, facts, baselinePlan(facts)) : null;
  const totalPaid = project.commitments.reduce((sum, c) => sum + BigInt(c.paid), 0n);
  function settle() {
    if (!plan || !validation?.ok || applied.current.has(hashJson(plan))) return;
    const payments = new Map(
      plan.items
        .filter((i) => i.action === 'pay')
        .map((i) => [i.commitment_id, BigInt(i.amount_micro)]),
    );
    const total = [...payments.values()].reduce((sum, amount) => sum + amount, 0n);
    if (total === 0n) return;
    applied.current.add(hashJson(plan));
    setProject((p) => ({
      ...p,
      balance: String(BigInt(p.balance) - total),
      spentToday: String(BigInt(p.spentToday) + total),
      version: p.version + 1,
      commitments: p.commitments.map((c) => ({
        ...c,
        paid: String(BigInt(c.paid) + (payments.get(c.id) ?? 0n)),
      })),
    }));
    setSettled((ids) => [...ids, hashJson(plan)]);
    setPlan(null);
    setMessage('Payment simulation recorded.');
  }
  function addRemainder() {
    if (remainder || settled.length !== 1) return;
    setProject((p) => ({
      ...p,
      received: '2000000000',
      balance: String(BigInt(p.balance) + 800000000n),
      version: p.version + 1,
    }));
    setRemainder(true);
    setPlan(null);
    setMessage('Client balance received. Generate a new allocation.');
  }
  function reset() {
    applied.current.clear();
    setProject(fixtureProjects()[0]);
    setPlan(null);
    setSettled([]);
    setRemainder(false);
    setMessage('Demo reset.');
  }
  return (
    <div className={styles.page} id="top">
      <SiteHeader demo onReset={reset} />
      <main className={styles.main} id="main-content">
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Demo · Sample data</p>
          <h1>Payment allocation</h1>
          <p>
            Review a sample project, generate an allocation and simulate payment. No funds move.
          </p>
        </div>
        <div className={styles.grid}>
          <section className={styles.project} aria-labelledby="project-heading">
            <div className={styles.sectionHead}>
              <div>
                <p>Northstar Studio</p>
                <h2 id="project-heading">Brand launch</h2>
              </div>
              <span className={styles.tag}>{remainder ? 'Invoice paid' : 'Partially paid'}</span>
            </div>
            <dl className={styles.numbers}>
              {[
                ['Invoice', project.invoiceTotal],
                ['Received', project.received],
                ['Project balance', project.balance],
                ['Protected reserve', project.reserve],
                ['Paid so far', String(totalPaid)],
                ['Spendable now', facts.spendable],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {formatUSDC(value)} <small>USDC</small>
                  </dd>
                </div>
              ))}
            </dl>
            <div className={styles.obligations}>
              <h3>Agreed obligations</h3>
              {project.commitments.map((c) => (
                <div key={c.id}>
                  <div>
                    <strong>{c.name}</strong>
                    <p>
                      {c.blocksDelivery ? 'Full payment required' : 'Partial payment permitted'}
                    </p>
                  </div>
                  <span>
                    {formatUSDC(c.paid)} / {formatUSDC(c.maximum)}
                    <small> USDC paid</small>
                  </span>
                </div>
              ))}
            </div>
            <div className={styles.actions}>
              <button
                className={styles.primary}
                disabled={totalPaid === 1200000000n}
                onClick={() => {
                  setPlan(baselinePlan(facts));
                  setMessage('Allocation ready for review.');
                }}
              >
                Generate allocation
              </button>
              <button disabled={remainder || settled.length !== 1} onClick={addRemainder}>
                Receive remaining 800 USDC
              </button>
            </div>
          </section>
          <motion.section
            className={styles.review}
            aria-labelledby="review-heading"
            initial={reduced ? false : { opacity: 0, transform: 'translateY(12px)' }}
            animate={{ opacity: 1, transform: 'translateY(0px)' }}
            transition={{ duration: reduced ? 0 : 0.3, ease: [0.23, 1, 0.32, 1] }}
          >
            <h2 id="review-heading">Review payments</h2>
            {plan ? (
              <>
                <p className={styles.validation}>
                  {validation?.ok
                    ? 'Validated against reserve and spending limits'
                    : 'Blocked by validation'}
                </p>
                {plan.items.map((item) => (
                  <article className={styles.item} key={item.commitment_id}>
                    <div>
                      <strong>
                        {project.commitments.find((c) => c.id === item.commitment_id)?.name}
                      </strong>
                      <span>
                        {item.action === 'pay' ? formatUSDC(item.amount_micro) + ' USDC' : 'Defer'}
                      </span>
                    </div>
                    <p>
                      {item.reason_codes.includes('BLOCKS_DELIVERY')
                        ? 'Payment is required to continue delivery.'
                        : item.reason_codes.includes('PARTIAL_PERMITTED')
                          ? 'Partial payment is allowed under the agreed terms.'
                          : 'Approved work is eligible for payment.'}
                    </p>
                    <details>
                      <summary>Payment details</summary>
                      <p>{item.explanation}</p>
                      <ul>
                        {facts.facts
                          .filter((f) => item.fact_refs.includes(f.id))
                          .map((f) => (
                            <li key={f.id}>
                              {f.id}: {f.field} — {String(f.value)}
                            </li>
                          ))}
                      </ul>
                    </details>
                  </article>
                ))}
                <p>Unfunded obligations: {formatUSDC(plan.unfunded_shortfall_micro)} USDC</p>
                <button
                  className={styles.primary}
                  disabled={!validation?.ok || !plan.items.some((i) => i.action === 'pay')}
                  onClick={settle}
                >
                  Simulate reviewed batch
                </button>
              </>
            ) : (
              <div className={styles.empty}>
                <span aria-hidden="true">···</span>
                <p>
                  {totalPaid === 1200000000n
                    ? 'All contractor payments are complete. The project retains 800 USDC.'
                    : 'Generate an allocation to review proposed payments.'}
                </p>
              </div>
            )}
            <p className={styles.notice} role="status" aria-live="polite">
              {message}
            </p>
          </motion.section>
        </div>
        <aside className={styles.isolation}>
          <div>
            <p>Separate project</p>
            <h3>Fieldwork website</h3>
          </div>
          <strong>
            1,000 <small>USDC</small>
          </strong>
          <p>This project’s balance is unchanged.</p>
        </aside>
      </main>
      <SiteFooter fit="app" />
    </div>
  );
}
