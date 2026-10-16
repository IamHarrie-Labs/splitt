import {
  createPublicClient,
  http,
  erc20Abi,
  decodeEventLog,
  encodeFunctionData,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import {
  CCTP,
  messengerAbi,
  transmitterAbi,
  attributionAbi,
  addressWord,
  burnCalls,
  checkCctpMessage,
  minimumStandardFee,
  sourceAttributionId,
  receiptAttributionId,
  type BridgeIntent,
  type UnsignedCall,
} from '../../../packages/core/src/cctp.js';
import { arc } from '../live/chain.js';
import { idHash } from '@splitt/core';
import { z } from 'zod';
const attestationResponse = z.object({
  messages: z
    .array(
      z.object({ message: z.string(), attestation: z.string().optional(), status: z.string() }),
    )
    .max(100),
});
const bytes = (s: string): s is Hex => /^0x(?:[0-9a-fA-F]{2})+$/.test(s);
export function cctpGateway(vault: Address, owner: Address) {
  const source = createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org', {
      timeout: 15000,
      retryCount: 0,
    }),
  });
  const destination = createPublicClient({
    chain: arc,
    transport: http(process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.io', {
      timeout: 15000,
      retryCount: 0,
    }),
  });
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const call = (chainId: number, to: Address, data: Hex): UnsignedCall => ({ chainId, to, data });
  async function verify() {
    const ids = await Promise.all([source.getChainId(), destination.getChainId()]);
    if (ids[0] !== 84532 || ids[1] !== 5042002)
      throw new Error('CCTP requires Base Sepolia and Arc Testnet.');
    const checks = await Promise.all(
      [source, destination].map(async (client, index) => {
        const domain = await client.readContract({
          address: CCTP.transmitter,
          abi: transmitterAbi,
          functionName: 'localDomain',
        });
        const remote = await client.readContract({
          address: CCTP.messenger,
          abi: messengerAbi,
          functionName: 'remoteTokenMessengers',
          args: [index === 0 ? 26 : 6],
        });
        const transmitter = await client.readContract({
          address: CCTP.messenger,
          abi: messengerAbi,
          functionName: 'localMessageTransmitter',
        });
        const decimals = await client.readContract({
          address: index === 0 ? CCTP.sourceUsdc : CCTP.destinationUsdc,
          abi: erc20Abi,
          functionName: 'decimals',
        });
        return (
          domain === (index === 0 ? 6 : 26) &&
          eq(remote, addressWord(CCTP.messenger)) &&
          eq(transmitter, CCTP.transmitter) &&
          decimals === 6
        );
      }),
    );
    if (checks.some((x) => !x))
      throw new Error(
        'CCTP contract route configuration does not match Circle testnet registries.',
      );
  }
  async function preflight(payer: Address, amount: string) {
    await verify();
    // Base's deployed TokenMessengerV2 lacks the newer onchain fee-switch getter.
    // Use Circle's live route quote; never turn a reverted getter into a zero fee.
    const response = await fetch(`${CCTP.iris}/v2/burn/USDC/fees/6/26`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Circle fee quote unavailable. Retry before burning.');
    const quotes = z
      .array(
        z.object({ finalityThreshold: z.number(), minimumFee: z.union([z.string(), z.number()]) }),
      )
      .parse(await response.json());
    const standard = quotes.filter((q) => q.finalityThreshold === 2000);
    if (standard.length !== 1) throw new Error('No unambiguous standard-transfer fee quote.');
    const [minimumFee, balance, native, allowance] = await Promise.all([
      minimumStandardFee(amount, String(standard[0].minimumFee)),
      source.readContract({
        address: CCTP.sourceUsdc,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [payer],
      }),
      source.getBalance({ address: payer }),
      source.readContract({
        address: CCTP.sourceUsdc,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [payer, CCTP.messenger],
      }),
    ]);
    return {
      minimumFee: String(minimumFee),
      usdcBalance: String(balance),
      nativeBalance: String(native),
      allowance: String(allowance),
      funded: balance >= BigInt(amount) && native > 0n,
    };
  }
  const prepareBurn = burnCalls;
  async function verifyBurn(intent: BridgeIntent, txHash: Hex) {
    await verify();
    const [receipt, tx] = await Promise.all([
      source.getTransactionReceipt({ hash: txHash }),
      source.getTransaction({ hash: txHash }),
    ]);
    if (
      receipt.status !== 'success' ||
      !tx.to ||
      !eq(tx.to, CCTP.messenger) ||
      !eq(tx.from, intent.payer)
    )
      throw new Error(
        'Source burn is not a successful transaction from the recorded payer to Circle.',
      );
    const expected = prepareBurn(intent, intent.amount).burn.data;
    if (!eq(tx.input, expected))
      throw new Error('Source burn calldata differs from the invoice intent.');
    const messages: { message: Hex; logIndex: number }[] = [];
    for (const log of receipt.logs) {
      if (!eq(log.address, CCTP.transmitter)) continue;
      try {
        const e = decodeEventLog({ abi: transmitterAbi, data: log.data, topics: log.topics });
        if (e.eventName === 'MessageSent') {
          checkCctpMessage(e.args.message, intent);
          messages.push({ message: e.args.message, logIndex: log.logIndex });
        }
      } catch {
        /* Reject later if no exact route/intent event exists. */
      }
    }
    if (messages.length !== 1)
      throw new Error('Expected exactly one matching Circle burn message.');
    const match = messages[0];
    return {
      sourceTx: txHash,
      sourceMessage: match.message,
      sourceLogIndex: match.logIndex,
      sourceKey: sourceAttributionId(txHash, match.logIndex),
    };
  }
  async function attestation(intent: BridgeIntent) {
    if (!intent.sourceTx || !intent.sourceMessage) throw new Error('Record a verified burn first.');
    const fresh = await verifyBurn(intent, intent.sourceTx);
    if (
      fresh.sourceLogIndex !== intent.sourceLogIndex ||
      !eq(fresh.sourceMessage, intent.sourceMessage) ||
      !intent.sourceKey ||
      !eq(fresh.sourceKey, intent.sourceKey)
    )
      throw new Error('Source evidence changed. Review the recorded burn before continuing.');
    const response = await fetch(`${CCTP.iris}/v2/messages/6?transactionHash=${intent.sourceTx}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 404) return null;
    if (!response.ok)
      throw new Error('Circle attestation is unavailable. Retry without burning again.');
    const data = attestationResponse.parse(await response.json());
    const candidates = data.messages.filter((item) => {
      if (
        item.status !== 'complete' ||
        !bytes(item.message) ||
        !item.attestation ||
        !bytes(item.attestation)
      )
        return false;
      try {
        checkCctpMessage(item.message, intent, true);
        return true;
      } catch {
        return false;
      }
    });
    if (!candidates.length) return null;
    if (candidates.length !== 1)
      throw new Error('Multiple attestations match. Owner review required.');
    const item = candidates[0],
      message = item.message as Hex,
      signature = item.attestation as Hex;
    if ((signature.length - 2) % 130 !== 0)
      throw new Error('Invalid Circle attestation signature format.');
    const parsed = checkCctpMessage(message, intent, true);
    const used = await destination.readContract({
      address: CCTP.transmitter,
      abi: transmitterAbi,
      functionName: 'usedNonces',
      args: [parsed.nonce],
    });
    if (used === 0n)
      await destination.simulateContract({
        account: owner,
        address: CCTP.transmitter,
        abi: transmitterAbi,
        functionName: 'receiveMessage',
        args: [message, signature],
      });
    return {
      message,
      attestation: signature,
      nonce: parsed.nonce,
      netAmount: String(parsed.amount - parsed.fee),
      alreadyMinted: used !== 0n,
    };
  }
  function mintCall(intent: BridgeIntent) {
    if (!intent.message || !intent.attestation)
      throw new Error('A verified attestation is required.');
    return call(
      5042002,
      CCTP.transmitter,
      encodeFunctionData({
        abi: transmitterAbi,
        functionName: 'receiveMessage',
        args: [intent.message, intent.attestation],
      }),
    );
  }
  async function verifyMint(intent: BridgeIntent, hash: Hex) {
    if (!intent.message || !intent.nonce || !intent.netAmount)
      throw new Error('Record the attestation first.');
    const parsed = checkCctpMessage(intent.message, intent, true);
    if (!eq(intent.nonce, parsed.nonce) || BigInt(intent.netAmount) !== parsed.amount - parsed.fee)
      throw new Error('Stored mint facts differ from the attested message.');
    const receipt = await destination.getTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error('The destination mint is not confirmed.');
    if (!receipt.to || !eq(receipt.to, CCTP.transmitter))
      throw new Error(
        'Use the direct Circle receiveMessage transaction, not a batched relayer receipt.',
      );
    const matched = receipt.logs.some((log) => {
      if (!eq(log.address, CCTP.transmitter)) return false;
      try {
        const e = decodeEventLog({ abi: transmitterAbi, data: log.data, topics: log.topics });
        return (
          e.eventName === 'MessageReceived' &&
          e.args.sourceDomain === 6 &&
          eq(e.args.nonce, parsed.nonce) &&
          e.args.sender.toLowerCase() === addressWord(CCTP.messenger).toLowerCase() &&
          e.args.finalityThresholdExecuted >= 2000 &&
          e.args.messageBody.toLowerCase() === parsed.body.toLowerCase()
        );
      } catch {
        return false;
      }
    });
    const mintLogs = receipt.logs
      .filter((log) => eq(log.address, CCTP.destinationUsdc))
      .filter((log) => {
        try {
          const e = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
          return (
            e.eventName === 'Transfer' &&
            eq(e.args.from, zeroAddress) &&
            eq(e.args.to, vault) &&
            e.args.value === BigInt(intent.netAmount!)
          );
        } catch {
          return false;
        }
      });
    if (!matched || mintLogs.length !== 1)
      throw new Error(
        'Destination receipt does not prove this message minted the exact net USDC into the vault.',
      );
    return {
      mintTx: hash,
      attributionId: receiptAttributionId(5042002, hash, mintLogs[0].logIndex),
    };
  }
  async function prepareAttribution(intent: BridgeIntent) {
    if (!intent.mintTx || !intent.attributionId || !intent.netAmount)
      throw new Error('Verify the destination mint first.');
    const mint = await verifyMint(intent, intent.mintTx);
    if (!eq(mint.attributionId, intent.attributionId))
      throw new Error('Mint receipt changed. Review before attributing.');
    const evidenceHash = keccakEvidence(intent);
    const args = [
      intent.attributionId,
      intent.projectOnchainId,
      idHash(intent.invoiceRef),
      BigInt(intent.netAmount),
      evidenceHash,
    ] as const;
    await destination.simulateContract({
      account: owner,
      address: vault,
      abi: attributionAbi,
      functionName: 'attribute',
      args,
    });
    return call(
      5042002,
      vault,
      encodeFunctionData({ abi: attributionAbi, functionName: 'attribute', args }),
    );
  }
  async function verifyAttribution(intent: BridgeIntent, hash: Hex) {
    if (!intent.attributionId || !intent.netAmount) throw new Error('No verified bridge mint.');
    const receipt = await destination.getTransactionReceipt({ hash });
    const valid =
      receipt.status === 'success' &&
      receipt.logs.some((log) => {
        if (!eq(log.address, vault)) return false;
        try {
          const e = decodeEventLog({ abi: attributionAbi, data: log.data, topics: log.topics });
          return (
            e.eventName === 'PaymentAttributed' &&
            eq(e.args.attributionId, intent.attributionId!) &&
            eq(e.args.projectId, intent.projectOnchainId) &&
            eq(e.args.invoiceId, idHash(intent.invoiceRef)) &&
            e.args.amount === BigInt(intent.netAmount!) &&
            eq(e.args.evidenceHash, keccakEvidence(intent))
          );
        } catch {
          return false;
        }
      });
    if (!valid)
      throw new Error(
        'Receipt does not prove owner attribution for this exact invoice and net amount.',
      );
    return { attributionTx: hash };
  }
  return {
    verify,
    preflight,
    prepareBurn,
    verifyBurn,
    attestation,
    mintCall,
    verifyMint,
    prepareAttribution,
    verifyAttribution,
  };
}
import { hashJson } from '@splitt/core';
export function keccakEvidence(intent: BridgeIntent) {
  return hashJson({
    sourceChainId: 84532,
    sourceTx: intent.sourceTx,
    sourceLogIndex: intent.sourceLogIndex,
    sourceMessage: intent.sourceMessage,
    mintTx: intent.mintTx,
    projectId: intent.projectId,
    invoiceRef: intent.invoiceRef,
    netAmount: intent.netAmount,
  });
}
export type CctpGateway = ReturnType<typeof cctpGateway>;
