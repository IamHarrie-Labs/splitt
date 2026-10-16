import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import {
  encodePacked,
  encodeAbiParameters,
  encodeEventTopics,
  erc20Abi,
  zeroHash,
  zeroAddress,
  type Hex,
} from 'viem';
import { idHash } from '@splitt/core';
import {
  CCTP,
  addressWord,
  transmitterAbi,
  attributionAbi,
  burnCalls,
  decodeCctp,
  receiptAttributionId,
  type BridgeIntent,
} from '../packages/core/src/cctp';
import { cctpGateway, keccakEvidence } from '../server/src/bridge/gateway';
const mocks = vi.hoisted(() => ({
  source: {
    getChainId: vi.fn(),
    readContract: vi.fn(),
    getTransactionReceipt: vi.fn(),
    getTransaction: vi.fn(),
  },
  destination: {
    getChainId: vi.fn(),
    readContract: vi.fn(),
    getTransactionReceipt: vi.fn(),
    simulateContract: vi.fn(),
  },
}));
vi.mock('viem', async (original) => ({
  ...(await original<typeof import('viem')>()),
  createPublicClient: vi.fn((options) =>
    options.chain.id === 84532 ? mocks.source : mocks.destination,
  ),
}));
const payer = '0x1111111111111111111111111111111111111111' as const,
  vault = '0x2222222222222222222222222222222222222222' as const;
const sourceHash = idHash('burn'),
  mintHash = idHash('mint');
