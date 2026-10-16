'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { formatUSDC } from '@splitt/core';
import { planPilot, pilotEvidence } from '../../../packages/core/src/pilot';
import SiteHeader from '../site-header';
import SiteFooter from '../site-footer';
import './pilot.css';
const today = () => new Date().toISOString().slice(0, 10);
export default function Pilot() {
  const review = useRef<HTMLElement>(null);
  const [startedAt] = useState(() => new Date().toISOString());
  const [result, setResult] = useState<ReturnType<typeof planPilot>>();
  const [error, setError] = useState('');
  const [count, setCount] = useState(2);
  const [feedback, setFeedback] = useState<'accepted' | 'would_change' | 'not_useful'>('accepted');
  const [detail, setDetail] = useState('');
  const [permission, setPermission] = useState(false);
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setResult(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const input = {
        businessAlias: form.get('businessAlias'),
        invoiceRef: form.get('invoiceRef'),
        invoiceTotal: form.get('invoiceTotal'),
        received: form.get('received'),
        reserve: form.get('reserve'),
        sessionDate: form.get('sessionDate'),
        consent: form.has('consent'),
        realCase: form.has('realCase'),
        contractors: Array.from({ length: count }, (_, i) => ({
          name: form.get(`name-${i}`),
          owed: form.get(`owed-${i}`),
          dueDate: form.get(`date-${i}`),
          partialAllowed: form.has(`partial-${i}`),
          blocksDelivery: form.has(`blocking-${i}`),
        })),
      };
      setResult(planPilot(input));
      setDetail('');
      setPermission(false);
      requestAnimationFrame(() => review.current?.focus());
    } catch (e) {
      setError(
        e instanceof Error
          ? 'Review the amounts, dates, names and consent fields. Receipts cannot exceed the invoice.'
          : 'Could not prepare this case.',
      );
      requestAnimationFrame(() => review.current?.focus());
    }
  }
  function download() {
    if (!result) return;
    setError('');
    try {
      const evidence = pilotEvidence(
        result.input,
        { decision: feedback, detail, quotePermission: permission },
        startedAt,
      );
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = 'splitt-pilot-session.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('Add a short explanation of your feedback before exporting.');
    }
  }
  return (
    <>
      <SiteHeader />
      <main className="pilot-main" id="main-content">
        <header>
          <h1>Try your project.</h1>
          <p>
            Review a real partial-payment case using business and contractor aliases. Nothing is
            uploaded, saved to this browser or sent to a wallet.
          </p>
        </header>
        <div className="pilot-layout">
          <form
            onSubmit={submit}
            onChange={() => {
              setResult(undefined);
              setError('');
            }}
          >
            <fieldset>
              <legend>Project details</legend>
              <div className="pilot-fields">
                <label>
                  Business alias
                  <input
                    name="businessAlias"
                    required
                    minLength={2}
                    maxLength={80}
                    autoComplete="off"
                  />
                </label>
                <label>
                  Invoice reference
                  <input name="invoiceRef" required maxLength={80} autoComplete="off" />
                </label>
                <label>
                  Invoice total (USD)
                  <input
                    name="invoiceTotal"
                    required
                    inputMode="decimal"
                    pattern="[0-9]+(\.[0-9]{1,6})?"
                  />
                </label>
                <label>
                  Cash received (USD)
                  <input
                    name="received"
                    required
                    inputMode="decimal"
                    pattern="[0-9]+(\.[0-9]{1,6})?"
                  />
                </label>
                <label>
                  Reserve to keep (USD)
                  <input
                    name="reserve"
                    required
                    inputMode="decimal"
                    pattern="[0-9]+(\.[0-9]{1,6})?"
                  />
                </label>
                <label>
                  Review date
                  <input name="sessionDate" type="date" required defaultValue={today()} />
                </label>
              </div>
            </fieldset>
            <fieldset>
              <legend>Approved contractor work</legend>
              {Array.from({ length: count }, (_, i) => (
                <div className="pilot-contractor" key={i}>
                  <h3>Contractor {i + 1}</h3>
                  <div className="pilot-fields">
                    <label>
                      Name or alias
                      <input name={`name-${i}`} required maxLength={60} autoComplete="off" />
                    </label>
                    <label>
                      Amount owed (USD)
                      <input
                        name={`owed-${i}`}
                        required
                        inputMode="decimal"
                        pattern="[0-9]+(\.[0-9]{1,6})?"
                      />
                    </label>
                    <label>
                      Due date
                      <input name={`date-${i}`} type="date" required defaultValue={today()} />
                    </label>
                  </div>
                  <label className="pilot-check">
                    <input name={`partial-${i}`} type="checkbox" /> Partial payments are agreed
                  </label>
                  <label className="pilot-check">
                    <input name={`blocking-${i}`} type="checkbox" /> Full payment is needed to
                    unblock delivery
                  </label>
                </div>
              ))}
              <button
                type="button"
                className="pilot-secondary"
                disabled={count >= 8}
                onClick={() => {
                  setCount((n) => n + 1);
                  setResult(undefined);
                }}
              >
                Add contractor
              </button>
            </fieldset>
            <label className="pilot-check">
              <input name="realCase" type="checkbox" required /> This case comes from an actual
              business situation.
            </label>
            <label className="pilot-check">
              <input name="consent" type="checkbox" required /> I have permission to use these
              anonymized facts and confirm the work is approved.
            </label>
            <button className="pilot-primary" type="submit">
              Review allocation
            </button>
          </form>
          <aside
            ref={review}
            tabIndex={-1}
            className="pilot-review"
            aria-live="polite"
            aria-label="Project allocation review"
          >
            <h2>Your review</h2>
            {error && (
              <p role="alert" className="pilot-error">
                {error}
              </p>
            )}
            {!result ? (
              <p>
                Enter the project’s receipt, reserve and approved obligations to prepare a plan.
                This uses the deterministic planner, not a model.
              </p>
            ) : (
              <>
                <p>
                  {formatUSDC(result.validation.total)} USD proposed. The reserve remains outside
                  the plan.
                </p>
                <div className="pilot-plan">
                  {result.output.items.map((item, i) => (
                    <article key={item.commitment_id}>
                      <div>
                        <h3>
                          {
                            result.input.contractors.find(
                              (_, index) => item.commitment_id === `contractor-${index}`,
                            )?.name
                          }
                        </h3>
                        <strong>{formatUSDC(item.amount_micro)} USD</strong>
                      </div>
                      <p>{item.explanation}</p>
                    </article>
                  ))}
                </div>
                {result.output.escalations.map((e, i) => (
                  <p key={i}>{e.detail}</p>
                ))}
                <label>
                  Would you use this allocation?
                  <select
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value as typeof feedback)}
                  >
                    <option value="accepted">Yes, as proposed</option>
                    <option value="would_change">I would change it</option>
                    <option value="not_useful">It is not useful for this case</option>
                  </select>
                </label>
                <label>
                  Why? What would you change?
                  <textarea
                    value={detail}
                    onChange={(e) => setDetail(e.target.value)}
                    minLength={3}
                    maxLength={1000}
                    rows={4}
                  />
                </label>
                <label className="pilot-check">
                  <input
                    type="checkbox"
                    checked={permission}
                    onChange={(e) => setPermission(e.target.checked)}
                  />{' '}
                  My feedback may be quoted with my business alias.
                </label>
                <button
                  type="button"
                  className="pilot-primary"
                  disabled={detail.trim().length < 3}
                  onClick={download}
                >
                  Export session and feedback
                </button>
                <p>
                  The export records a planning session with participant-reported facts. It is not
                  proof of a customer payment or verified adoption.
                </p>
              </>
            )}
            <Link href="/docs#pilot">How to run a pilot session</Link>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
