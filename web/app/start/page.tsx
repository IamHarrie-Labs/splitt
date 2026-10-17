'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  defineChain,
  encodeFunctionData,
  erc20Abi,
  parseAbi,
  type Address,
  type Hex,
  type EIP1193Provider,
} from 'viem';
import { parseSiweMessage } from 'viem/siwe';
import { authorizationTypes, formatUSDC, idHash, parseUSDC, type Project } from '@splitt/core';
import { SELF_SERVE, vaultCreation } from '../../../packages/core/src/selfserve';
import type { LiveState } from '../../../server/src/live/repository';
import type { BatchApproval } from '../../../server/src/store';
import SiteHeader from '../site-header';
import SiteFooter from '../site-footer';
import './start.css';

const arc = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
  blockExplorers: {
    default: { name: 'Arc Testnet Explorer', url: 'https://explorer.testnet.arc.io' },
  },
});
const reader = createPublicClient({ chain: arc, transport: http() });
const setupAbi = parseAbi([
  'function createProject(bytes32,uint256,uint256,uint256)',
  'function projects(bytes32) view returns(uint256,uint256,uint256,uint256,uint64,bool)',
  'function commitments(bytes32) view returns(bytes32,address,uint256,uint256,uint64,bool,bool)',
  'function addCommitment(bytes32,bytes32,address,uint256,bool)',
  'function deposit(bytes32,bytes32,uint256)',
  'function ownerWithdraw(bytes32,uint256,address)',
]);
type Config = {
  chainId: number;
  operator: Address;
  delaySeconds: number;
  faucet: string;
  activity?: {
    controlledTests: { vaults: number; confirmedBatches: number; paidMicro: string };
    unverifiedTestnet: { vaults: number; confirmedBatches: number; paidMicro: string };
    verifiedBusinesses: number;
  };
};
type Vault = { vault: Address; owner: Address; deployment_tx: Hex; classification: string };
type Workspace = LiveState & { owner: Address; vault: Address; operator: Address };
type Metadata = Pick<
  Project,
  'id' | 'onchainId' | 'name' | 'client' | 'clientWallet' | 'invoiceRef' | 'invoiceTotal'