const initial: BridgeIntent = {
  id: 'proof',
  projectId: 'northstar',
  projectOnchainId: idHash('northstar'),
  invoiceRef: 'NS-2026-041',
  payer,
  vault,
  amount: '1000000',
  maxFee: '0',
  createdAt: '2026-10-16T00:00:00Z',
  state: 'prepared',
};
function message(attested: boolean) {
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
      addressWord(payer),
      0n,
      0n,
      0n,
    ],
  );
}
let gateway: ReturnType<typeof cctpGateway>;
let sourceReceipt: { status: string; logs: ReturnType<typeof sent>[] };
let mintReceipt: {
  status: string;
  to: string;
  logs: { address: string; topics: unknown; data: Hex; logIndex: number }[];
};
const sent = () => ({
  address: CCTP.transmitter,
  topics: encodeEventTopics({ abi: transmitterAbi, eventName: 'MessageSent' }),
  data: encodeAbiParameters([{ type: 'bytes' }], [message(false)]),
  logIndex: 2,
});
const attested = (): BridgeIntent => ({
  ...initial,
  state: 'attested',
  sourceTx: sourceHash,
  sourceMessage: message(false),
  sourceLogIndex: 2,
  sourceKey: receiptAttributionId(84532, sourceHash, 2),
  message: message(true),
  nonce: idHash('nonce'),
  netAmount: '1000000',
  attestation: `0x${'11'.repeat(65)}`,
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.source.getChainId.mockResolvedValue(84532);
  mocks.destination.getChainId.mockResolvedValue(5042002);
  for (const [client, domain] of [
    [mocks.source, 6],
    [mocks.destination, 26],
  ] as const)
    client.readContract.mockImplementation(
      async ({ functionName }) =>
        ({
          localDomain: domain,
          remoteTokenMessengers: addressWord(CCTP.messenger),
          localMessageTransmitter: CCTP.transmitter,
          decimals: 6,
          usedNonces: 0n,
        })[functionName as 'localDomain'],
    );
  sourceReceipt = { status: 'success', logs: [sent()] };
  mocks.source.getTransactionReceipt.mockImplementation(async () => sourceReceipt);
  mocks.source.getTransaction.mockResolvedValue({
    from: payer,
    to: CCTP.messenger,
    input: burnCalls(initial, '0').burn.data,
  });
  const decoded = decodeCctp(message(true));
  mintReceipt = {
    status: 'success',
    to: CCTP.transmitter,
    logs: [
      {
        address: CCTP.destinationUsdc,
        topics: encodeEventTopics({
          abi: erc20Abi,
          eventName: 'Transfer',
          args: { from: zeroAddress, to: vault },
        }),
        data: encodeAbiParameters([{ type: 'uint256' }], [1000000n]),
        logIndex: 4,
      },
      {
        address: CCTP.transmitter,
        topics: encodeEventTopics({
          abi: transmitterAbi,
          eventName: 'MessageReceived',
          args: { caller: payer, nonce: decoded.nonce, finalityThresholdExecuted: 2000 },
        }),
        data: encodeAbiParameters(
          [{ type: 'uint32' }, { type: 'bytes32' }, { type: 'bytes' }],
          [6, addressWord(CCTP.messenger), decoded.body],
        ),
        logIndex: 5,
      },
    ],
  };
  mocks.destination.getTransactionReceipt.mockImplementation(async () => mintReceipt);
  mocks.destination.simulateContract.mockResolvedValue({});
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            messages: [
              { message: message(true), attestation: `0x${'11'.repeat(65)}`, status: 'complete' },
            ],
          }),
        ),
    ),
  );
  gateway = cctpGateway(vault, payer);
});
afterEach(() => vi.unstubAllGlobals());
describe('CCTP receipt and attestation gateway', () => {
  it('verifies actual burn calldata, event emitter and source identity', async () => {
    expect((await gateway.verifyBurn(initial, sourceHash)).sourceLogIndex).toBe(2);
    mocks.source.getTransaction.mockResolvedValueOnce({
      from: vault,
      to: CCTP.messenger,
      input: burnCalls(initial, '0').burn.data,
    });
    await expect(gateway.verifyBurn(initial, sourceHash)).rejects.toThrow('recorded payer');
    sourceReceipt.logs[0].address = vault;
    await expect(gateway.verifyBurn(initial, sourceHash)).rejects.toThrow('exactly one');
  });
  it('requires actual successful USDC mint plus the exact Circle message, not just a receipt status', async () => {
    expect((await gateway.verifyMint(attested(), mintHash)).attributionId).toBe(
      receiptAttributionId(5042002, mintHash, 4),
    );
    mintReceipt.logs.shift();
    await expect(gateway.verifyMint(attested(), mintHash)).rejects.toThrow('exact net USDC');
  });
  it('rejects wrong nonce, wrong mint destination, wrong value and ambiguous mint logs', async () => {
    const original = structuredClone(mintReceipt);
    mintReceipt.logs[1].topics = encodeEventTopics({
      abi: transmitterAbi,
      eventName: 'MessageReceived',
      args: { caller: payer, nonce: idHash('wrong'), finalityThresholdExecuted: 2000 },
    });
    await expect(gateway.verifyMint(attested(), mintHash)).rejects.toThrow('exact net USDC');
    mintReceipt = structuredClone(original);
    mintReceipt.logs[0].topics = encodeEventTopics({
      abi: erc20Abi,
      eventName: 'Transfer',
      args: { from: zeroAddress, to: payer },
    });
    await expect(gateway.verifyMint(attested(), mintHash)).rejects.toThrow('exact net USDC');
    mintReceipt = structuredClone(original);
    mintReceipt.logs[0].data = encodeAbiParameters([{ type: 'uint256' }], [999999n]);
    await expect(gateway.verifyMint(attested(), mintHash)).rejects.toThrow('exact net USDC');
    mintReceipt = structuredClone(original);
    mintReceipt.logs.push({ ...mintReceipt.logs[0], logIndex: 6 });
    await expect(gateway.verifyMint(attested(), mintHash)).rejects.toThrow('exact net USDC');
  });
  it('fails closed on source reorganization or invalid Circle signature simulation', async () => {
    await expect(gateway.attestation({ ...attested(), sourceLogIndex: 99 })).rejects.toThrow(
      'Source evidence changed',
    );
    expect(fetch).not.toHaveBeenCalled();
    mocks.destination.simulateContract.mockRejectedValueOnce(
      new Error('invalid attester signature'),
    );
    await expect(gateway.attestation(attested())).rejects.toThrow('invalid attester');
  });
  it('keeps incomplete attestations pending and avoids another mint when nonce was consumed', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ messages: [{ status: 'pending_confirmations', message: '0x' }] }),
      ),
    );
    expect(await gateway.attestation(attested())).toBeNull();
    const read = mocks.destination.readContract.getMockImplementation()!;
    mocks.destination.readContract.mockImplementation(async (args) =>
      args.functionName === 'usedNonces' ? 1n : read(args),
    );
    expect((await gateway.attestation(attested()))?.alreadyMinted).toBe(true);
    expect(mocks.destination.simulateContract).not.toHaveBeenCalled();
  });
  it('requires a vault attribution event bound to the exact invoice, net mint and evidence', async () => {
    const intent = {
      ...attested(),
      state: 'minted' as const,
      mintTx: mintHash,
      attributionId: receiptAttributionId(5042002, mintHash, 4),
    };
    const log = {
      address: vault,
      topics: encodeEventTopics({
        abi: attributionAbi,
        eventName: 'PaymentAttributed',
        args: { attributionId: intent.attributionId, projectId: intent.projectOnchainId },
      }),
      data: encodeAbiParameters(
        [{ type: 'bytes32' }, { type: 'uint256' }, { type: 'bytes32' }],
        [idHash(intent.invoiceRef), 1000000n, keccakEvidence(intent)],
      ),
      logIndex: 0,
    };
    mocks.destination.getTransactionReceipt.mockResolvedValue({ status: 'success', logs: [log] });
    expect((await gateway.verifyAttribution(intent, idHash('attribute'))).attributionTx).toBe(
      idHash('attribute'),
    );
    await expect(
      gateway.verifyAttribution({ ...intent, invoiceRef: 'different' }, idHash('attribute')),
    ).rejects.toThrow('exact invoice');
  });
});
