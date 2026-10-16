'use client';
import { useState } from 'react';
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  defineChain,
  type Address,
  type Hex,
  type EIP1193Provider,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { formatUSDC, parseUSDC } from '@splitt/core';
import {
  burnCalls,
  CCTP,
  type BridgeIntent,
  type UnsignedCall,
} from '../../../packages/core/src/cctp';
import type { LiveState } from '../../../server/src/live/repository';

type Api = <T>(path: string, body?: unknown) => Promise<T>;
type Props = {
  workspace: LiveState & { owner: Address; vault: Address };
  api: Api;
  refresh: () => Promise<void>;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
};
const arc = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
});
const labels = {
  prepared: 'Ready to fund',
  burn_confirmed: 'Waiting for Circle',
  attested: 'Ready to mint',
  minted: 'Ready to attribute',
  attributed: 'Attributed to invoice',
};
export default function BridgeFunding({ workspace, api, refresh, busy, run }: Props) {
  const [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [projectId, setProjectId] = useState(workspace.projects[0]?.id ?? ''),
    [payer, setPayer] = useState<string>(workspace.owner),
    [amount, setAmount] = useState('1'),
    [fee, setFee] = useState('0');
  const base = '/testnet/bridge/intents';
  const step = (fn: () => Promise<void>) =>
    run(async () => {
      setError('');
      try {
        await fn();
        await refresh();
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : 'Funding failed. Inspect the transaction before retrying.',
        );
      }
    });
  async function send(call: UnsignedCall, account: Address, journalKey?: string) {
    const provider = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
    if (!provider) throw new Error('Connect a browser wallet to sign this transaction.');
    const wallet = createWalletClient({ transport: custom(provider) });
    const [selected] = await wallet.requestAddresses();
    if (selected?.toLowerCase() !== account.toLowerCase())
      throw new Error(`Select wallet ${account}.`);
    if ((await wallet.getChainId()) !== call.chainId)
      throw new Error(
        `Switch your wallet to ${call.chainId === 84532 ? 'Base Sepolia' : 'Arc Testnet'}.`,
      );
    if (journalKey) {
      if (localStorage.getItem(journalKey))
        throw new Error(
          'A burn may already have been submitted. Recover its hash below; do not burn again.',
        );
      localStorage.setItem(journalKey, 'awaiting-wallet');
    }
    let hash: Hex;
    try {
      hash = await wallet.sendTransaction({
        account: selected,
        chain: null,
        to: call.to,
        data: call.data,
        value: 0n,
      });
    } catch (e) {
      if (journalKey && (e as { code?: number }).code === 4001) localStorage.removeItem(journalKey);
      throw e;
    }
    setStatus(`Submitted ${hash}. Waiting for confirmation.`);
    if (journalKey) localStorage.setItem(journalKey, hash);
    const client = createPublicClient({
      chain: call.chainId === 84532 ? baseSepolia : arc,
      transport: http(),
    });
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60000 });
    if (receipt.status !== 'success')
      throw new Error(`Transaction reverted: ${hash}. Review before preparing another intent.`);
    return hash;
  }
  async function burn(intent: BridgeIntent) {
    const key = `splitt:burn:${intent.id}`;
    if (localStorage.getItem(key))
      throw new Error('Recover the saved burn below instead of submitting another burn.');
    const result = await api<{
      intent: BridgeIntent;
      approve: UnsignedCall | null;
      burn: UnsignedCall | null;
    }>(`${base}/${intent.id}/resume`, {});
    if (!result.burn) throw new Error('This intent has already progressed. Refresh its status.');
    const expected = burnCalls(intent, '0');
    if (
      JSON.stringify(result.burn) !== JSON.stringify(expected.burn) ||
      (result.approve && JSON.stringify(result.approve) !== JSON.stringify(expected.approve))
    )
      throw new Error('Funding transaction differs from the recorded intent.');
    if (result.approve) await send(result.approve, intent.payer);
    const hash = await send(result.burn, intent.payer, key);
    await api(`${base}/${intent.id}/burn`, { txHash: hash });
    setStatus('Burn confirmed. Check for Circle’s attestation; do not send another burn.');
  }
  return (
    <section className="panel bridge-funding" aria-busy={busy}>
      <h2>Fund an invoice from Base</h2>
      <p>
        Base Sepolia USDC reaches this vault on Arc Testnet through Circle CCTP. ETH pays source
        gas; USDC pays Arc gas. Attribution requires the owner wallet.
      </p>
      {error && <p role="alert">{error}</p>}
      <p role="status">{busy ? 'Checking funding or waiting for your wallet…' : status}</p>
      {!workspace.projects.length ? (
        <p>Register a project before funding its invoice.</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void step(async () => {
              const result = await api<{ intent: BridgeIntent }>(base, {
                projectId,
                payer,
                amount: parseUSDC(amount),
                maxFee: parseUSDC(fee),
              });
              setStatus(
                `Funding intent saved for ${result.intent.invoiceRef}. Review it below before signing.`,
              );
            });
          }}
        >
          <fieldset disabled={busy}>
            <legend>Payment details</legend>
            <label htmlFor="bridge-project">Project invoice</label>
            <select
              id="bridge-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              required
            >
              {workspace.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.invoiceRef}
                </option>
              ))}
            </select>
            <label htmlFor="bridge-payer">Source wallet (registered client or owner)</label>
            <input
              id="bridge-payer"
              autoComplete="off"
              value={payer}
              onChange={(e) => setPayer(e.target.value)}
              pattern="0x[0-9a-fA-F]{40}"
              required
            />
            <div className="bridge-amounts">
              <div>
                <label htmlFor="bridge-amount">Amount (USDC)</label>
                <input
                  id="bridge-amount"
                  autoComplete="off"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  pattern="(0|[1-9][0-9]*)(\.[0-9]{1,6})?"
                  required
                />
              </div>
              <div>
                <label htmlFor="bridge-fee">Maximum protocol fee (USDC)</label>
                <input
                  id="bridge-fee"
                  autoComplete="off"
                  inputMode="decimal"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  pattern="(0|[1-9][0-9]*)(\.[0-9]{1,6})?"
                  required
                />
              </div>
            </div>
            <button className="button secondary" type="submit">
              Save funding intent
            </button>
          </fieldset>
        </form>
      )}
      {!workspace.bridgeIntents?.length && (
        <p>No cross-chain funding intents yet. Saving an intent does not move tokens.</p>
      )}
      {[...(workspace.bridgeIntents ?? [])].reverse().map((intent) => (
        <article className="receipt-notification" key={intent.id}>
          <h3>
            {intent.invoiceRef} · {formatUSDC(intent.amount)} USDC
          </h3>
          <p>
            {labels[intent.state]} · Fee limit {formatUSDC(intent.maxFee)} USDC
            {intent.netAmount ? ` · Minted amount ${formatUSDC(intent.netAmount)} USDC` : ''}
          </p>
          <p>
            From {intent.payer} to {intent.vault}
          </p>
          {intent.sourceTx && (
            <a
              href={`https://sepolia.basescan.org/tx/${intent.sourceTx}`}
              target="_blank"
              rel="noreferrer"
            >
              Source burn
            </a>
          )}{' '}
          {intent.mintTx && (
            <a
              href={`https://explorer.testnet.arc.io/tx/${intent.mintTx}`}
              target="_blank"
              rel="noreferrer"
            >
              Arc mint
            </a>
          )}{' '}
          {intent.attributionTx && (
            <a
              href={`https://explorer.testnet.arc.io/tx/${intent.attributionTx}`}
              target="_blank"
              rel="noreferrer"
            >
              Invoice attribution
            </a>
          )}
          {intent.state === 'prepared' && (
            <button
              disabled={busy}
              className="button secondary"
              onClick={() => void step(() => burn(intent))}
            >
              Approve USDC and fund invoice
            </button>
          )}
          {['burn_confirmed', 'attested'].includes(intent.state) && (
            <button
              disabled={busy}
              className="button secondary"
              onClick={() =>
                void step(async () => {
                  const result = await api<{ mint: UnsignedCall | null; alreadyMinted: boolean }>(
                    `${base}/${intent.id}/attestation`,
                    {},
                  );
                  if (!result.mint) {
                    setStatus(
                      result.alreadyMinted
                        ? 'Already minted. Recover the destination transaction hash below.'
                        : 'Circle is still finalizing. Check again later; do not burn again.',
                    );
                    return;
                  }
                  const hash = await send(result.mint, workspace.owner);
                  await api(`${base}/${intent.id}/mint`, { txHash: hash });
                  setStatus('Mint verified. Review and attribute the net amount to the invoice.');
                })
              }
            >
              Check attestation and mint on Arc
            </button>
          )}
          {intent.state === 'minted' && (
            <button
              disabled={busy}
              className="button secondary"
              onClick={() =>
                void step(async () => {
                  const result = await api<{ transaction: UnsignedCall }>(
                    `${base}/${intent.id}/attribute/prepare`,
                    {},
                  );
                  const hash = await send(result.transaction, workspace.owner);
                  await api(`${base}/${intent.id}/attribute`, { txHash: hash });
                  setStatus(
                    'Attributed. The receipt worker will draft from the updated project balance.',
                  );
                })
              }
            >
              Attribute to invoice
            </button>
          )}
          {intent.state !== 'attributed' && (
            <details>
              <summary>Recover a submitted transaction</summary>
              <p>
                Use the confirmed transaction hash when a browser or connection closed. This
                verifies evidence without resending tokens.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void step(async () => {
                    await api(`${base}/${intent.id}/${String(form.get('stage'))}`, {
                      txHash: String(form.get('txHash')),
                    });
                    setStatus('Transaction recovered and verified.');
                  });
                }}
              >
                <label htmlFor={`stage-${intent.id}`}>Stage</label>
                <select
                  id={`stage-${intent.id}`}
                  name="stage"
                  defaultValue={
                    intent.state === 'prepared'
                      ? 'burn'
                      : intent.state === 'minted'
                        ? 'attribute'
                        : 'mint'
                  }
                >
                  <option value="burn">Source burn</option>
                  <option value="mint">Arc mint</option>
                  <option value="attribute">Invoice attribution</option>
                </select>
                <label htmlFor={`hash-${intent.id}`}>Transaction hash</label>
                <input
                  id={`hash-${intent.id}`}
                  name="txHash"
                  autoComplete="off"
                  pattern="0x[0-9a-fA-F]{64}"
                  required
                />
                <button disabled={busy} className="button secondary" type="submit">
                  Verify existing transaction
                </button>
              </form>
              {intent.state === 'prepared' && (
                <button
                  disabled={busy}
                  className="button secondary"
                  onClick={() =>
                    void step(async () => {
                      const hash = localStorage.getItem(`splitt:burn:${intent.id}`);
                      if (!hash || hash === 'awaiting-wallet')
                        throw new Error(
                          'No saved hash. Find the confirmed burn in your wallet and enter it above.',
                        );
                      await api(`${base}/${intent.id}/burn`, { txHash: hash });
                      setStatus('Saved burn recovered.');
                    })
                  }
                >
                  Recover saved source burn
                </button>
              )}
            </details>
          )}
        </article>
      ))}
    </section>
  );
}
