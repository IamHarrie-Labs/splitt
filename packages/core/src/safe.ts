import { concat, getAddress, type Address, type Hex } from 'viem';

/**
 * A Safe answers ERC-1271 for a digest D when its owners have signed the Safe's own
 * EIP-712 "SafeMessage" wrapping D (Safe CompatibilityFallbackHandler, v1.3+). Each
 * owner signs this typed data in their own wallet; the API combines the signatures.
 */
export function safeMessageTypedData(safe: Address, chainId: number, digest: Hex) {
  return {
    domain: { chainId, verifyingContract: safe },
    types: { SafeMessage: [{ name: 'message', type: 'bytes' }] },
    primaryType: 'SafeMessage' as const,
    message: { message: digest },
  };
}

/**
 * Safe's checkSignatures needs 65-byte signatures ordered by strictly ascending owner
 * address. Takes the first `threshold` of them, so extra signatures never break it.
 */
export function combineSafeSignatures(signatures: Record<string, Hex>, threshold: number): Hex {
  const ordered = Object.entries(signatures)
    .map(([signer, signature]) => [BigInt(getAddress(signer)), signature] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, threshold);
  if (ordered.length < threshold) throw new Error('Not enough Safe owner signatures yet.');
  return concat(ordered.map(([, signature]) => signature));
}
