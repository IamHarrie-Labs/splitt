import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  encodePacked,
  encodeAbiParameters,
  encodeEventTopics,
  zeroHash,
  zeroAddress,
  type Hex,
} from 'viem';
import { idHash } from '@splitt/core';
import {
  CCTP,
  addressWord,
  checkCctpMessage,
  decodeCctp,
  burnCalls,
  bridgeInput,
  minimumStandardFee,
  transmitterAbi,
  receiptAttributionId,
  type BridgeIntent,
} from '../packages/core/src/cctp';
import { BridgeService } from '../server/src/bridge/service';
import type { CctpGateway } from '../server/src/bridge/gateway';
import { fixtureProjects } from '../server/src/fixtures';
import type { LiveRepository, LiveState } from '../server/src/live/repository';
const owner = '0x1111111111111111111111111111111111111111' as const;
const vault = '0x2222222222222222222222222222222222222222' as const;
const tx = idHash('source'),
  mintTx = idHash('mint'),
  attributionTx = idHash('attribute');
const intent: BridgeIntent = {
  id: 'intent',
  projectId: 'northstar',
  projectOnchainId: idHash('northstar'),
  invoiceRef: 'NS-2026-041',
  payer: owner,
  vault,
  amount: '1000000',
  maxFee: '1000',
  state: 'prepared',
  createdAt: '2026-10-16T00:00:00Z',
};
function message(attested = false) {
  return encodePacked(
    [
      'uint32',
      'uint32',
      'uint32',
      'bytes32',
      'bytes32',
      'bytes32',
      'bytes32',
      'uint32',
      'uint32',
      'uint32',
      'bytes32',
      'bytes32',
      'uint256',
      'bytes32',
      'uint256',
      'uint256',
      'uint256',
    ],
    [
      1,
      6,
      26,
      attested ? idHash('nonce') : zeroHash,
      addressWord(CCTP.messenger),
      addressWord(CCTP.messenger),
      zeroHash,
      2000,
      attested ? 2000 : 0,
      1,
      addressWord(CCTP.sourceUsdc),
      addressWord(vault),
      1000000n,
      addressWord(owner),
      1000n,
      attested ? 10n : 0n,
      0n,
    ],
  );
}
const change = (hex: Hex, offset: number, bytes: Hex) =>
  `${hex.slice(0, 2 + offset * 2)}${bytes.slice(2)}${hex.slice(2 + offset * 2 + (bytes.length - 2))}` as Hex;
