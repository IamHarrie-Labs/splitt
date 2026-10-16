'use client';
import Link from 'next/link';
import SiteFooter from './site-footer';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createWalletClient, custom, type EIP1193Provider } from 'viem';
import {
  ArrowDownLeft,
  ArrowsClockwise,
  ChartBar,
  Check,
  CheckCircle,
  Clock,
  Coins,
  DotsThree,
  FolderSimple,
  GearSix,
  Lightning,
  Plus,
  ShieldCheck,
  Stack,
  WarningCircle,
  Wallet,
  X,
} from '@phosphor-icons/react';
import {
  buildFacts,
  formatUSDC,
  parseUSDC,
  authorizationTypes,
  type Project,
  type PlanOutput,
  type Validation,
} from '@splitt/core';

type Plan = {
  id: string;
  projectId: string;
  output: PlanOutput;
  validation: Validation;
  fallbackUsed: boolean;
  model: string;
  status: string;
  facts: ReturnType<typeof buildFacts>;
  factsHash: string;
  planHash: string;
  createdAt: string;
  approval?: { signature?: string; signedAt?: string };
};
type Payment = {
  id: string;
  projectId: string | null;
  invoice: string;
  payer: string;
  amount: string;
  status: string;
  route: string;
  at: string;
};
type Entry = {
  id: string;
  projectId: string;
  at: string;
  event: string;
  detail: string;
  amount: string;
  hash: string;
};
type WorkspaceData = {
  projects: Project[];
  plans: Plan[];
  payments: Payment[];
  ledger: Entry[];
  mode: string;
  now: string;
  storage: 'file' | 'postgres';
  authEnabled: boolean;
  approvalEnabled: boolean;
};
type PreparedBatch = {
  domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` };
  message: {
    planId: `0x${string}`;
    planHash: `0x${string}`;
    projectId: `0x${string}`;
    projectVersion: string;
    deadline: string;
    itemsHash: `0x${string}`;
  };
  items: { executionId: `0x${string}`; commitmentId: `0x${string}`; amount: string }[];
};
type ModalName = 'project' | 'commitment' | 'payment' | 'simulate' | 'sign' | 'settings' | null;
const nav = [
  { key: 'overview', label: 'Projects', icon: FolderSimple },
  { key: 'payments', label: 'Incoming payments', icon: ArrowDownLeft },
  { key: 'allocation', label: 'Allocation review', icon: Stack },
  { key: 'settlement', label: 'Settlement', icon: Coins },
  { key: 'metrics', label: 'Usage & metrics', icon: ChartBar },
];
const money = (value: string) => formatUSDC(value);
function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={close}
      onClick={(event) => {
        if (event.target === ref.current) close();
      }}
    >
      <div className="dialog-body">
        <div className="dialog-heading">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Close dialog" onClick={close}>
            <X />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
function Field({
  label,
  name,
  value,
  type = 'text',
  required = true,
}: {
  label: string;
  name: string;
  value?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="field">
      {label}
      <input
        name={name}
        defaultValue={value}
        type={type}
        required={required}
        autoComplete="off"
        inputMode={
          type === 'text' &&
          ['amount', 'invoiceTotal', 'reserve', 'perPayment', 'perDay', 'maximum'].includes(name)
            ? 'decimal'
            : undefined
        }
      />
    </label>
  );
}

export default function Workspace({ section }: { section: string }) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [projectId, setProjectId] = useState('northstar');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [modal, setModal] = useState<ModalName>(null);
  const [showFacts, setShowFacts] = useState(false);
  const [interrupt, setInterrupt] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [owner, setOwner] = useState<string | null>(null);
  const csrf = useRef('');
  const [preparedBatch, setPreparedBatch] = useState<PreparedBatch | null>(null);
  async function connectWallet() {
    setBusy('wallet');
    setError('');
    try {
      if (address) {
        if (authenticated) {
          const response = await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-splitt-csrf': csrf.current },
            body: '{}',
          });
          if (!response.ok && response.status !== 401)
            throw new Error('Could not sign out. Try again.');
        }
        setAddress(null);
        setAuthenticated(false);
        csrf.current = '';
        if (authEnabled) setData(null);
        setNotice('Wallet disconnected.');
        return;
      }
      const provider = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
      if (!provider) throw new Error('Install a browser wallet such as Rabby or MetaMask.');
      const client = createWalletClient({ transport: custom(provider) });
      const [wallet] = await client.requestAddresses();
      if (!wallet) throw new Error('No wallet account was selected.');
      if (authEnabled) {
        const challengeResponse = await fetch('/api/auth/challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: wallet }),
        });
        const challenge = await challengeResponse.json();
        if (!challengeResponse.ok) throw new Error(challenge.message);
        const signature = await client.signMessage({ account: wallet, message: challenge.message });
        const response = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nonce: challenge.nonce, signature }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        csrf.current = result.csrf;
        setAuthenticated(true);
        await load();
      }
      setAddress(wallet);
      setNotice(
        authEnabled
          ? 'Owner wallet verified. You can review and sign fixture batches.'
          : 'Wallet connected. Configure the workspace owner to enable signed login.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Wallet connection failed.');
    } finally {
      setBusy('');
    }
  }
  const load = useCallback(async () => {
    const health = await fetch('/api/health', { cache: 'no-store' });
    if (health.ok && (await health.json()).mode === 'arc-testnet') {
      window.location.replace('/testnet');
      return;
    }
    const sessionResponse = await fetch('/api/auth/session', { cache: 'no-store' });
    if (!sessionResponse.ok)
      throw new Error('Could not verify the owner session. Check that the API is running.');
    const session = await sessionResponse.json();
    setAuthEnabled(session.enabled);
    setOwner(session.owner);
    setAuthenticated(!!session.wallet);
    csrf.current = session.csrf ?? '';
    if (session.wallet) setAddress(session.wallet);
    if (session.enabled && !session.wallet) {
      setAddress(null);
      setData(null);
      return;
    }
    const response = await fetch('/api/workspace', { cache: 'no-store' });
    if (!response.ok)
      throw new Error('Could not load your workspace. Check that the API is running.');
    setData(await response.json());
  }, []);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    const saved = localStorage.getItem('splitt-project');
    if (saved) setProjectId(saved);
  }, [load]);
  const selectProject = (id: string) => {
    setProjectId(id);
    localStorage.setItem('splitt-project', id);
  };
  const action = async (path: string, body: unknown = {}, success = '', close = true) => {
    setBusy(path);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-splitt-csrf': csrf.current },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'Operation failed.');
      await load();
      if (success) setNotice(success);
      if (close) setModal(null);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed.');
    } finally {
      setBusy('');
    }
  };
  const project = data?.projects.find((p) => p.id === projectId) ?? data?.projects[0];
  const facts = project && data ? buildFacts(project, new Date(data.now)) : null;
  const plan = data?.plans.filter((p) => p.projectId === project?.id).at(-1);
  const totalPaid =
    project?.commitments.reduce((sum, c) => sum + BigInt(c.paid), 0n).toString() ?? '0';
  const obligations =
    project?.commitments
      .reduce((sum, c) => sum + BigInt(c.maximum) - BigInt(c.paid), 0n)
      .toString() ?? '0';
  const projectPayments =
    data?.payments.filter((p) => p.projectId === project?.id || p.status === 'ambiguous') ?? [];
  const ledger =
    data?.ledger
      .filter((e) => e.projectId === project?.id)
      .slice()
      .reverse() ?? [];
  const pending = data?.payments.filter((p) => p.status === 'ambiguous').length ?? 0;
  const generate = () =>
    project && action(`/projects/${project.id}/replan`, {}, 'Allocation ready for review.');
  async function reviewSignature() {
    if (!plan) return;
    const result = await action(`/plans/${plan.id}/prepare`, {}, '', false);
    if (result?.approval) {
      setPreparedBatch(result.approval);
      setModal('sign');
    }
  }
  async function signBatch() {
    if (!plan || !address || !preparedBatch) {
      setError('Sign in with the owner wallet and review this batch first.');
      return;
    }
    setBusy('sign-batch');
    setError('');
    setNotice('');
    try {
      const provider = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
      if (!provider) throw new Error('Open this page with your browser wallet installed.');
      const client = createWalletClient({ transport: custom(provider) });
      const [active] = await client.getAddresses();
      if (!active || active.toLowerCase() !== address.toLowerCase())
        throw new Error(
          'Wallet account changed. Disconnect and sign in with the owner wallet again.',
        );
      if ((await client.getChainId()) !== 5042002)
        throw new Error('Switch your wallet to Arc Testnet (chain 5042002), then sign again.');
      const a = preparedBatch;
      const signature = await client.signTypedData({
        account: active,
        domain: a.domain,
        types: authorizationTypes,
        primaryType: 'PlanAuthorization',
        message: {
          ...a.message,
          projectVersion: BigInt(a.message.projectVersion),
          deadline: BigInt(a.message.deadline),
        },
      });
      const approved = await fetch(`/api/plans/${plan.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-splitt-csrf': csrf.current },
        body: JSON.stringify({ signature }),
      });
      const result = await approved.json();
      if (!approved.ok) throw new Error(result.message);
      await load();
      setModal(null);
      setPreparedBatch(null);
      setNotice(
        'Exact fixture batch signed and saved. This signature cannot execute a live payout.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Batch signing failed.');
    } finally {
      setBusy('');
    }
  }
  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (key: string) => String(form.get(key) ?? '');
    try {
      if (modal === 'project') {
        const result = await action(
          '/projects',
          {
            name: field('name'),
            client: field('client'),
            clientWallet: field('clientWallet'),
            invoiceRef: field('invoiceRef'),
            invoiceTotal: parseUSDC(field('invoiceTotal')),
            reserve: parseUSDC(field('reserve')),
            perPayment: parseUSDC(field('perPayment')),
            perDay: parseUSDC(field('perDay')),
          },
          'Project created in your local workspace.',
        );
        if (result?.id) selectProject(result.id);
      }
      if (modal === 'commitment' && project)
        await action(
          `/projects/${project.id}/commitments`,
          {
            name: field('name'),
            role: field('role'),
            payee: field('payee'),
            maximum: parseUSDC(field('maximum')),
            dueDate: field('dueDate'),
            deferUntil: field('deferUntil') || null,
            accepted: form.has('accepted'),
            partialAllowed: form.has('partialAllowed'),
            blocksDelivery: form.has('blocksDelivery'),
          },
          'Commitment added.',
        );
      if (modal === 'payment' && project)
        await action(
          `/projects/${project.id}/payments`,
          { amount: parseUSDC(field('amount')), unknown: form.has('unknown') },
          'Fixture payment recorded. No real funds moved.',
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check the form fields.');
    }
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
          </span>
          splitt<span className="brand-period">.</span>
        </Link>
        <div className="workspace-label">
          <span className="avatar small">S</span>
          <div>
            <strong>Studio workspace</strong>
            <span>Owner account</span>
          </div>
        </div>
        <div className="nav-label">Workspace</div>
        <nav aria-label="Main navigation">
          {nav.map((item) => (
            <Link
              href={item.key === 'overview' ? '/workspace' : `/${item.key}`}
              key={item.key}
              className={`nav-item ${section === item.key ? 'selected' : ''}`}
              aria-current={section === item.key ? 'page' : undefined}
            >
              <item.icon weight={section === item.key ? 'fill' : 'regular'} size={19} />
              {item.label}
              {item.key === 'payments' && pending > 0 && <span className="count">{pending}</span>}
            </Link>
          ))}
        </nav>
        <div className="side-project-title">
          <span className="nav-label">Your projects</span>
          <button
            className="icon-button"
            aria-label="Create project"
            onClick={() => setModal('project')}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="side-projects">
          {data?.projects.map((p, index) => (
            <button
              key={p.id}
              className={`project-link ${project?.id === p.id ? 'active' : ''}`}
              onClick={() => selectProject(p.id)}
            >
              <span className={`project-dot dot-${index % 3}`} />
              {p.name}
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="protected-note">
            <ShieldCheck size={22} weight="duotone" />
            <div>
              <strong>Every project, protected.</strong>
              <p>
                Funds stay with the project
                <br />
                they belong to.
              </p>
            </div>
          </div>
          <button className="nav-item settings" onClick={() => setModal('settings')}>
            <GearSix size={19} />
            Workspace settings
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <Link href="/" aria-label="Splitt home">
              Splitt
            </Link>
            <span>/</span>
            <strong>{nav.find((n) => n.key === section)?.label}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button mobile-settings"
              aria-label="Workspace settings"
              onClick={() => setModal('settings')}
            >
              <GearSix size={18} />
            </button>
            <Badge tone="amber">Local fixture</Badge>
            <button className="wallet-button" disabled={!!busy} onClick={connectWallet}>
              <Wallet size={17} />
              {address
                ? `${authenticated ? 'Owner · ' : ''}${address.slice(0, 6)}…${address.slice(-4)}`
                : authEnabled
                  ? 'Sign in as owner'
                  : 'Connect wallet'}
            </button>
            <span className="avatar">HA</span>
          </div>
        </header>
        <main>
          <div className="fixture-banner">
            <ShieldCheck size={17} />
            <span>
              Explore Splitt with sample data. Payments are simulated locally; no USDC moves
              on-chain.
            </span>
            <button
              onClick={() => action('/fixture/reset', {}, 'Sample workspace reset.')}
              disabled={!!busy}
              hidden={data?.storage === 'postgres' || (authEnabled && !authenticated)}
            >
              Reset demo <ArrowsClockwise size={14} />
            </button>
          </div>
          {authEnabled && !authenticated && (
            <div className="feedback" role="status">
              <ShieldCheck size={20} />
              <span>
                Sign in with the workspace owner wallet to open your projects.{' '}
                {owner ? `${owner.slice(0, 6)}…${owner.slice(-4)}` : ''}
              </span>
              <button className="button secondary" disabled={!!busy} onClick={connectWallet}>
                Sign in
              </button>
            </div>
          )}
          {error && (
            <div role="alert" className="feedback error">
              <WarningCircle size={20} />
              <span>{error}</span>
              <button
                className="icon-button"
                onClick={() => {
                  setError('');
                  if (!data) void load().catch((e) => setError(e.message));
                }}
                aria-label={data ? 'Dismiss error' : 'Retry loading'}
              >
                {data ? <X /> : <ArrowsClockwise />}
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="feedback success">
              <CheckCircle size={20} />
              <span>{notice}</span>
              <button
                className="icon-button"
                onClick={() => setNotice('')}
                aria-label="Dismiss notice"
              >
                <X />
              </button>
            </div>
          )}
          {authEnabled && !authenticated ? (
            <div className="empty-state">
              <ShieldCheck size={32} />
              <h2>Your payment workspace is private</h2>
              <p>
                Verify ownership with a wallet signature to view projects and review allocations.
              </p>
            </div>
          ) : !data || !project || !facts ? (
            <div className="loading" aria-busy="true">
              <div className="skeleton wide" />
              <div className="skeleton medium" />
              <div className="skeleton tall" />
              <p>Loading your payment workspace…</p>
            </div>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {section === 'metrics' ? 'Workspace insights' : project.client}
                  </p>
                  <h1>
                    {section === 'overview'
                      ? project.name
                      : section === 'payments'
                        ? 'Incoming payments'
                        : section === 'allocation'
                          ? 'Allocation review'
                          : section === 'settlement'
                            ? 'Settlement'
                            : 'Activity and metrics'}
                  </h1>
                  <p className="subtitle">
                    {section === 'overview'
                      ? 'Track receipts, outstanding obligations and available funds.'
                      : section === 'payments'
                        ? 'Match arrivals to the right project before allocating funds.'
                        : section === 'allocation'
                          ? 'Review proposed contractor payments before approval.'
                          : section === 'settlement'
                            ? 'Payment decisions and their settlement, in one place.'
                            : 'Sample activity is kept separate from real adoption.'}
                  </p>
                </div>
                <div className="heading-actions">
                  {section === 'overview' && (
                    <>
                      <button className="button secondary" onClick={() => setModal('payment')}>
                        <Plus size={17} />
                        Add payment
                      </button>
                      <button className="button primary" onClick={() => setModal('project')}>
                        <Plus size={17} />
                        New project
                      </button>
                    </>
                  )}
                  {section === 'allocation' && (
                    <button
                      className="button primary"
                      onClick={generate}
                      disabled={!!busy || project.unresolved || project.paused}
                    >
                      <Lightning size={17} weight="fill" />
                      {busy.includes('replan') ? 'Building plan…' : 'Generate allocation'}
                    </button>
                  )}
                </div>
              </div>
              {section !== 'metrics' && (
                <div className="project-context">
                  <select
                    className="context-project-select"
                    aria-label="Active project"
                    value={project.id}
                    onChange={(event) => selectProject(event.target.value)}
                  >
                    {data.projects.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <span>
                    <FolderSimple size={16} />
                    {project.name}
                  </span>
                  <span>Invoice {project.invoiceRef}</span>
                  <Badge tone={project.paused ? 'amber' : 'green'}>
                    {project.paused ? 'Paused' : 'Active project'}
                  </Badge>
                  <span className="context-right">USDC · Arc target</span>
                </div>
              )}

              {section === 'overview' && (
                <>
                  <div className="stats-row">
                    <Stat
                      label="Client payments"
                      value={project.received}
                      note={`of ${money(project.invoiceTotal)} invoiced`}
                    />
                    <Stat
                      label="Protected reserve"
                      value={project.reserve}
                      note="Held within this project"
                      shield
                    />
                    <Stat
                      label="Ready to allocate"
                      value={facts.spendable}
                      note="After reserve & daily limits"
                      accent
                    />
                    <Stat
                      label="Contractors paid"
                      value={totalPaid}
                      note={`${money(obligations)} still outstanding`}
                    />
                  </div>
                  <div className="overview-grid">
                    <div className="panel cash-panel">
                      <div className="panel-heading">
                        <h2>Project balance</h2>
                      </div>
                      <p className="large-balance">
                        {money(project.balance)}
                        <span>USDC</span>
                      </p>
                      <CashBar
                        balance={project.balance}
                        reserve={project.reserve}
                        paid={totalPaid}
                      />
                      <div className="cash-legend">
                        <span>
                          <i className="legend-dot ready" />
                          Above reserve{' '}
                          {money(
                            (BigInt(project.balance) > BigInt(project.reserve)
                              ? BigInt(project.balance) - BigInt(project.reserve)
                              : 0n
                            ).toString(),
                          )}
                        </span>
                        <span>
                          <i className="legend-dot reserve" />
                          Reserve {money(project.reserve)}
                        </span>
                        <span>
                          <i className="legend-dot paid" />
                          Paid {money(totalPaid)}
                        </span>
                      </div>
                      <div className="cash-action">
                        <div>
                          <strong>
                            {BigInt(obligations) === 0n && project.commitments.length > 0
                              ? 'Every contractor obligation is settled.'
                              : BigInt(facts.spendable) > 0n
                                ? 'Funds are available for allocation.'
                                : 'Your reserve is protected.'}
                          </strong>
                          <p>
                            {project.unresolved
                              ? 'Reconcile the unresolved batch before continuing.'
                              : project.paused
                                ? 'Resume the project to generate a payment plan.'
                                : BigInt(obligations) === 0n && project.commitments.length > 0
                                  ? 'The remaining balance stays with this project.'
                                  : 'Review contractor amounts before approval.'}
                          </p>
                        </div>
                        <Link href="/allocation" className="button primary">
                          Review allocation
                        </Link>
                      </div>
                    </div>
                    <div className="panel latest-payment">
                      <div className="panel-heading">
                        <h2>Latest arrival</h2>
                        <ArrowDownLeft size={22} />
                      </div>
                      {projectPayments.filter((p) => p.status === 'confirmed').length ? (
                        <>
                          <Badge tone="green">Matched to invoice</Badge>
                          <p className="arrival-amount">
                            +
                            {money(
                              projectPayments.filter((p) => p.status === 'confirmed').at(-1)!
                                .amount,
                            )}
                            <span>USDC</span>
                          </p>
                          <p className="muted">{project.client}</p>
                          <div className="receipt-details">
                            <span>
                              Invoice<strong>{project.invoiceRef}</strong>
                            </span>
                            <span>
                              Route<strong>Local fixture</strong>
                            </span>
                            <span>
                              Received
                              <strong>
                                {new Date(projectPayments.at(-1)!.at).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </strong>
                            </span>
                          </div>
                          <Link href="/payments" className="text-link">
                            View payment details
                          </Link>
                        </>
                      ) : (
                        <Empty
                          title="No payments yet"
                          detail="Add a fixture arrival to test allocation."
                          action={() => setModal('payment')}
                          label="Add payment"
                        />
                      )}
                    </div>
                  </div>
                  <div className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Contractor commitments</h2>
                        <p>Approved obligations, with agreed payment terms.</p>
                      </div>
                      <button className="button secondary" onClick={() => setModal('commitment')}>
                        <Plus size={16} />
                        Add commitment
                      </button>
                    </div>
                    <Commitments project={project} />
                  </div>
                  <div className="bottom-note">
                    <ShieldCheck size={19} />
                    {data.projects.length} projects, separate balances. Available funds from another
                    project never enter this allocation.
                    <button
                      className="text-link"
                      onClick={() =>
                        action(
                          `/projects/${project.id}/pause`,
                          {},
                          project.paused ? 'Project resumed.' : 'Project paused.',
                        )
                      }
                    >
                      {project.paused ? 'Resume project' : 'Pause project'}
                    </button>
                  </div>
                </>
              )}

              {section === 'payments' && (
                <>
                  <div className="section-toolbar">
                    <p>
                      {pending
                        ? `${pending} arrival needs your confirmation.`
                        : 'All arrivals have been matched.'}
                    </p>
                    <button className="button primary" onClick={() => setModal('payment')}>
                      <Plus size={17} />
                      Add fixture payment
                    </button>
                  </div>
                  <div className="panel table-panel">
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Payment</th>
                            <th>Invoice</th>
                            <th>Amount</th>
                            <th>Attribution</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projectPayments
                            .slice()
                            .reverse()
                            .map((p) => (
                              <tr key={p.id}>
                                <td>
                                  <strong>
                                    {p.status === 'ambiguous' ? 'Unknown sender' : project.client}
                                  </strong>
                                  <small>
                                    {new Date(p.at).toLocaleDateString()} · local fixture
                                  </small>
                                </td>
                                <td>{p.invoice}</td>
                                <td className="money-cell">
                                  {money(p.amount)} <small>USDC</small>
                                </td>
                                <td>
                                  <Badge tone={p.status === 'confirmed' ? 'green' : 'amber'}>
                                    {p.status === 'confirmed' ? 'Confirmed' : 'Needs review'}
                                  </Badge>
                                </td>
                                <td>
                                  {p.status === 'ambiguous' ? (
                                    <button
                                      className="button secondary"
                                      disabled={!!busy}
                                      onClick={() =>
                                        action(
                                          `/payments/${p.id}/confirm`,
                                          { projectId: project.id },
                                          'Payment matched to this project.',
                                        )
                                      }
                                    >
                                      Confirm for this project
                                    </button>
                                  ) : (
                                    <CheckCircle className="green-icon" size={20} />
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    {!projectPayments.length && (
                      <Empty
                        title="No incoming payments"
                        detail="Add an arrival to start the allocation flow."
                        action={() => setModal('payment')}
                        label="Add payment"
                      />
                    )}
                  </div>
                  <div className="info-note">
                    <ShieldCheck size={22} />
                    <div>
                      <strong>Unknown arrivals stay unallocated.</strong>
                      <p>
                        A wallet address or an amount alone is not proof of which invoice a payment
                        belongs to. You decide where it goes.
                      </p>
                    </div>
                  </div>
                </>
              )}

              {section === 'allocation' &&
                (!plan ? (
                  <div className="empty-plan panel">
                    <span className="empty-icon">
                      <Stack size={34} weight="duotone" />
                    </span>
                    <h2>No allocation yet</h2>
                    <p>
                      {money(facts.spendable)} USDC is available after this project’s reserve and
                      daily limits. Generate a proposal to review contractor payments.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="allocation-grid">
                      <div>
                        <div className="plan-header">
                          <Badge tone={plan.validation.ok ? 'green' : 'amber'}>
                            <ShieldCheck size={14} />
                            {plan.validation.ok ? 'Validator passed' : 'Review required'}
                          </Badge>
                          <span>
                            {plan.fallbackUsed ? 'Baseline proposal' : 'Model proposal'} ·{' '}
                            {plan.status.replaceAll('_', ' ')}
                          </span>
                        </div>
                        {plan.output.items.map((item, index) => {
                          const c = project.commitments.find((c) => c.id === item.commitment_id)!;
                          return (
                            <div className="panel allocation-item" key={item.commitment_id}>
                              <div className="allocation-item-top">
                                <span className="rank">{String(index + 1).padStart(2, '0')}</span>
                                <span className="avatar contractor">
                                  {c.name
                                    .split(' ')
                                    .map((n) => n[0])
                                    .join('')}
                                </span>
                                <div className="grow">
                                  <h3>{c.name}</h3>
                                  <p>{c.role}</p>
                                </div>
                                <div className="item-amount">
                                  {item.action === 'pay' ? money(item.amount_micro) : 'Deferred'}
                                  <span>
                                    {item.action === 'pay'
                                      ? 'USDC proposed'
                                      : `Until ${c.deferUntil}`}
                                  </span>
                                </div>
                              </div>
                              <p className="reason">{item.explanation}</p>
                              <div className="reason-tags">
                                {item.reason_codes.map((code) => (
                                  <Badge
                                    key={code}
                                    tone={code === 'BLOCKS_DELIVERY' ? 'green' : 'neutral'}
                                  >
                                    {code.toLowerCase().replaceAll('_', ' ')}
                                  </Badge>
                                ))}
                              </div>
                              <div className="fact-references">
                                Evidence {item.fact_refs.join(' · ')}
                              </div>
                            </div>
                          );
                        })}
                        {!plan.output.items.length && (
                          <Empty
                            title="No eligible payments"
                            detail="Review the shortfall and policy limits, or add an accepted commitment."
                          />
                        )}
                        {plan.output.escalations.map((e, i) => (
                          <div className="feedback error" key={i}>
                            <WarningCircle size={20} />
                            <span>{e.detail}</span>
                          </div>
                        ))}
                        <button className="text-link" onClick={() => setShowFacts(!showFacts)}>
                          {showFacts ? 'Hide' : 'Inspect'} the facts & hashes{' '}
                          <DotsThree size={22} />
                        </button>
                        {showFacts && (
                          <div className="panel evidence">
                            <p className="muted">Model: {plan.model}</p>
                            <pre>
                              {JSON.stringify(
                                {
                                  facts: plan.facts.facts,
                                  factsHash: plan.factsHash,
                                  planHash: plan.planHash,
                                  validator: plan.validation,
                                },
                                null,
                                2,
                              )}
                            </pre>
                          </div>
                        )}
                      </div>
                      <aside className="panel plan-summary">
                        <span className="little-label">Allocation summary</span>
                        <h2>
                          {money(plan.validation.total)}
                          <span>USDC proposed</span>
                        </h2>
                        <div className="summary-row">
                          <span>Project balance</span>
                          <strong>{money(project.balance)}</strong>
                        </div>
                        <div className="summary-row">
                          <span>Required reserve</span>
                          <strong>{money(project.reserve)}</strong>
                        </div>
                        <div className="summary-row">
                          <span>Payments in plan</span>
                          <strong>
                            {plan.output.items.filter((i) => i.action === 'pay').length}
                          </strong>
                        </div>
                        <div className="summary-row total">
                          <span>
                            {plan.status === 'done' || plan.status === 'unresolved'
                              ? 'Current balance'
                              : 'Balance after plan'}
                          </span>
                          <strong>
                            {money(
                              (plan.status === 'done' || plan.status === 'unresolved'
                                ? BigInt(project.balance)
                                : BigInt(project.balance) - BigInt(plan.validation.total)
                              ).toString(),
                            )}
                          </strong>
                        </div>
                        <div className="reserve-ok">
                          <ShieldCheck size={18} />
                          Reserve remains protected
                        </div>
                        <p className="summary-disclosure">
                          {plan.fallbackUsed
                            ? 'Planner: deterministic baseline.'
                            : 'Model proposal checked against deterministic payment rules.'}
                        </p>
                        <button
                          className="button primary full"
                          disabled={
                            !!busy ||
                            plan.status !== 'awaiting_owner' ||
                            !plan.validation.ok ||
                            BigInt(plan.validation.total) === 0n
                          }
                          onClick={() => setModal('simulate')}
                        >
                          {plan.status === 'done' ? (
                            <>
                              <Check size={17} />
                              Simulation complete
                            </>
                          ) : plan.status === 'unresolved' ? (
                            'Confirmation unresolved'
                          ) : plan.status === 'stale' ? (
                            'Generate a fresh plan'
                          ) : (
                            <>Review & simulate</>
                          )}
                        </button>
                        <p className="micro-note">
                          Fixture only. Live payouts require a signed owner authorization.
                        </p>
                        {data?.approvalEnabled && (
                          <>
                            <button
                              className="button secondary full"
                              disabled={
                                !!busy ||
                                plan.status !== 'awaiting_owner' ||
                                !!plan.approval?.signature ||
                                !plan.validation.ok ||
                                BigInt(plan.validation.total) === 0n
                              }
                              onClick={reviewSignature}
                            >
                              <ShieldCheck size={17} />
                              {plan.approval?.signature
                                ? 'Owner signature saved'
                                : busy === 'sign-batch'
                                  ? 'Waiting for wallet…'
                                  : 'Sign exact fixture batch'}
                            </button>
                            <p className="micro-note">
                              15-minute approval window. Fixture signatures cannot send USDC.
                            </p>
                          </>
                        )}
                      </aside>
                    </div>
                  </>
                ))}

              {section === 'settlement' && (
                <>
                  <div className="stats-row three">
                    <Stat
                      label="Confirmed fixture payouts"
                      value={totalPaid}
                      note="Local simulation only"
                    />
                    <Stat label="Project balance" value={project.balance} note="Reserve included" />
                    <div className="stat">
                      <span>Settlement status</span>
                      <strong className="status-value">
                        {project.unresolved ? 'Needs recovery' : 'Reconciled'}
                      </strong>
                      <p>
                        {project.unresolved
                          ? 'One batch waiting for confirmation'
                          : 'No unresolved batches'}
                      </p>
                    </div>
                  </div>
                  {project.unresolved && plan && (
                    <div className="recovery-banner">
                      <WarningCircle size={24} />
                      <div>
                        <strong>Confirm the original batch before paying again.</strong>
                        <p>
                          A callback was interrupted. Reconciliation recovers its result without
                          issuing another payment.
                        </p>
                      </div>
                      <button
                        className="button primary"
                        disabled={!!busy}
                        onClick={() =>
                          action(
                            `/plans/${plan.id}/reconcile`,
                            {},
                            'Original fixture batch recovered. No duplicate payment.',
                          )
                        }
                      >
                        Reconcile batch
                      </button>
                    </div>
                  )}
                  <div className="panel">
                    <div className="panel-heading">
                      <h2>Project timeline</h2>
                      <Badge>Hash-linked local log</Badge>
                    </div>
                    {ledger.length ? (
                      <div className="timeline">
                        {ledger.map((entry) => (
                          <div className="timeline-item" key={entry.id}>
                            <div className="timeline-symbol">
                              <CheckCircle size={20} weight="fill" />
                            </div>
                            <div className="grow">
                              <strong>{entry.event}</strong>
                              <p>{entry.detail}</p>
                              <small>
                                {new Date(entry.at).toLocaleString()} · {entry.hash.slice(0, 14)}…
                              </small>
                            </div>
                            {entry.amount !== '0' && (
                              <strong className="timeline-amount">
                                {money(entry.amount)} <small>USDC</small>
                              </strong>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty
                        title="Your payment story starts here"
                        detail="Generate and simulate a plan to see the settlement timeline."
                      />
                    )}
                  </div>
                </>
              )}

              {section === 'metrics' && (
                <>
                  <div className="stats-row">
                    <div className="stat">
                      <span>Real pilot businesses</span>
                      <strong>0</strong>
                      <p>No pilot confirmed yet</p>
                    </div>
                    <div className="stat">
                      <span>Fixture projects</span>
                      <strong>{data.projects.length}</strong>
                      <p>Sample data, excluded from traction</p>
                    </div>
                    <div className="stat">
                      <span>Plans reviewed</span>
                      <strong>
                        {data.plans.filter((p) => ['done', 'unresolved'].includes(p.status)).length}
                      </strong>
                      <p>Local fixture approvals</p>
                    </div>
                    <div className="stat">
                      <span>Recovered settlements</span>
                      <strong>
                        {data.ledger.filter((e) => e.event === 'Settlement recovered').length}
                      </strong>
                      <p>Fixture fault-injection recoveries</p>
                    </div>
                  </div>
                  <div className="panel">
                    <div className="panel-heading">
                      <h2>Activity by source</h2>
                      <Badge>Measured, not estimated</Badge>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Source</th>
                            <th>Projects</th>
                            <th>USDC received</th>
                            <th>USDC paid</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>
                              <strong>Real pilot</strong>
                            </td>
                            <td>0</td>
                            <td>0</td>
                            <td>0</td>
                            <td>
                              <Badge>Awaiting pilot</Badge>
                            </td>
                          </tr>
                          <tr>
                            <td>
                              <strong>Mirrored pilot</strong>
                            </td>
                            <td>0</td>
                            <td>0</td>
                            <td>0</td>
                            <td>
                              <Badge>Not started</Badge>
                            </td>
                          </tr>
                          <tr>
                            <td>
                              <strong>Local fixtures</strong>
                            </td>
                            <td>{data.projects.length}</td>
                            <td>
                              {money(
                                data.projects
                                  .reduce((s, p) => s + BigInt(p.received), 0n)
                                  .toString(),
                              )}
                            </td>
                            <td>
                              {money(
                                data.projects
                                  .reduce(
                                    (s, p) =>
                                      s + p.commitments.reduce((a, c) => a + BigInt(c.paid), 0n),
                                    0n,
                                  )
                                  .toString(),
                              )}
                            </td>
                            <td>
                              <Badge tone="amber">Simulated</Badge>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="info-note">
                    <ChartBar size={24} />
                    <div>
                      <strong>Traction starts with a real business.</strong>
                      <p>
                        Fixtures, wallet connections, and test transactions do not count as
                        customers. Pilot metrics will be added when an actual workflow is onboarded.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </main>
        <SiteFooter fit="app" />
      </div>
      {modal && (
        <Modal
          title={
            modal === 'project'
              ? 'Create a project'
              : modal === 'commitment'
                ? 'Add a contractor commitment'
                : modal === 'payment'
                  ? 'Add a fixture payment'
                  : modal === 'simulate'
                    ? 'Review this simulated batch'
                    : modal === 'sign'
                      ? 'Review owner authorization'
                      : 'Workspace settings'
          }
          close={() => {
            setModal(null);
            setError('');
          }}
        >
          {error && (
            <div className="feedback error" role="alert">
              {error}
            </div>
          )}
          {['project', 'commitment', 'payment'].includes(modal) && (
            <form onSubmit={submitForm}>
              <p className="form-note">
                This changes your local fixture workspace. No contract transaction is sent.
              </p>
              {modal === 'project' && (
                <>
                  <Field label="Project name" name="name" />
                  <Field label="Client name" name="client" />
                  <Field label="Client wallet address" name="clientWallet" />
                  <div className="form-grid">
                    <Field label="Invoice reference" name="invoiceRef" />
                    <Field label="Invoice total (USDC)" name="invoiceTotal" />
                    <Field label="Protected reserve (USDC)" name="reserve" value="300" />
                    <Field label="Per-payment cap (USDC)" name="perPayment" value="1000" />
                    <Field label="Daily cap (USDC)" name="perDay" value="1500" />
                  </div>
                </>
              )}
              {modal === 'commitment' && (
                <>
                  <Field label="Contractor name" name="name" />
                  <Field label="Work or role" name="role" />
                  <Field label="Payee wallet address" name="payee" />
                  <div className="form-grid">
                    <Field label="Agreed amount (USDC)" name="maximum" />
                    <Field label="Due date" name="dueDate" type="date" value="2026-10-03" />
                    <Field
                      label="Deferral permitted until (optional)"
                      name="deferUntil"
                      type="date"
                      required={false}
                    />
                  </div>
                  <label className="check-field">
                    <input type="checkbox" name="accepted" defaultChecked />
                    Work has been accepted
                  </label>
                  <label className="check-field">
                    <input type="checkbox" name="partialAllowed" />
                    The agreement allows partial payments
                  </label>
                  <label className="check-field">
                    <input type="checkbox" name="blocksDelivery" />
                    Payment unlocks the next delivery
                  </label>
                </>
              )}
              {modal === 'payment' && (
                <>
                  <Field label="Payment amount (USDC)" name="amount" value="800" />
                  <label className="check-field">
                    <input name="unknown" type="checkbox" />
                    Unknown sender: leave it unattributed
                  </label>
                  <p className="form-note">
                    The demo remainder is 800 USDC. Add it after the first allocation to test
                    replanning.
                  </p>
                </>
              )}
              <div className="dialog-actions">
                <button type="button" className="button secondary" onClick={() => setModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="button primary" disabled={!!busy}>
                  {busy
                    ? 'Saving…'
                    : modal === 'project'
                      ? 'Create project'
                      : modal === 'commitment'
                        ? 'Add commitment'
                        : 'Record fixture payment'}
                </button>
              </div>
            </form>
          )}
          {modal === 'simulate' && plan && project && (
            <>
              <p className="form-note">
                Review the recipients and amounts below. This is a local simulation, with no wallet
                signature and no money movement.
              </p>
              {plan.output.items
                .filter((i) => i.action === 'pay')
                .map((i) => (
                  <div key={i.commitment_id} className="summary-row">
                    <span>{project.commitments.find((c) => c.id === i.commitment_id)?.name}</span>
                    <strong>{money(i.amount_micro)} USDC</strong>
                  </div>
                ))}
              <div className="summary-row total">
                <span>Batch total</span>
                <strong>{money(plan.validation.total)} USDC</strong>
              </div>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={interrupt}
                  onChange={(e) => setInterrupt(e.target.checked)}
                />
                Interrupt the confirmation callback to test recovery
              </label>
              <div className="dialog-actions">
                <button className="button secondary" onClick={() => setModal(null)}>
                  Back to review
                </button>
                <button
                  className="button primary"
                  disabled={!!busy}
                  onClick={() =>
                    action(
                      `/plans/${plan.id}/simulate`,
                      { interrupt },
                      interrupt
                        ? 'Fixture batch settled; confirmation interrupted. Reconcile on the Settlement screen.'
                        : 'Fixture batch completed. No real funds moved.',
                    )
                  }
                >
                  {busy ? 'Simulating…' : 'Simulate this batch'}
                </button>
              </div>
            </>
          )}
          {modal === 'sign' && preparedBatch && project && (
            <>
              <p className="form-note">
                Sign these exact recipients and amounts. This uses the non-executable Splitt Fixture
                domain and sends no transaction.
              </p>
              {preparedBatch.items.map((item) => {
                const commitment = project.commitments.find(
                  (c) => c.onchainId === item.commitmentId,
                );
                return (
                  <div key={item.executionId} className="summary-row">
                    <span>
                      {commitment?.name ?? 'Unknown recipient'}
                      <small className="signature-address">{commitment?.payee}</small>
                    </span>
                    <strong>{money(item.amount)} USDC</strong>
                  </div>
                );
              })}
              <div className="summary-row total">
                <span>Batch total</span>
                <strong>
                  {money(
                    preparedBatch.items
                      .reduce((sum, item) => sum + BigInt(item.amount), 0n)
                      .toString(),
                  )}{' '}
                  USDC
                </strong>
              </div>
              <div className="settings-list">
                <span>
                  Network<strong>Arc Testnet · {preparedBatch.domain.chainId}</strong>
                </span>
                <span>
                  Signing domain<strong>{preparedBatch.domain.name}</strong>
                </span>
                <span>
                  Project version<strong>{preparedBatch.message.projectVersion}</strong>
                </span>
                <span>
                  Expires
                  <strong>
                    {new Date(Number(preparedBatch.message.deadline) * 1000).toLocaleString()}
                  </strong>
                </span>
                <span>
                  Vault reference
                  <strong className="signature-address">
                    {preparedBatch.domain.verifyingContract}
                  </strong>
                </span>
                <span>
                  Plan hash
                  <strong className="signature-address">{preparedBatch.message.planHash}</strong>
                </span>
              </div>
              <div className="dialog-actions">
                <button className="button secondary" onClick={() => setModal(null)}>
                  Back to review
                </button>
                <button className="button primary" disabled={!!busy} onClick={signBatch}>
                  {busy ? 'Waiting for wallet…' : 'Sign fixture authorization'}
                </button>
              </div>
            </>
          )}
          {modal === 'settings' && (
            <>
              <div className="settings-list">
                <span>
                  Current environment<strong>Local fixture</strong>
                </span>
                <span>
                  Settlement target<strong>Arc Testnet · 5042002</strong>
                </span>
                <span>
                  Connected wallet<strong>{address ?? 'Not connected'}</strong>
                </span>
                <span>
                  Owner authentication
                  <strong>
                    {authEnabled
                      ? authenticated
                        ? 'Verified owner session'
                        : 'Sign-in required'
                      : 'Configure OWNER_ADDRESS'}
                  </strong>
                </span>
                <span>
                  Workspace storage
                  <strong>
                    {data?.storage === 'postgres'
                      ? 'Postgres · durable audit trail'
                      : 'Local fixture file'}
                  </strong>
                </span>
                <span>
                  Batch signing
                  <strong>
                    {data?.approvalEnabled
                      ? 'Exact fixture batches · 15-minute window'
                      : 'Configure owner and vault addresses'}
                  </strong>
                </span>
                <span>
                  Live execution<strong>Not enabled</strong>
                </span>
                <span>
                  Approval policy<strong>Owner signature for every live batch</strong>
                </span>
              </div>
              <p className="form-note">
                Database persistence, owner sign-in, and fixture batch signing are available when
                configured. The separate testnet workspace requires a deployed vault, Circle
                credentials and PostgreSQL.
              </p>
              <Link href="/testnet" className="button secondary full">
                Open testnet workspace
              </Link>
              <button className="button secondary full" onClick={() => setModal(null)}>
                Return to workspace
              </button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  note,
  accent,
  shield,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
  shield?: boolean;
}) {
  return (
    <div className={`stat ${accent ? 'accent-stat' : ''}`}>
      <span>
        {label}
        {shield && <ShieldCheck size={15} />}
      </span>
      <strong>
        {money(value)}
        <small>USDC</small>
      </strong>
      <p>{note}</p>
    </div>
  );
}
function CashBar({ balance, reserve, paid }: { balance: string; reserve: string; paid: string }) {
  const total = BigInt(balance) + BigInt(paid);
  const available = BigInt(balance) > BigInt(reserve) ? BigInt(balance) - BigInt(reserve) : 0n;
  const protectedAmount = BigInt(balance) < BigInt(reserve) ? BigInt(balance) : BigInt(reserve);
  const width = (v: bigint) => `${total ? Number((v * 10000n) / total) / 100 : 0}%`;
  return (
    <div
      className="cash-bar"
      aria-label={`Project funds: ${money(available.toString())} available, ${money(protectedAmount.toString())} protected, ${money(paid)} paid`}
    >
      <span className="available-segment" style={{ width: width(available) }} />
      <span className="reserve-segment" style={{ width: width(protectedAmount) }} />
      <span className="paid-segment" style={{ width: width(BigInt(paid)) }} />
    </div>
  );
}
function Commitments({ project }: { project: Project }) {
  return project.commitments.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Contractor</th>
            <th>Agreed amount</th>
            <th>Paid / remaining</th>
            <th>Payment terms</th>
            <th>Work status</th>
          </tr>
        </thead>
        <tbody>
          {project.commitments.map((c) => (
            <tr key={c.id}>
              <td>
                <div className="contractor-cell">
                  <span className="avatar contractor">
                    {c.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </span>
                  <div>
                    <strong>{c.name}</strong>
                    <small>{c.role}</small>
                  </div>
                </div>
              </td>
              <td className="money-cell">
                {money(c.maximum)} <small>USDC</small>
              </td>
              <td>
                <strong>{money(c.paid)} paid</strong>
                <small>{money((BigInt(c.maximum) - BigInt(c.paid)).toString())} remaining</small>
              </td>
              <td>
                <Badge>{c.partialAllowed ? 'Partial allowed' : 'Full payment'}</Badge>
                <small>
                  Due{' '}
                  {new Date(c.dueDate + 'T12:00:00').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </small>
              </td>
              <td>
                <Badge tone={c.accepted ? 'green' : 'amber'}>
                  {c.accepted ? 'Accepted' : 'Pending'}
                </Badge>
                {c.blocksDelivery && (
                  <small className="delivery-label">
                    <Lightning size={12} weight="fill" />
                    Unlocks delivery
                  </small>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      title="No commitments yet"
      detail="Add an approved contractor obligation before generating a plan."
    />
  );
}
function Empty({
  title,
  detail,
  action,
  label,
}: {
  title: string;
  detail: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{detail}</p>
      {action && (
        <button className="button secondary" onClick={action}>
          {label}
        </button>
      )}
    </div>
  );
}
