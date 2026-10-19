'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import SiteFooter from '../site-footer';
import SiteHeader from '../site-header';
import './testnet.css';
import { createWalletClient, custom, type EIP1193Provider, type Address, type Hex } from 'viem';
import { authorizationTypes, formatUSDC } from '@splitt/core';
import type { LiveState } from '../../../server/src/live/repository';
import type { BatchApproval } from '../../../server/src/store';
import BridgeFunding from './bridge-funding';
import { LIVE_MODES, NETWORK, addressUrl, switchNetworkMessage, txUrl } from '../network';
type Workspace = LiveState & { vault: Address; owner: Address; operator: Address };
const demoOnly = process.env.NEXT_PUBLIC_DEMO_ONLY === 'true';
export default function TestnetWorkspace() {
  const [mode, setMode] = useState(demoOnly ? 'public-preview' : 'checking'),
    [workspace, setWorkspace] = useState<Workspace>(),
    [csrf, setCsrf] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState<{ id: string; approval: BatchApproval }>();
  async function api<T>(path: string, body?: unknown, token = csrf): Promise<T> {
    const response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'x-splitt-csrf': token },
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? 'Request failed.');
    return data;
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed.');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (demoOnly) return;
    void api<{ mode: string }>('/health')
      .then((data) => setMode(data.mode))
      .catch(() => setMode('unavailable'));
  }, []);
  useEffect(() => {
    if (!csrf || busy || !LIVE_MODES.includes(mode)) return;
    let active = true;
    const timer = setInterval(() => {
      void api<Workspace>('/testnet/workspace')
        .then((data) => {
          if (active) setWorkspace(data);
        })
        .catch(() => {
          if (active)
            setError('Could not refresh receipt status. Refresh before reviewing a payment.');
        });
    }, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [csrf, busy, mode]);
  async function refresh() {
    setWorkspace(await api<Workspace>('/testnet/workspace'));
  }
  async function connect() {
    const provider = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
    if (!provider) throw new Error('Open this page in a browser with your owner wallet installed.');
    const client = createWalletClient({ transport: custom(provider) });
    const [account] = await client.requestAddresses();
    if (!account) throw new Error('No account selected.');
    const challenge = await api<{ nonce: string; message: string }>('/auth/challenge', {
      address: account,
    });
    const signature = await client.signMessage({ account, message: challenge.message });
    const session = await api<{ csrf: string }>('/auth/verify', {
      nonce: challenge.nonce,
      signature,
    });
    setCsrf(session.csrf);
    setWorkspace(await api<Workspace>('/testnet/workspace', undefined, session.csrf));
  }
  async function approve() {
    if (!review || !workspace) throw new Error('Review a proposed batch first.');
    const provider = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
    if (!provider) throw new Error('Owner wallet required.');
    const client = createWalletClient({ transport: custom(provider) });
    const accounts = await client.getAddresses();
    if (accounts[0]?.toLowerCase() !== workspace.owner.toLowerCase())
      throw new Error('Select the configured owner wallet.');
    if ((await client.getChainId()) !== NETWORK.chainId) throw new Error(switchNetworkMessage);
    const a = review.approval;
    const signature = await client.signTypedData({
      account: accounts[0],
      domain: a.domain,
      types: authorizationTypes,
      primaryType: 'PlanAuthorization',
      message: {
        ...a.message,
        projectVersion: BigInt(a.message.projectVersion),
        deadline: BigInt(a.message.deadline),
      },
    });
    await api(`/testnet/plans/${review.id}/submit`, { signature });
    setReview(undefined);
    await refresh();
  }
  return (
    <>
      <SiteHeader />
      <main className="testnet-main" id="main-content">
        <header className="art-band">
          <h1>Testnet workspace</h1>
          <p>Review and authorize payments on Arc Testnet. Testnet USDC only.</p>
        </header>
        {error && (
          <p role="alert" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        {!LIVE_MODES.includes(mode) ? (
          <section className="panel" style={{ padding: 24, marginTop: 24 }}>
            <h2>
              {mode === 'checking'
                ? 'Checking the connection…'
                : demoOnly
                  ? 'Owner access is not publicly hosted'
                  : 'Testnet connection unavailable'}
            </h2>
            {mode !== 'checking' && (
              <p>
                {demoOnly
                  ? 'The vault is deployed. The owner API and payment worker currently run locally.'
                  : 'The owner API is not connected. Configuration requirements are in the documentation.'}
              </p>
            )}
            {mode !== 'checking' && <Link href="/docs#testnet">Connection documentation</Link>}
          </section>
        ) : (
          <>
            <button className="button primary" disabled={busy} onClick={() => void run(connect)}>
              Sign in with owner wallet
            </button>
            {workspace && (
              <>
                <p>
                  Vault:{' '}
                  <a href={addressUrl(workspace.vault)} target="_blank" rel="noreferrer">
                    {workspace.vault}
                  </a>
                </p>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void run(refresh)}
                >
                  Refresh receipts and settlement
                </button>
                <BridgeFunding
                  workspace={workspace}
                  api={api}
                  refresh={refresh}
                  busy={busy}
                  run={run}
                />
                <section className="panel" style={{ padding: 24, marginTop: 24 }}>
                  <h2>Receipt activity</h2>
                  <p>
                    Attributed receipts automatically trigger a draft. Payments still require your
                    signature.
                  </p>
                  {(workspace.notifications ?? [])
                    .filter((n) => !n.readAt)
                    .map((n) => (
                      <article key={n.id} className="receipt-notification">
                        <p>{n.message}</p>
                        {n.planId && <a href="#allocation-proposals">Review allocation</a>}
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await api(
                                `/testnet/notifications/${encodeURIComponent(n.id)}/read`,
                                {},
                              );
                              await refresh();
                            })
                          }
                        >
                          Mark as read
                        </button>
                      </article>
                    ))}
                  {(workspace.receiptDrafts ?? []).map((task) => (
                    <p key={task.id}>
                      {workspace.projects.find((p) => p.id === task.projectId)?.name}:{' '}
                      {task.state === 'done'
                        ? 'Draft prepared'
                        : task.state === 'needs_review'
                          ? 'Owner review needed'
                          : 'Draft pending'}
                    </p>
                  ))}
                  <h3>Read a client payment note</h3>
                  <p>
                    Choose an indexed receipt. The suggested invoice match does not change balances
                    or authorize payment.
                  </p>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      void run(async () => {
                        await api('/testnet/payment-notes', {
                          eventId: data.get('eventId'),
                          note: data.get('note'),
                        });
                        await refresh();
                      });
                    }}
                  >
                    <label htmlFor="note-receipt">Receipt</label>
                    <select id="note-receipt" name="eventId" required defaultValue="">
                      <option value="" disabled>
                        Select a receipt
                      </option>
                      {workspace.events
                        .filter((e) =>
                          ['PaymentReceived', 'PaymentAttributed', 'Transfer'].includes(e.name),
                        )
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name} · {formatUSDC(e.args.amount ?? e.args.value ?? '0')} USDC ·{' '}
                            {e.txHash.slice(0, 10)}
                          </option>
                        ))}
                    </select>
                    <label htmlFor="payment-note">Client’s note</label>
                    <textarea
                      id="payment-note"
                      name="note"
                      required
                      minLength={3}
                      maxLength={2000}
                      rows={3}
                    />
                    <button className="button secondary" disabled={busy}>
                      Suggest invoice match
                    </button>
                  </form>
                  {(workspace.paymentNotes ?? [])
                    .slice(-5)
                    .reverse()
                    .map((note) => (
                      <article key={note.id} className="receipt-notification">
                        <h3>
                          {note.status === 'suggested_match'
                            ? `Suggested: ${note.invoiceRef}`
                            : 'Match needs review'}
                        </h3>
                        <p>
                          {note.model}
                          {note.fallbackUsed ? ' · model not used' : ''}
                        </p>
                        {note.remainderQuote && (
                          <p>Client statement, unverified: “{note.remainderQuote}”</p>
                        )}
                        {!!note.issues.length && <p>{note.issues.join(', ')}</p>}
                      </article>
                    ))}
                </section>
                <section className="panel" style={{ padding: 24, marginTop: 24 }}>
                  <h2>Projects</h2>
                  {workspace.projects.length === 0 && (
                    <p>
                      Create the project and commitments in the vault, then register their invoice
                      and agreed work details below.
                    </p>
                  )}
                  {workspace.projects.map((p) => (
                    <article
                      key={p.id}
                      style={{ borderBottom: '1px solid var(--line)', padding: '16px 0' }}
                    >
                      <h3>{p.name}</h3>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const snapshot = await api<{
                              project: { balance: string; reserve: string; spentToday: string };
                            }>(`/testnet/projects/${p.id}`);
                            setWorkspace((w) =>
                              w
                                ? {
                                    ...w,
                                    projects: w.projects.map((item) =>
                                      item.id === p.id ? { ...item, ...snapshot.project } : item,
                                    ),
                                  }
                                : w,
                            );
                          })
                        }
                      >
                        Read current balance
                      </button>
                      <p>
                        {formatUSDC(p.balance)} USDC available · {formatUSDC(p.reserve)} USDC
                        reserve
                      </p>
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api(`/testnet/projects/${p.id}/replan`, {});
                            await refresh();
                          })
                        }
                      >
                        Propose allocation
                      </button>
                    </article>
                  ))}
                </section>
                <section className="panel" style={{ padding: 24, marginTop: 24 }}>
                  <h2>Register project details</h2>
                  <p>
                    Use the metadata file generated by the testnet setup command. Addresses and
                    obligations must match the vault.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const data = new FormData(form);
                      void run(async () => {
                        await api('/testnet/projects', JSON.parse(String(data.get('metadata'))));
                        await refresh();
                        form.reset();
                      });
                    }}
                  >
                    <label htmlFor="metadata">Project metadata JSON</label>
                    <textarea
                      id="metadata"
                      name="metadata"
                      required
                      rows={8}
                      style={{ display: 'block', width: '100%', margin: '12px 0' }}
                    />
                    <button className="button secondary" disabled={busy}>
                      Register existing on-chain project
                    </button>
                  </form>
                </section>
                <section className="panel" style={{ padding: 24, marginTop: 24 }}>
                  <h2 id="allocation-proposals">Allocation proposals</h2>
                  {workspace.plans.map((p) => (
                    <article
                      key={p.id}
                      style={{ padding: '16px 0', borderBottom: '1px solid var(--line)' }}
                    >
                      <h3>
                        {workspace.projects.find((project) => project.id === p.projectId)?.name}
                      </h3>
                      <p>
                        {p.model} · {p.status}
                      </p>
                      <p>
                        {p.fallbackUsed
                          ? 'Deterministic fallback used.'
                          : 'Model proposal passed validation.'}
                      </p>
                      {p.output.items.map((item) => (
                        <p key={item.commitment_id}>
                          {workspace.projects
                            .flatMap((project) => project.commitments)
                            .find((c) => c.id === item.commitment_id)?.name ?? item.commitment_id}
                          : {formatUSDC(item.amount_micro)} USDC · {item.explanation}
                        </p>
                      ))}
                      <p>
                        Unfunded obligations: {formatUSDC(p.output.unfunded_shortfall_micro)} USDC
                      </p>
                      <details className="decision-evidence">
                        <summary>Decision evidence and baseline</summary>
                        <p>
                          Created {p.createdAt}. Validation:{' '}
                          {p.validation.ok ? 'passed' : 'rejected'}. Facts hash: {p.factsHash}
                        </p>
                        <p>
                          Trigger:{' '}
                          {workspace.receiptDrafts
                            ?.filter((t) => t.planId === p.id)
                            .map((t) => t.id)
                            .join(', ') || 'Owner requested'}
                        </p>
                        <div className="decision-table">
                          <table>
                            <caption>Proposal compared with the deterministic baseline</caption>
                            <thead>
                              <tr>
                                <th scope="col">Obligation</th>
                                <th scope="col">Proposed USDC</th>
                                <th scope="col">Baseline USDC</th>
                                <th scope="col">Supporting facts</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.output.items.map((item) => (
                                <tr key={item.commitment_id}>
                                  <th scope="row">{item.commitment_id}</th>
                                  <td>
                                    {formatUSDC(item.amount_micro)} · {item.action}
                                  </td>
                                  <td>
                                    {formatUSDC(
                                      p.baseline.items.find(
                                        (b) => b.commitment_id === item.commitment_id,
                                      )?.amount_micro ?? '0',
                                    )}
                                  </td>
                                  <td>{item.fact_refs.join(', ')}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <details>
                          <summary>Recorded facts</summary>
                          <pre>{JSON.stringify(p.facts, null, 2)}</pre>
                        </details>
                      </details>
                      <button
                        className="button secondary"
                        disabled={busy || p.status !== 'awaiting_owner'}
                        onClick={() =>
                          void run(async () => {
                            const result = await api<{ approval: BatchApproval }>(
                              `/testnet/plans/${p.id}/prepare`,
                              {},
                            );
                            setReview({ id: p.id, approval: result.approval });
                          })
                        }
                      >
                        Review exact batch
                      </button>
                    </article>
                  ))}
                </section>
                {review && (
                  <section
                    className="panel"
                    aria-label="Exact batch review"
                    style={{ padding: 24, marginTop: 24, border: '2px solid var(--green)' }}
                  >
                    <h2>Approve this testnet payment batch</h2>
                    <p>
                      This signature authorizes real testnet USDC payouts on Arc Testnet through
                      your Circle operator.
                    </p>
                    <p>
                      Vault: {review.approval.domain.verifyingContract}
                      <br />
                      Expires:{' '}
                      {new Date(Number(review.approval.message.deadline) * 1000).toLocaleString()}
                    </p>
                    {review.approval.items.map((i) => {
                      const c = workspace.projects
                        .flatMap((p) => p.commitments)
                        .find((c) => c.onchainId === i.commitmentId);
                      return (
                        <p key={i.executionId}>
                          {c?.name}: {formatUSDC(i.amount)} USDC
                          <br />
                          Recipient: {c?.payee}
                          <br />
                          Execution: {i.executionId}
                        </p>
                      );
                    })}
                    <p>
                      Total:{' '}
                      {formatUSDC(
                        String(
                          review.approval.items.reduce((sum, i) => sum + BigInt(i.amount), 0n),
                        ),
                      )}{' '}
                      USDC
                    </p>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() => void run(approve)}
                    >
                      Sign and queue reviewed batch
                    </button>
                    <button className="button secondary" onClick={() => setReview(undefined)}>
                      Cancel
                    </button>
                  </section>
                )}
                <section className="panel" style={{ padding: 24, marginTop: 24 }}>
                  <h2>Settlement</h2>
                  {workspace.jobs.map((j) => (
                    <p key={j.id}>
                      {j.state} · {j.attempts} worker attempts{' '}
                      {j.txHash && (
                        <a href={txUrl(j.txHash)} target="_blank" rel="noreferrer">
                          View transaction
                        </a>
                      )}
                      {j.lastError && <span> · {j.lastError}</span>}
                    </p>
                  ))}
                </section>
                <section className="panel" style={{ padding: 24, marginTop: 24 }}>
                  <h2>Indexed chain events</h2>
                  <p>
                    Next block: {workspace.nextBlock}. Direct transfers are receipts, not automatic
                    invoice matches.
                  </p>
                  {workspace.events
                    .slice(-20)
                    .reverse()
                    .map((event) => (
                      <p key={event.id}>
                        {event.name} · Block {event.block} ·{' '}
                        <a href={txUrl(event.txHash)} target="_blank" rel="noreferrer">
                          View receipt
                        </a>
                      </p>
                    ))}
                </section>
              </>
            )}
          </>
        )}
      </main>
      <SiteFooter fit="app" />
    </>
  );
}
