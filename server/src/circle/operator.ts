import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import type { Hex } from 'viem';
export function circleOperator() {
  const { CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, CIRCLE_WALLET_ID, VAULT_ADDRESS } = process.env;
  if (!CIRCLE_API_KEY || !CIRCLE_ENTITY_SECRET || !CIRCLE_WALLET_ID || !VAULT_ADDRESS)
    throw new Error('Circle execution is not configured.');
  const client = initiateDeveloperControlledWalletsClient({
    apiKey: CIRCLE_API_KEY,
    entitySecret: CIRCLE_ENTITY_SECRET,
  });
  return {
    async verify(expectedAddress: string) {
      const wallet = (await client.getWallet({ id: CIRCLE_WALLET_ID })).data?.wallet;
      if (
        !wallet ||
        wallet.blockchain !== 'ARC-TESTNET' ||
        wallet.address.toLowerCase() !== expectedAddress.toLowerCase()
      )
        throw new Error('Circle wallet must match the vault operator on ARC-TESTNET.');
    },
    async submit(callData: Hex, idempotencyKey: string) {
      const response = await client.createContractExecutionTransaction({
        walletId: CIRCLE_WALLET_ID,
        contractAddress: VAULT_ADDRESS,
        callData,
        idempotencyKey,
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });
      if (!response.data?.id)
        throw new Error('Circle did not return a transaction ID; reconcile before retrying.');
      return response.data.id;
    },
    async status(id: string) {
      return (await client.getTransaction({ id })).data?.transaction;
    },
  };
}