> & {
  commitments: Pick<
    Project['commitments'][number],
    | 'id'
    | 'onchainId'
    | 'name'
    | 'role'
    | 'payee'
    | 'maximum'
    | 'dueDate'
    | 'deferUntil'
    | 'accepted'
    | 'acceptedAt'
    | 'blocksDelivery'
    | 'partialAllowed'
    | 'dependsOn'
  >[];
};
type Setup = { metadata: Metadata; reserve: string };
const today = () => new Date().toLocaleDateString('en-CA');
export default function SelfServe() {
  const [config, setConfig] = useState<Config>(),
    [checking, setChecking] = useState(true),
    [wallet, setWallet] = useState<Address>(),
    [csrf, setCsrf] = useState(''),
    [vault, setVault] = useState<Vault>(),
    [workspace, setWorkspace] = useState<Workspace>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [setup, setSetup] = useState<Setup>(),
    [deposit, setDeposit] = useState('1.2'),
    [review, setReview] = useState<{ id: string; approval: BatchApproval }>(),
    [clock, setClock] = useState(Date.now());
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);
  async function api<T>(path: string, body?: unknown, token = csrf): Promise<T> {
    const response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-splitt-csrf': token },
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? 'Could not reach the testnet workspace.');
    return data;
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Request failed. Check the transaction before retrying.',
      );
    } finally {
      setBusy(false);
    }
  }
  const path = vault ? `/selfserve/vaults/${vault.vault}` : '';
  async function refresh(target = vault, token = csrf) {
    if (target)
      setWorkspace(
        await api<Workspace>(`/selfserve/vaults/${target.vault}/workspace`, undefined, token),
      );
  }
  async function loadVaults(token: string) {
    const list = await api<Vault[]>('/selfserve/vaults', undefined, token);
    setVault(list[0]);
    if (list[0]) await refresh(list[0], token);
    return list[0];
  }
  useEffect(() => {
    let active = true;
    void api<Config>('/selfserve/config')
      .then(async (cfg) => {
        if (!active) return;
        setConfig(cfg);
        const session = await api<{ wallet: Address | null; csrf: string | null }>('/auth/session');
        if (session.wallet && session.csrf && active) {
          setWallet(session.wallet);
          setCsrf(session.csrf);
          await loadVaults(session.csrf);
        }
      })
      .catch(() => {
        if (active)
          setError(
            'The public testnet workspace is not connected yet. The demo is available while deployment is completed.',
          );
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!vault) return;
    setPendingKeys(
      Object.keys(localStorage).filter(
        (key) =>
          key.startsWith('splitt:') &&
          key.includes(vault.vault) &&
          localStorage.getItem(key) === 'awaiting-wallet',
      ),
    );
  }, [vault, busy]);
  useEffect(() => {
    const provider = (
      window as Window & {
        ethereum?: {
          on?: (event: string, listener: (accounts: unknown) => void) => void;
          removeListener?: (event: string, listener: (accounts: unknown) => void) => void;
        };
      }
    ).ethereum;
    if (!wallet || !provider?.on) return;
    const changed = (accounts: unknown) => {
      if (
        Array.isArray(accounts) &&
        String(accounts[0] ?? '').toLowerCase() !== wallet.toLowerCase()
      ) {
        setWallet(undefined);
        setVault(undefined);
        setWorkspace(undefined);
        setSetup(undefined);
        setReview(undefined);
        setBusy(true);
        void api('/auth/logout', {}, csrf)
          .catch(() => setError('Wallet changed. Sign in again before continuing.'))
          .finally(() => {
            setCsrf('');
            setBusy(false);
          });
      }
    };
    provider.on('accountsChanged', changed);
    return () => provider.removeListener?.('accountsChanged', changed);
  }, [wallet, csrf]);
  useEffect(() => {
    if (!vault || !wallet) return;
    try {
      const stored = localStorage.getItem(`splitt:setup:${wallet.toLowerCase()}:${vault.vault}`);
      if (stored) setSetup(JSON.parse(stored));
    } catch {
      setError(
        'Could not recover the saved setup. Use its transaction hashes before creating another project.',
      );
    }
  }, [vault, wallet]);
  useEffect(() => {
    if (!vault || !csrf || busy) return;
    const timer = setInterval(
      () =>
        void refresh().catch(() =>
          setError('Could not refresh settlement. Check the connection before signing.'),
        ),
      8000,
    );
    return () => clearInterval(timer);
  }, [vault, csrf, busy]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function browserWallet() {
    const provider = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
    if (!provider) throw new Error('Open Splitt in a browser with MetaMask or Rabby installed.');
    const client = createWalletClient({ chain: arc, transport: custom(provider) });
    const [account] = await client.requestAddresses();
    if (!account) throw new Error('Select a wallet.');
    if (wallet && account.toLowerCase() !== wallet.toLowerCase())
      throw new Error('Switch to the signed-in wallet or sign out first.');
    if ((await client.getChainId()) !== 5042002) {
      try {
        await client.switchChain({ id: arc.id });
      } catch (error) {
        let cause = error as { code?: number; cause?: unknown };
        let missing = false;
        for (let i = 0; cause && i < 6; i++) {
          if (cause.code === 4902) missing = true;
          cause = cause.cause as typeof cause;
        }
        if (!missing) throw error;
        await client.addChain({ chain: arc });
        await client.switchChain({ id: arc.id });
      }
    }
    return { client, account };
  }
  async function connect() {
    const { client, account } = await browserWallet();
    const challenge = await api<{ nonce: string; message: string }>('/auth/challenge', {
      address: account,
    });
    const message = parseSiweMessage(challenge.message);
    if (
      message.domain !== window.location.host ||
      message.uri !== window.location.origin ||
      message.chainId !== arc.id ||
      message.nonce !== challenge.nonce ||
      message.address?.toLowerCase() !== account.toLowerCase()
    )
      throw new Error('The sign-in request does not match this website and wallet.');
    const result = await api<{ csrf: string }>('/auth/verify', {
      nonce: challenge.nonce,
      signature: await client.signMessage({ account, message: challenge.message }),
    });
    setWallet(account);
    setCsrf(result.csrf);
    await loadVaults(result.csrf);
    setStatus('Wallet connected. You control your vault and authorize every payout.');
  }
  async function logout() {
    await api('/auth/logout', {});
    setWallet(undefined);
    setCsrf('');
    setVault(undefined);
    setWorkspace(undefined);
    setSetup(undefined);
    setReview(undefined);
    setStatus('Signed out. Pending transaction hashes remain saved on this device.');
  }
  async function transaction(to: Address | undefined, data: Hex, key: string) {
    const { client, account } = await browserWallet();
    const saved = localStorage.getItem(key);
    if (saved === 'awaiting-wallet')
      throw new Error(
        'A transaction may have been submitted. Recover its hash before trying again.',
      );
    let hash = saved as Hex | null;
    if (!hash) {
      localStorage.setItem(key, 'awaiting-wallet');
      try {
        hash = await client.sendTransaction({ account, to, data, value: 0n });
      } catch (e) {
        if ((e as { code?: number }).code === 4001) localStorage.removeItem(key);
        throw e;
      }
      localStorage.setItem(key, hash);
    }
    setStatus(`Transaction ${hash} submitted. Waiting for confirmation.`);
    const receipt = await reader.waitForTransactionReceipt({ hash, timeout: 60000 });
    const submitted = await reader.getTransaction({ hash });
    if (
      submitted.from.toLowerCase() !== account.toLowerCase() ||
      (submitted.to ?? '').toLowerCase() !== (to ?? '').toLowerCase() ||
      submitted.input.toLowerCase() !== data.toLowerCase() ||
      submitted.value !== 0n
    )
      throw new Error('Recovered transaction differs from this wallet action.');
    if (receipt.status !== 'success')
      throw new Error(`Transaction reverted: ${hash}. Review before trying again.`);
    return receipt;
  }
  async function deploy() {
    if (!config || !wallet) return;
    const key = `splitt:deployment:${wallet.toLowerCase()}`;
    const receipt = await transaction(undefined, vaultCreation(wallet, config.operator), key);
    await api('/selfserve/vaults', { transactionHash: receipt.transactionHash });
    await loadVaults(csrf);
    setStatus('Your vault is deployed and verified. Create your first project.');
  }
  async function createProject(input: Setup) {
    if (!vault || !wallet) return;
    setSetup(input);
    localStorage.setItem(
      `splitt:setup:${wallet.toLowerCase()}:${vault.vault}`,
      JSON.stringify(input),
    );
    const p = input.metadata,
      project = await reader.readContract({
        address: vault.vault,
        abi: setupAbi,
        functionName: 'projects',
        args: [p.onchainId],
      });
    if (!project[5])
      await transaction(
        vault.vault,
        encodeFunctionData({
          abi: setupAbi,
          functionName: 'createProject',
          args: [p.onchainId, BigInt(input.reserve), 5000000n, 10000000n],
        }),
        `splitt:project:${vault.vault}:${p.id}`,
      );
    for (const commitment of p.commitments) {
      const existing = await reader.readContract({
        address: vault.vault,
        abi: setupAbi,
        functionName: 'commitments',
        args: [commitment.onchainId],
      });
      if (existing[1] === '0x0000000000000000000000000000000000000000')
        await transaction(
          vault.vault,
          encodeFunctionData({
            abi: setupAbi,
            functionName: 'addCommitment',
            args: [
              commitment.onchainId,
              p.onchainId,
              commitment.payee,
              BigInt(commitment.maximum),
              commitment.partialAllowed,
            ],
          }),
          `splitt:commitment:${vault.vault}:${commitment.id}`,
        );
      else if (
        existing[1].toLowerCase() !== commitment.payee.toLowerCase() ||
        existing[2] !== BigInt(commitment.maximum)
      )
        throw new Error('Saved contractor details differ from the onchain commitment.');
    }
    await api(`${path}/projects`, p);
    await refresh();
    setStatus(
      'Project created. Wait for contractor activation, then deposit a test client payment.',
    );
  }
  async function fund(project: Project) {
    if (!vault || !wallet) return;
    const amount = parseUSDC(deposit);
    if (BigInt(amount) <= 0n || BigInt(amount) > 10000000n)
      throw new Error('Deposit between 0.000001 and 10 test USDC.');
    const operation = `${vault.vault}:${project.id}:${crypto.randomUUID()}`;
    // Persist the deposit operation before wallet prompts; repeated deposits need a distinct user action.
    const pendingKey = `splitt:deposit-operation:${vault.vault}`,
      pending = localStorage.getItem(pendingKey);
    const funding = pending
      ? (JSON.parse(pending) as { operation: string; amount: string })
      : { operation, amount };
    if (funding.amount !== amount)
      throw new Error('Recover the existing deposit before changing its amount.');
    localStorage.setItem(pendingKey, JSON.stringify(funding));
    const allowance = await reader.readContract({
      address: SELF_SERVE.usdc,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [wallet, vault.vault],
    });
    if (allowance < BigInt(amount))
      await transaction(
        SELF_SERVE.usdc,
        encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [vault.vault, BigInt(amount)],
        }),
        `splitt:approve:${funding.operation}`,
      );
    await transaction(
      vault.vault,
      encodeFunctionData({
        abi: setupAbi,
        functionName: 'deposit',
        args: [project.onchainId, idHash(project.invoiceRef), BigInt(amount)],
      }),
      `splitt:deposit:${funding.operation}`,
    );
    await api(`${path}/receipts/refresh`, {});
    await refresh();
    localStorage.removeItem(pendingKey);
    setStatus('Payment confirmed. The agent will draft from the receipt automatically.');
  }
  const project = workspace?.projects[0],
    activation = project ? Math.max(0, ...project.commitments.map((c) => c.activeAfter)) * 1000 : 0,
    waiting = Math.max(0, Math.ceil((activation - clock) / 1000));
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="selfserve-main">
        <header className="selfserve-intro">
          <div>
            <h1>Your project. Your vault.</h1>
            <p>
              Try project payments on Arc Testnet. Create a vault you own, deposit test USDC and
              review an allocation before paying contractors.
            </p>
          </div>
          <span className="selfserve-network">Testnet USDC only</span>
        </header>
        {checking ? (
          <section className="selfserve-section" aria-busy="true">
            <p role="status">Connecting to the testnet workspace…</p>
          </section>
        ) : !config ? (
          <section className="selfserve-section">
            <p role="alert">{error}</p>
            <Link href="/demo">Try the allocation demo</Link>
          </section>
        ) : (
          <>
            {error && (
              <p className="selfserve-error" role="alert">
                {error}
              </p>
            )}
            <p className="selfserve-status" role="status">
              {busy ? 'Working. Review the details in your wallet…' : status}
            </p>
            <section className="selfserve-section selfserve-wallet">
              <div>
                <h2>{wallet ? 'Connected wallet' : 'Connect your wallet'}</h2>
                <p>
                  {wallet ??
                    'Use MetaMask or Rabby on Arc Testnet. Sign-in does not authorize a payment.'}
                </p>
              </div>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void run(wallet ? logout : connect)}
              >
                {wallet ? 'Sign out' : 'Connect wallet'}
              </button>
            </section>
            {wallet && (
              <>
                {!vault ? (
                  <section className="selfserve-section">
                    <h2>Create your vault</h2>
                    <p>
                      Get free Arc Testnet USDC from{' '}
                      <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
                        Circle’s faucet
                      </a>{' '}
                      first. Your wallet pays deployment and setup fees. Splitt’s Circle wallet
                      sponsors approved payouts within preview limits.
                    </p>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() => void run(deploy)}
                    >
                      Deploy my vault
                    </button>
                    <details>
                      <summary>Recover an existing deployment</summary>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const hash = String(new FormData(e.currentTarget).get('hash'));
                          void run(async () => {
                            const registered = await api<Vault>('/selfserve/vaults', {
                              transactionHash: hash,
                            });
                            localStorage.setItem(`splitt:deployment:${wallet.toLowerCase()}`, hash);
                            setVault(registered);
                            await refresh(registered);
                          });
                        }}
                      >
                        <label htmlFor="deployment-hash">Confirmed deployment transaction</label>
                        <input
                          id="deployment-hash"
                          name="hash"
                          pattern="0x[0-9a-fA-F]{64}"
                          autoComplete="off"
                          required
                        />
                        <button className="button secondary" disabled={busy}>
                          Verify deployment
                        </button>
                      </form>
                    </details>
                  </section>
                ) : (
                  <>
                    <section className="selfserve-section">
                      <h2>Your vault</h2>
                      <a
                        href={`https://explorer.testnet.arc.io/address/${vault.vault}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {vault.vault}
                      </a>
                      <p>
                        Your wallet owns this contract. Splitt cannot authorize a payment or
                        withdraw the balance.
                      </p>
                      {!!pendingKeys.length && (
                        <details>
                          <summary>Recover an interrupted wallet action</summary>
                          <p>
                            Find the confirmed transaction in your wallet. Save its hash here, then
                            resume the original action. Splitt checks the sender, destination and
                            exact calldata.
                          </p>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const data = new FormData(e.currentTarget),
                                key = String(data.get('key')),
                                hash = String(data.get('hash'));
                              if (!pendingKeys.includes(key)) return;
                              localStorage.setItem(key, hash);
                              setPendingKeys(pendingKeys.filter((k) => k !== key));
                              setStatus('Hash saved. Resume the original action to verify it.');
                            }}
                          >
                            <label htmlFor="recovery-action">Pending action</label>
                            <select id="recovery-action" name="key">
                              {pendingKeys.map((key) => (
                                <option key={key} value={key}>
                                  {key.split(':')[1]} · {key.slice(-12)}
                                </option>
                              ))}
                            </select>
                            <label htmlFor="recovery-hash">Transaction hash</label>
                            <input
                              id="recovery-hash"
                              name="hash"
                              pattern="0x[0-9a-fA-F]{64}"
                              autoComplete="off"
                              required
                            />
                            <button className="button secondary" disabled={busy}>
                              Save transaction hash
                            </button>
                          </form>
                        </details>
                      )}
                    </section>
                    {!project ? (
                      <section className="selfserve-section">
                        <h2>Create a project</h2>
                        <p>
                          One invoice and up to two approved contractor obligations. Setup requires
                          a project transaction and one transaction per contractor. Recipients
                          activate after three minutes.
                        </p>
                        {setup ? (
                          <>
                            <p>
                              Saved setup: {setup.metadata.name}. Resume to complete confirmed and
                              remaining steps.
                            </p>
                            <button
                              className="button primary"
                              disabled={busy}
                              onClick={() => void run(() => createProject(setup))}
                            >
                              Resume project setup
                            </button>
                          </>
                        ) : (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const form = new FormData(e.currentTarget);
                              void run(async () => {
                                const amount = (name: string) => parseUSDC(String(form.get(name))),
                                  invoice = amount('invoice'),
                                  reserve = amount('reserve');
                                if (
                                  BigInt(invoice) <= 0n ||
                                  BigInt(invoice) > 10000000n ||
                                  BigInt(reserve) > BigInt(invoice)
                                )
                                  throw new Error(
                                    'Use an invoice up to 10 USDC and a reserve within that amount.',
                                  );
                                const id = crypto.randomUUID(),
                                  due = String(form.get('due')),
                                  commitments: Metadata['commitments'] = [];
                                for (const n of [1, 2]) {
                                  const payee = String(form.get(`payee${n}`) || '');
                                  if (!payee && n === 2) continue;
                                  const maximum = amount(`amount${n}`);
                                  if (
                                    !/^0x[0-9a-fA-F]{40}$/.test(payee) ||
                                    /^0x0{40}$/.test(payee) ||
                                    BigInt(maximum) <= 0n ||
                                    BigInt(maximum) > 5000000n
                                  )
                                    throw new Error(
                                      'Use valid contractor wallets and obligations between 0.000001 and 5 USDC.',
                                    );
                                  const cid = `${id}:${n}`;
                                  commitments.push({
                                    id: cid,
                                    onchainId: idHash(cid),
                                    name: String(form.get(`name${n}`) || `Contractor ${n}`),
                                    role: 'Contractor',
                                    payee: payee as Hex,
                                    maximum,
                                    dueDate: due,
                                    deferUntil: null,
                                    accepted: true,
                                    acceptedAt: today(),
                                    blocksDelivery: form.has(`blocks${n}`),
                                    partialAllowed: form.has(`partial${n}`),
                                    dependsOn: null,
                                  });
                                }
                                const metadata: Metadata = {
                                  id,
                                  onchainId: idHash(id),
                                  name: String(form.get('project')),
                                  client: String(form.get('client')),
                                  clientWallet: wallet,
                                  invoiceRef: String(form.get('invoiceRef')),
                                  invoiceTotal: invoice,
                                  commitments,
                                };
                                await createProject({ metadata, reserve });
                              });
                            }}
                          >
                            <fieldset disabled={busy}>
                              <legend>Invoice details</legend>
                              <div className="selfserve-grid">
                                <Field name="project" label="Project name" required />
                                <Field name="client" label="Client name" required />
                                <Field name="invoiceRef" label="Invoice reference" required />
                                <Field
                                  name="invoice"
                                  label="Invoice total (USDC)"
                                  amount
                                  defaultValue="2"
                                  required
                                />
                                <Field
                                  name="reserve"
                                  label="Project reserve (USDC)"
                                  amount
                                  defaultValue="0.3"
                                  required
                                />
                                <label>
                                  Payment due date
                                  <input name="due" type="date" defaultValue={today()} required />
                                </label>
                              </div>
                            </fieldset>
                            {[1, 2].map((n) => (
                              <fieldset key={n} disabled={busy}>
                                <legend>
                                  {n === 1 ? 'First contractor' : 'Second contractor (optional)'}
                                </legend>
                                <div className="selfserve-grid">
                                  <Field name={`name${n}`} label="Name" required={n === 1} />
                                  <Field
                                    name={`payee${n}`}
                                    label="Wallet address"
                                    required={n === 1}
                                    address
                                  />
                                  <Field
                                    name={`amount${n}`}
                                    label="Approved obligation (USDC)"
                                    amount
                                    defaultValue={n === 1 ? '0.7' : '0.5'}
                                    required={n === 1}
                                  />
                                </div>
                                <label className="selfserve-check">
                                  <input
                                    type="checkbox"
                                    name={`blocks${n}`}
                                    defaultChecked={n === 1}
                                  />
                                  This work is needed to deliver the project
                                </label>
                                <label className="selfserve-check">
                                  <input
                                    type="checkbox"
                                    name={`partial${n}`}
                                    defaultChecked={n === 2}
                                  />
                                  The contractor permits partial payments
                                </label>
                              </fieldset>
                            ))}
                            <label className="selfserve-check">
                              <input type="checkbox" required />I confirm these obligations and
                              payment terms are approved.
                            </label>
                            <button className="button primary" disabled={busy}>
                              Create project and contractor commitments
                            </button>
                          </form>
                        )}
                      </section>
                    ) : (
                      <>
                        <section className="selfserve-section">
                          <h2>{project.name}</h2>
                          <div className="selfserve-balances">
                            <p>
                              <span>Project balance</span>
                              <strong>
                                {formatUSDC(project.balance)} <small>USDC</small>
                              </strong>
                            </p>
                            <p>
                              <span>Reserve</span>
                              <strong>
                                {formatUSDC(project.reserve)} <small>USDC</small>
                              </strong>
                            </p>
                            <p>
                              <span>Outstanding obligations</span>
                              <strong>
                                {formatUSDC(
                                  String(
                                    project.commitments.reduce(
                                      (n, c) => n + BigInt(c.maximum) - BigInt(c.paid),
                                      0n,
                                    ),
                                  ),
                                )}{' '}
                                <small>USDC</small>
                              </strong>
                            </p>
                          </div>
                          {waiting > 0 ? (
                            <p role="status">
                              Contractors activate in {Math.floor(waiting / 60)}m {waiting % 60}s.
                              Wait before depositing so the first receipt can produce a payable
                              draft.
                            </p>
                          ) : (
                            <p>
                              Contractors are active. Deposit a test client payment to trigger a
                              draft.
                            </p>
                          )}
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              void run(() => fund(project));
                            }}
                          >
                            <label htmlFor="test-deposit">Client payment (USDC)</label>
                            <input
                              id="test-deposit"
                              value={deposit}
                              onChange={(e) => setDeposit(e.target.value)}
                              inputMode="decimal"
                              pattern="(0|[1-9][0-9]*)(\.[0-9]{1,6})?"
                              autoComplete="off"
                              required
                            />
                            <button className="button primary" disabled={busy || waiting > 0}>
                              Deposit test payment
                            </button>
                          </form>
                          <details>
                            <summary>Match a client payment note</summary>
                            <p>
                              The note is sent to the configured AI provider. A match cannot
                              authorize a payout or change contractor terms.
                            </p>
                            <form
                              onSubmit={(event) => {
                                event.preventDefault();
                                const data = new FormData(event.currentTarget);
                                void run(async () => {
                                  await api(`${path}/payment-notes`, {
                                    eventId: String(data.get('receipt')),
                                    note: String(data.get('note')),
                                  });
                                  await refresh();
                                  setStatus(
                                    'Payment note checked. Review the match and quoted statement below.',
                                  );
                                });
                              }}
                            >
                              <label htmlFor="note-receipt">Confirmed receipt</label>
                              <select id="note-receipt" name="receipt" required disabled={busy}>
                                <option value="">Choose a receipt</option>
                                {workspace?.events
                                  .filter(
                                    (event) =>
                                      ['PaymentReceived', 'PaymentAttributed'].includes(
                                        event.name,
                                      ) &&
                                      event.args.projectId?.toLowerCase() ===
                                        project.onchainId.toLowerCase(),
                                  )
                                  .map((event) => (
                                    <option key={event.id} value={event.id}>
                                      {formatUSDC(event.args.amount)} USDC ·{' '}
                                      {event.txHash.slice(0, 12)}…
                                    </option>
                                  ))}
                              </select>
                              <label htmlFor="client-payment-note">Client note</label>
                              <textarea
                                id="client-payment-note"
                                name="note"
                                minLength={3}
                                maxLength={2000}
                                required
                                disabled={busy}
                                rows={3}
                              />
                              <button className="button secondary" disabled={busy}>
                                Match note
                              </button>
                            </form>
                            {workspace?.paymentNotes
                              ?.slice(-3)
                              .reverse()
                              .map((note) => (
                                <div className="selfserve-payment" key={note.id}>
                                  <div>
                                    <strong>
                                      {note.status === 'suggested_match'
                                        ? `Matched to ${note.invoiceRef}`
                                        : 'Needs your review'}
                                    </strong>
                                    {note.remainderQuote && (
                                      <p>Client statement, unverified: “{note.remainderQuote}”</p>
                                    )}
                                    <p>
                                      {note.model}
                                      {note.fallbackUsed ? ' · Rule-based fallback' : ''}
                                    </p>
                                    {note.issues.length > 0 && (
                                      <p>Checks: {note.issues.join(', ')}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                          </details>
                        </section>
                        <section className="selfserve-section">
                          <div className="selfserve-section-heading">
                            <h2>Allocation</h2>
                            <button
                              className="button secondary"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  await api(`${path}/receipts/refresh`, {});
                                  await refresh();
                                })
                              }
                            >
                              Refresh activity
                            </button>
                          </div>
                          {!workspace?.plans.length && (
                            <p>
                              {project.received === '0'
                                ? 'Your allocation appears after a payment is confirmed.'
                                : 'A receipt was detected. The worker is checking funds and contractor terms.'}
                            </p>
                          )}
                          {workspace?.notifications
                            ?.filter((n) => n.kind === 'receipt_needs_review')
                            .map((n) => (
                              <p key={n.id}>{n.message}</p>
                            ))}
                          {workspace?.plans
                            .slice()
                            .reverse()
                            .map((plan) => (
                              <article className="selfserve-plan" key={plan.id}>
                                <h3>
                                  {plan.status === 'awaiting_owner'
                                    ? 'Ready for review'
                                    : plan.status === 'no_action'
                                      ? 'No payout available'
                                      : plan.status}
                                </h3>
                                <p>
                                  {plan.fallbackUsed
                                    ? 'Deterministic allocation.'
                                    : 'Model proposal checked by the validator.'}{' '}
                                  No payout is sent until you approve.
                                </p>
                                {plan.output.items.map((item) => (
                                  <div className="selfserve-payment" key={item.commitment_id}>
                                    <div>
                                      <strong>
                                        {
                                          project.commitments.find(
                                            (c) => c.id === item.commitment_id,
                                          )?.name
                                        }
                                      </strong>
                                      <p>{item.explanation}</p>
                                    </div>
                                    <strong>{formatUSDC(item.amount_micro)} USDC</strong>
                                  </div>
                                ))}
                                <details>
                                  <summary>Decision evidence</summary>
                                  <p>
                                    Model: {plan.model}. Validation:{' '}
                                    {plan.validation.ok ? 'passed' : 'failed'}. Trigger:{' '}
                                    {workspace.receiptDrafts
                                      ?.filter((t) => t.planId === plan.id)
                                      .map((t) => t.id)
                                      .join(', ') || 'Owner requested'}
                                    .
                                  </p>
                                  <p>Facts hash: {plan.factsHash}</p>
                                  <pre>
                                    {JSON.stringify(
                                      {
                                        proposal: plan.output,
                                        baseline: plan.baseline,
                                        facts: plan.facts,
                                      },
                                      null,
                                      2,
                                    )}
                                  </pre>
                                </details>
                                <button
                                  className="button primary"
                                  disabled={busy || plan.status !== 'awaiting_owner'}
                                  onClick={() =>
                                    void run(async () => {
                                      const prepared = await api<{ approval: BatchApproval }>(
                                        `${path}/plans/${plan.id}/prepare`,
                                        {},
                                      );
                                      setReview({ id: plan.id, approval: prepared.approval });
                                    })
                                  }
                                >
                                  Review payout
                                </button>
                              </article>
                            ))}
                        </section>
                        {review && (
                          <section className="selfserve-section selfserve-confirmation">
                            <h2>Confirm exact payout</h2>
                            {review.approval.items.map((item) => (
                              <p key={item.executionId}>
                                {
                                  project.commitments.find((c) => c.onchainId === item.commitmentId)
                                    ?.payee
                                }{' '}
                                · {formatUSDC(item.amount)} USDC
                              </p>
                            ))}
                            <p>
                              Your signature binds these payments to this vault, project version and
                              expiry. Circle sponsors execution within preview limits.
                            </p>
                            <button
                              disabled={busy}
                              className="button primary"
                              onClick={() =>
                                void run(async () => {
                                  const { client, account } = await browserWallet(),
                                    a = review.approval;
                                  if (
                                    a.domain.chainId !== 5042002 ||
                                    a.domain.name !== 'Splitt' ||
                                    a.domain.verifyingContract.toLowerCase() !==
                                      vault.vault.toLowerCase() ||
                                    a.message.projectId !== project.onchainId ||
                                    a.message.projectVersion !== String(project.version)
                                  )
                                    throw new Error(
                                      'Payout domain or project changed. Refresh and review again.',
                                    );
                                  const signature = await client.signTypedData({
                                    account,
                                    domain: a.domain,
                                    types: authorizationTypes,
                                    primaryType: 'PlanAuthorization',
                                    message: {
                                      ...a.message,
                                      projectVersion: BigInt(a.message.projectVersion),
                                      deadline: BigInt(a.message.deadline),
                                    },
                                  });
                                  await api(`${path}/plans/${review.id}/submit`, { signature });
                                  setReview(undefined);
                                  await refresh();
                                  setStatus(
                                    'Signed payout queued. Settlement will update after confirmation.',
                                  );
                                })
                              }
                            >
                              Sign and queue payout
                            </button>
                            <button
                              className="button secondary"
                              disabled={busy}
                              onClick={() => setReview(undefined)}
                            >
                              Cancel
                            </button>
                          </section>
                        )}
                        <section className="selfserve-section">
                          <h2>Settlement</h2>
                          {!workspace?.jobs.length && <p>No payouts queued yet.</p>}
                          {workspace?.jobs.map((job) => (
                            <p key={job.id}>
                              {job.state}
                              {job.txHash && (
                                <>
                                  {' '}
                                  ·{' '}
                                  <a
                                    href={`https://explorer.testnet.arc.io/tx/${job.txHash}`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    View transaction
                                  </a>
                                </>
                              )}
                              {job.lastError && <> · {job.lastError}</>}
                            </p>
                          ))}
                          <p>
                            Preview limits: three sponsored batches and up to 0.25 USDC in reserved
                            gas per wallet per UTC day. A shared global cap also applies. These
                            limits affect sponsorship; your wallet continues to own the vault.
                          </p>
                          <details>
                            <summary>Withdraw project funds</summary>
                            <p>
                              Owner withdrawals can reduce the project below its reserve. Queued
                              approvals may become stale. Review settlement before withdrawing.
                            </p>
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const amount = parseUSDC(
                                  String(new FormData(e.currentTarget).get('withdraw')),
                                );
                                void run(async () => {
                                  if (
                                    !vault ||
                                    !wallet ||
                                    BigInt(amount) <= 0n ||
                                    BigInt(amount) > BigInt(project.balance)
                                  )
                                    throw new Error('Choose an amount within the project balance.');
                                  if (
                                    workspace?.jobs.some(
                                      (j) => !['confirmed', 'failed', 'expired'].includes(j.state),
                                    )
                                  )
                                    throw new Error(
                                      'Resolve the pending payout before withdrawing.',
                                    );
                                  const operationKey = `splitt:withdraw-operation:${vault.vault}`,
                                    saved = localStorage.getItem(operationKey),
                                    operation = saved
                                      ? (JSON.parse(saved) as { id: string; amount: string })
                                      : { id: crypto.randomUUID(), amount };
                                  if (operation.amount !== amount)
                                    throw new Error(
                                      'Recover the existing withdrawal before changing its amount.',
                                    );
                                  localStorage.setItem(operationKey, JSON.stringify(operation));
                                  await transaction(
                                    vault.vault,
                                    encodeFunctionData({
                                      abi: setupAbi,
                                      functionName: 'ownerWithdraw',
                                      args: [project.onchainId, BigInt(amount), wallet],
                                    }),
                                    `splitt:withdraw:${vault.vault}:${operation.id}`,
                                  );
                                  await refresh();
                                  localStorage.removeItem(operationKey);
                                  setStatus('Owner withdrawal confirmed.');
                                });
                              }}
                            >
                              <Field
                                name="withdraw"
                                label="Withdraw to my wallet (USDC)"
                                amount
                                required
                              />
                              <button className="button secondary" disabled={busy}>
                                Withdraw test USDC
                              </button>
                            </form>
                          </details>
                        </section>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>
      {config?.activity && (
        <section className="selfserve-activity">
          <div>
            <h2>Recorded testnet activity</h2>
            <p>
              Wallet activity is separate from verified business adoption. Controlled tests are
              reported separately.
            </p>
            <div className="selfserve-activity-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Source</th>
                    <th scope="col">Vaults</th>
                    <th scope="col">Confirmed batches</th>
                    <th scope="col">USDC paid</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Unverified testnet activity', config.activity.unverifiedTestnet],
                    ['Builder-controlled tests', config.activity.controlledTests],
                  ].map(([label, row]) => {
                    const stats = row as NonNullable<Config['activity']>['controlledTests'];
                    return (
                      <tr key={String(label)}>
                        <th scope="row">{String(label)}</th>
                        <td>{stats.vaults}</td>
                        <td>{stats.confirmedBatches}</td>
                        <td>{formatUSDC(stats.paidMicro)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
      <SiteFooter fit="app" />
    </>
  );
}
function Field({
  name,
  label,
  amount = false,
  address = false,
  required = false,
  defaultValue,
}: {
  name: string;
  label: string;
  amount?: boolean;
  address?: boolean;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label htmlFor={name}>
      {label}
      <input
        id={name}
        name={name}
        type="text"
        autoComplete="off"
        inputMode={amount ? 'decimal' : 'text'}
        pattern={
          amount ? '(0|[1-9][0-9]*)([.][0-9]{1,6})?' : address ? '0x[0-9a-fA-F]{40}' : undefined
        }
        maxLength={address ? 42 : 100}
        required={required}
        defaultValue={defaultValue}
      />
    </label>
  );
}