describe('CCTP protocol boundary', () => {
  it('decodes standard V2 source and attested messages, accounting for fees', () => {
    expect(decodeCctp(message()).nonce).toBe(zeroHash);
    expect(checkCctpMessage(message(true), intent, true).amount).toBe(1000000n);
    expect(checkCctpMessage(message(true), intent, true).fee).toBe(10n);
  });
  it.each([
    ['source domain', 4, '0x00000000'],
    ['destination domain', 8, '0x00000006'],
    ['recipient', 184, addressWord(owner)],
    ['payer', 248, addressWord(vault)],
    ['burn token', 152, addressWord(vault)],
    ['finality', 140, '0x000003e8'],
  ])('rejects a different %s', (_name, offset, replacement) => {
    expect(() =>
      checkCctpMessage(change(message(true), Number(offset), replacement as Hex), intent, true),
    ).toThrow();
  });
  it('rejects zero nonce, excessive fee and appended hook payloads', () => {
    expect(() => checkCctpMessage(message(), intent, true)).toThrow('nonzero');
    expect(() =>
      checkCctpMessage(
        change(message(true), 312, encodePacked(['uint256'], [1001n])),
        intent,
        true,
      ),
    ).toThrow();
    expect(() => decodeCctp(`${message(true)}00`)).toThrow('without hooks');
  });
  it('encodes exact approval amount and a fixed finalized route', () => {
    expect(burnCalls(intent, '999999').approve?.to).toBe(CCTP.sourceUsdc);
    expect(burnCalls(intent, '1000000').approve).toBeNull();
    expect(burnCalls(intent, '0').burn.chainId).toBe(84532);
    expect(burnCalls(intent, '0').burn.to).toBe(CCTP.messenger);
  });
  it('rounds fractional basis-point fees up without floating point balances', () => {
    expect(minimumStandardFee('1000000', '1.3')).toBe(130n);
    expect(minimumStandardFee('1', '0.000001')).toBe(1n);
    expect(minimumStandardFee('9223372036854775807', '0')).toBe(0n);
    expect(() => minimumStandardFee('1', '-1')).toThrow();
  });
  it('rejects zero/overrange amounts, invalid payer and a fee consuming the transfer', () => {
    const base = { projectId: 'northstar', payer: owner, amount: '1000000', maxFee: '0' };
    expect(bridgeInput.safeParse({ ...base, amount: '0' }).success).toBe(false);
    expect(bridgeInput.safeParse({ ...base, payer: zeroAddress }).success).toBe(false);
    expect(bridgeInput.safeParse({ ...base, maxFee: '1000000' }).success).toBe(false);
    expect(bridgeInput.safeParse({ ...base, amount: '9223372036854775808' }).success).toBe(false);
  });
  it('binds attribution to chain, actual receipt and log index', () => {
    const key = receiptAttributionId(5042002, mintTx, 3);
    expect(key).not.toBe(receiptAttributionId(84532, mintTx, 3));
    expect(key).not.toBe(receiptAttributionId(5042002, mintTx, 4));
    expect(() => receiptAttributionId(5042002, mintTx, -1)).toThrow();
  });
});
let state: LiveState, service: BridgeService, gateway: CctpGateway;
beforeEach(() => {
  state = { nextBlock: '0', events: [], projects: fixtureProjects(), plans: [], jobs: [] };
  let tail: Promise<unknown> = Promise.resolve();
  const repo: LiveRepository = {
    snapshot: async () => structuredClone(state),
    transaction: (fn) => {
      const work = tail.then(() => {
        const next = structuredClone(state),
          result = fn(next);
        state = next;
        return structuredClone(result);
      });
      tail = work.catch(() => undefined);
      return work;
    },
  };
  gateway = {
    preflight: vi.fn(async () => ({
      minimumFee: '0',
      usdcBalance: '10000000',
      nativeBalance: '1',
      allowance: '0',
      funded: true,
    })),
    prepareBurn: burnCalls,
    verifyBurn: vi.fn(async () => ({
      sourceTx: tx,
      sourceLogIndex: 2,
      sourceMessage: message(),
      sourceKey: idHash('burn-key'),
    })),
    attestation: vi.fn(async () => ({
      message: message(true),
      attestation: `0x${'11'.repeat(65)}` as Hex,
      nonce: idHash('nonce'),
      netAmount: '999990',
      alreadyMinted: false,
    })),
    mintCall: () => ({ chainId: 5042002, to: CCTP.transmitter, data: '0x12' }),
    verifyMint: vi.fn(async () => ({ mintTx, attributionId: idHash('mint-key') })),
    prepareAttribution: vi.fn(async () => ({ chainId: 5042002, to: vault, data: '0x12' as Hex })),
    verifyAttribution: vi.fn(async () => ({ attributionTx })),
    verify: vi.fn(async () => {}),
  };
  service = new BridgeService(repo, gateway, vault, owner);
});
const prepare = () =>
  service.prepare({ projectId: 'northstar', payer: owner, amount: '1000000', maxFee: '1000' });
