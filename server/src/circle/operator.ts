import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import type { Hex, Address } from 'viem';
export type OperatorFee = { gasLimit: string; maxFee: string; priorityFee: string };
export function circleOperator(targetVault?: Address) {
  const { CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, CIRCLE_WALLET_ID, VAULT_ADDRESS } = process.env;
  const vault = targetVault ?? VAULT_ADDRESS;
  if (!CIRCLE_API_KEY || !CIRCLE_ENTITY_SECRET || !CIRCLE_WALLET_ID || !vault)
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
    async submit(callData: Hex, idempotencyKey: string, fee?: OperatorFee) {
      const response = await client.createContractExecutionTransaction({
        walletId: CIRCLE_WALLET_ID,
        contractAddress: vault,
        callData,
        idempotencyKey,
        fee: fee
          ? { type: 'absolute', config: fee }
          : { type: 'level', config: { feeLevel: 'MEDIUM' } },
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
