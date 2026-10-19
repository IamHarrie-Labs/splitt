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

// Real Arc Testnet transactions for this same scenario at 1/1000 scale (docs/testnet-payout-proof.json).
const EXPLORER = 'https://explorer.testnet.arc.io/tx/';
const CHAIN_PROOF = [
  {
    step: 'First batch',
    detail: '0.7 USDC to Maya, 0.2 USDC to Leo',
    tx: '0x938ea7d6370c06d25daf6c73493e5c43f304abf9938563b7bd934325edaebdc5',
  },
  {
    step: 'Remainder received',
    detail: '0.8 USDC deposited to the project',
    tx: '0xde2ce4f47108ab118ef30b7dd835b7da7dae60ed7b83504ead5011acddd35c6d',
  },
  {
    step: 'Final batch',
    detail: '0.3 USDC to Leo; project keeps 0.8',
    tx: '0x098fa70efda77e5f22396521bce7d5ccdeb3bbbaab8997e9ae8551a0ceb32881',
  },
];

// The shell and controls appear immediately; only the secondary review panel enters.
export default function PublicDemo() {
  const [project, setProject] = useState(() => fixtureProjects()[0]);
  const [plan, setPlan] = useState<PlanOutput | null>(() =>
    baselinePlan(buildFacts(fixtureProjects()[0], new Date('2026-10-03T12:00:00Z'))),
  );
  const [settled, setSettled] = useState<string[]>([]);
  const applied = useRef(new Set<string>());
  const [remainder, setRemainder] = useState(false);
  const [message, setMessage] = useState('Receipt detected. Allocation drafted for your review.');
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
    const next = {
      ...project,
      received: '2000000000',
      balance: String(BigInt(project.balance) + 800000000n),
      version: project.version + 1,
    };
    setProject(next);
    setRemainder(true);
    setPlan(baselinePlan(buildFacts(next, new Date('2026-10-03T12:00:00Z'))));
    setMessage('Receipt detected. A new allocation is ready for review.');
  }
  function reset() {
    applied.current.clear();
    const initial = fixtureProjects()[0];
    setProject(initial);
    setPlan(baselinePlan(buildFacts(initial, new Date('2026-10-03T12:00:00Z'))));
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
            A receipt triggers a draft. Review the allocation and simulate payment. No funds move
            here; the real testnet transactions for this flow are listed below.
          </p>
          <p>
            <Link href="/pilot">Review your own project</Link>
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
                Refresh allocation
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
        <section className={styles.chain} aria-labelledby="chain-heading">
          <div className={styles.chainHead}>
            <h2 id="chain-heading">On Arc Testnet</h2>
            <p>
              This sequence also ran on chain on 15 October 2026, at 1/1000 scale. The owner signed
              each batch, a Circle developer-controlled wallet executed it through ProjectVault, and
              Fieldwork’s separate balance stayed untouched. Recipients are test wallets, not real
              contractors.
            </p>
          </div>
          <ol>
            {CHAIN_PROOF.map((row, i) => {
              const reached =
                i === 0 ? settled.length >= 1 : i === 1 ? remainder : settled.length >= 2;
              return (
                <li key={row.tx} data-reached={reached || undefined}>
                  <span className={styles.chainStep}>{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{row.step}</strong>
                    <p>{row.detail}</p>
                  </div>
                  <a href={EXPLORER + row.tx} target="_blank" rel="noopener noreferrer">
                    {row.tx.slice(0, 8)}…{row.tx.slice(-6)}
                    <span className="sr-only"> on Arc explorer (opens in a new tab)</span>
                  </a>
                </li>
              );
            })}
          </ol>
          <p className={styles.proof}>
            A provider response was deliberately lost during the run. The same job resumed with
            identical calldata and paid once.{' '}
            <a
              href="https://github.com/IamHarrie-Labs/splitt/blob/master/docs/testnet-payout-proof.json"
              target="_blank"
              rel="noopener noreferrer"
            >
              Proof record
            </a>
          </p>
        </section>
      </main>
      <SiteFooter fit="app" />
    </div>
  );
}