describe('durable cross-chain funding', () => {
  it('saves intent before returning any transaction and never credits API-supplied balances', async () => {
    const before = structuredClone(state.projects),
      { intent: i } = await prepare();
    await service.recordBurn(i.id, tx);
    await service.poll(i.id);
    await service.recordMint(i.id, mintTx);
    await service.attribution(i.id);
    await service.recordAttribution(i.id, attributionTx);
    expect((await service.intent(i.id)).state).toBe('attributed');
    expect(state.projects).toEqual(before);
    expect(state.jobs).toEqual([]);
    expect(state.plans).toEqual([]);
  });
  it('rejects unknown payer, insufficient source funding and changed fee floor', async () => {
    await expect(
      service.prepare({ projectId: 'northstar', payer: vault, amount: '1000000', maxFee: '0' }),
    ).rejects.toThrow('registered client');
    vi.mocked(gateway.preflight).mockResolvedValueOnce({
      minimumFee: '0',
      usdcBalance: '0',
      nativeBalance: '0',
      allowance: '0',
      funded: false,
    });
    await expect(prepare()).rejects.toThrow('Fund the source');
    const { intent: i } = await prepare();
    vi.mocked(gateway.preflight).mockResolvedValueOnce({
      minimumFee: '2000',
      usdcBalance: '10000000',
      nativeBalance: '1',
      allowance: '0',
      funded: true,
    });
    await expect(service.resume(i.id)).rejects.toThrow('changed');
  });
  it('cannot mint or attribute before verifying preceding stages', async () => {
    const { intent: i } = await prepare();
    await expect(service.poll(i.id)).rejects.toThrow('burn first');
    await expect(service.recordMint(i.id, mintTx)).rejects.toThrow('attestation');
    await expect(service.attribution(i.id)).rejects.toThrow('mint');
  });
  it('keeps an attestation-pending intent recoverable, with no second burn', async () => {
    const { intent: i } = await prepare();
    await service.recordBurn(i.id, tx);
    vi.mocked(gateway.attestation).mockResolvedValueOnce(null);
    expect((await service.poll(i.id)).mint).toBeNull();
    expect((await service.resume(i.id)).burn).toBeNull();
    await service.recordBurn(i.id, tx);
    expect(gateway.verifyBurn).toHaveBeenCalledTimes(1);
    await expect(service.recordBurn(i.id, idHash('other'))).rejects.toThrow('different burn');
  });
  it('atomically rejects assigning one burn to two concurrent intents', async () => {
    const a = await prepare(),
      b = await prepare();
    const result = await Promise.allSettled([
      service.recordBurn(a.intent.id, tx),
      service.recordBurn(b.intent.id, tx),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(state.bridgeIntents!.filter((i) => i.sourceTx)).toHaveLength(1);
  });
  it('blocks duplicate Circle nonces and duplicate actual mint receipts', async () => {
    const a = await prepare(),
      b = await prepare();
    await service.recordBurn(a.intent.id, tx);
    vi.mocked(gateway.verifyBurn).mockResolvedValueOnce({
      sourceTx: idHash('second'),
      sourceLogIndex: 1,
      sourceMessage: message(),
      sourceKey: idHash('second-key'),
    });
    await service.recordBurn(b.intent.id, idHash('second'));
    await service.poll(a.intent.id);
    await expect(service.poll(b.intent.id)).rejects.toThrow('already linked');
    vi.mocked(gateway.attestation).mockResolvedValueOnce({
      message: message(true),
      attestation: '0x12',
      nonce: idHash('different-nonce'),
      netAmount: '999990',
      alreadyMinted: true,
    });
    await service.poll(b.intent.id);
    await service.recordMint(a.intent.id, mintTx);
    await expect(service.recordMint(b.intent.id, mintTx)).rejects.toThrow('already been linked');
  });
  it('reopens durable stage after service restart and retains original invoice binding', async () => {
    const { intent: i } = await prepare();
    await service.recordBurn(i.id, tx);
    state.projects[0].invoiceRef = 'NEW-INVOICE';
    const resumed = new BridgeService(service.repo, gateway, vault, owner);
    expect((await resumed.intent(i.id)).invoiceRef).toBe('NS-2026-041');
    expect((await resumed.resume(i.id)).burn).toBeNull();
  });
});
