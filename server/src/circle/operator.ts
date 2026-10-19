import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { parseGwei, type Hex, type Address } from 'viem';
import { NETWORK } from '../network.js';
export type OperatorFee = { gasLimit: string; maxFee: string; priorityFee: string };
export class CircleFeeRejectedError extends Error {}
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
    async estimate(callData: Hex) {
      const quote = (
        await client.estimateContractExecutionFee({
          source: { walletId: CIRCLE_WALLET_ID },
          contractAddress: vault,
          callData,
        })
      ).data?.medium;
      if (!quote?.maxFee || !quote.priorityFee || !quote.gasLimit)
        throw new Error('Circle fee estimate is unavailable.');
      // Circle can quote more than nine decimal places in gwei. Round upward,
      // then leave a small buffer without exceeding the durable gas budget.
      const wei = (value: string) => ((parseGwei(value) + 1n) * 110n + 99n) / 100n;
      return {
        gasLimit: quote.gasLimit,
        maxFeePerGas: String(wei(quote.maxFee)),
        maxPriorityFeePerGas: String(wei(quote.priorityFee)),
      };
    },
    async verify(expectedAddress: string) {
      const wallet = (await client.getWallet({ id: CIRCLE_WALLET_ID })).data?.wallet;
      if (
        !wallet ||
        wallet.blockchain !== NETWORK.circleBlockchain ||
        wallet.address.toLowerCase() !== expectedAddress.toLowerCase()
      )
        throw new Error(
          `Circle wallet must match the vault operator on ${NETWORK.circleBlockchain}.`,
        );
    },
    async submit(callData: Hex, idempotencyKey: string, fee?: OperatorFee) {
      let response;
      try {
        response = await client.createContractExecutionTransaction({
          walletId: CIRCLE_WALLET_ID,
          contractAddress: vault,
          callData,
          idempotencyKey,
          fee: fee
            ? { type: 'absolute', config: fee }
            : { type: 'level', config: { feeLevel: 'MEDIUM' } },
        });
      } catch (error) {
        const e = error as {
          code?: number;
          status?: number;
          error?: { response?: { data?: { errors?: { message?: string }[] } } };
        };
        if (
          e.code === 2 &&
          e.status === 400 &&
          e.error?.response?.data?.errors?.some((field) =>
            /^priorityFee too low, current lower bound: [0-9.]+$/.test(field.message ?? ''),
          )
        )
          throw new CircleFeeRejectedError(
            'Circle rejected the fee before accepting this request.',
          );
        throw error;
      }
      if (!response.data?.id)
        throw new Error('Circle did not return a transaction ID; reconcile before retrying.');
      return response.data.id;
    },
    async status(id: string) {
      return (await client.getTransaction({ id })).data?.transaction;
    },
  };
}
