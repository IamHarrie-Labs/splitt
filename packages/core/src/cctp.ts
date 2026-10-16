import {
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  keccak256,
  pad,
  parseAbi,
  sliceHex,
  size,
  zeroHash,
  type Address,
  type Hex,
} from 'viem';
import { addressSchema, moneySchema } from './index';
import { z } from 'zod';

/** Fixed testnet route, checked against Circle's official contract and USDC address registries. */
export const CCTP = {
  sourceChainId: 84532,
  sourceDomain: 6,
  destinationChainId: 5042002,
  destinationDomain: 26,
  sourceUsdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address,
  destinationUsdc: '0x3600000000000000000000000000000000000000' as Address,
  messenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA' as Address,
  transmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275' as Address,
  finality: 2000,
  iris: 'https://iris-api-sandbox.circle.com',
} as const;
export const messengerAbi = parseAbi([
  'function depositForBurn(uint256 amount,uint32 destinationDomain,bytes32 mintRecipient,address burnToken,bytes32 destinationCaller,uint256 maxFee,uint32 minFinalityThreshold)',
  'function localMessageTransmitter() view returns(address)',
  'function remoteTokenMessengers(uint32) view returns(bytes32)',
]);
export const transmitterAbi = parseAbi([
  'function localDomain() view returns(uint32)',
  'function usedNonces(bytes32) view returns(uint256)',
  'function receiveMessage(bytes message,bytes attestation) returns(bool)',
  'event MessageSent(bytes message)',
  'event MessageReceived(address indexed caller,uint32 sourceDomain,bytes32 indexed nonce,bytes32 sender,uint32 indexed finalityThresholdExecuted,bytes messageBody)',
]);
export const attributionAbi = parseAbi([
  'function attribute(bytes32 attributionId,bytes32 pid,bytes32 invoiceId,uint256 amount,bytes32 evidenceHash)',
  'function unattributed() view returns(uint256)',
  'function usedAttribution(bytes32) view returns(bool)',
  'event PaymentAttributed(bytes32 indexed attributionId,bytes32 indexed projectId,bytes32 invoiceId,uint256 amount,bytes32 evidenceHash)',
]);
export const bridgeInput = z
  .object({
    projectId: z.string().min(1).max(100),
    payer: addressSchema,
    amount: moneySchema.refine((s) => BigInt(s) > 0n),
    maxFee: moneySchema,
  })
  .strict()
  .refine(
    (x) => BigInt(x.maxFee) < BigInt(x.amount),
    'The fee limit must be lower than the burn amount.',
  );
export const txHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export type BridgeIntent = {
  id: string;
  projectId: string;
  projectOnchainId: Hex;
  invoiceRef: string;
  payer: Address;
  vault: Address;
  amount: string;
  maxFee: string;
  createdAt: string;
  state: 'prepared' | 'burn_confirmed' | 'attested' | 'minted' | 'attributed';
  sourceTx?: Hex;
  sourceLogIndex?: number;
  sourceMessage?: Hex;
  sourceKey?: Hex;
  attributionId?: Hex;
  message?: Hex;
  attestation?: Hex;
  nonce?: Hex;
  netAmount?: string;
  mintTx?: Hex;
  attributionTx?: Hex;
};
export type UnsignedCall = { chainId: number; to: Address; data: Hex };
export const addressWord = (address: Address) => pad(address, { size: 32 });
export function burnCalls(intent: BridgeIntent, allowance: string) {
  const call = (to: Address, data: Hex): UnsignedCall => ({
    chainId: CCTP.sourceChainId,
    to,
    data,
  });
  return {
    approve:
      BigInt(allowance) >= BigInt(intent.amount)
        ? null
        : call(
            CCTP.sourceUsdc,
            encodeFunctionData({
              abi: erc20Abi,
              functionName: 'approve',
              args: [CCTP.messenger, BigInt(intent.amount)],
            }),
          ),
    burn: call(
      CCTP.messenger,
      encodeFunctionData({
        abi: messengerAbi,
        functionName: 'depositForBurn',
        args: [
          BigInt(intent.amount),
          CCTP.destinationDomain,
          addressWord(intent.vault),
          CCTP.sourceUsdc,
          zeroHash,
          BigInt(intent.maxFee),
          CCTP.finality,
        ],
      }),
    ),
  };
}
export function decodeCctp(message: Hex) {
  if (!/^0x[0-9a-fA-F]+$/.test(message) || size(message) !== 376)
    throw new Error('Only standard CCTP V2 burn messages without hooks are supported.');
  const num = (at: number, length: number) => BigInt(sliceHex(message, at, at + length));
  const word = (at: number) => sliceHex(message, at, at + 32);
  return {
    version: num(0, 4),
    sourceDomain: num(4, 4),
    destinationDomain: num(8, 4),
    nonce: word(12),
    sender: word(44),
    recipient: word(76),
    caller: word(108),
    minFinality: num(140, 4),
    finality: num(144, 4),
    body: sliceHex(message, 148),
    bodyVersion: num(148, 4),
    burnToken: word(152),
    mintRecipient: word(184),
    amount: num(216, 32),
    payer: word(248),
    maxFee: num(280, 32),
    fee: num(312, 32),
    expiration: num(344, 32),
  };
}
export function checkCctpMessage(message: Hex, intent: BridgeIntent, attested = false) {
  const m = decodeCctp(message);
  const equal = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (
    m.version !== 1n ||
    m.bodyVersion !== 1n ||
    m.sourceDomain !== 6n ||
    m.destinationDomain !== 26n ||
    m.minFinality !== 2000n ||
    !equal(m.sender, addressWord(CCTP.messenger)) ||
    !equal(m.recipient, addressWord(CCTP.messenger)) ||
    m.caller !== zeroHash ||
    !equal(m.burnToken, addressWord(CCTP.sourceUsdc)) ||
    !equal(m.mintRecipient, addressWord(intent.vault)) ||
    !equal(m.payer, addressWord(intent.payer)) ||
    m.amount !== BigInt(intent.amount) ||
    m.maxFee !== BigInt(intent.maxFee) ||
    m.fee > m.maxFee ||
    m.fee >= m.amount
  )
    throw new Error('CCTP message does not match the recorded invoice intent.');
  if (attested && (m.nonce === zeroHash || m.finality < 2000n))
    throw new Error('A finalized, nonzero-nonce attestation is required.');
  return m;
}
export function receiptAttributionId(chainId: number, txHash: Hex, logIndex: number) {
  if (!Number.isSafeInteger(logIndex) || logIndex < 0) throw new Error('Invalid source log index.');
  return keccak256(
    encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'bytes32' }, { type: 'uint256' }],
      [BigInt(chainId), txHash, BigInt(logIndex)],
    ),
  );
}

export const sourceAttributionId = (txHash: Hex, logIndex: number) =>
  receiptAttributionId(84532, txHash, logIndex);

/** Circle reports basis points; round UP using integer arithmetic, never float money. */
export function minimumStandardFee(amount: string, basisPoints: string) {
  const rate = z
    .string()
    .regex(/^(0|[1-9]\d*)(\.\d{1,6})?$/)
    .parse(basisPoints);
  const [whole, fraction = ''] = rate.split('.');
  const scaled = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  if (scaled > 10000000000n) throw new Error('Invalid Circle fee rate.');
  return (BigInt(amount) * scaled + 9999999999n) / 10000000000n;
}
