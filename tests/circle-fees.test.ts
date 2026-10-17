import { beforeEach, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({
  estimateContractExecutionFee: vi.fn(),
  createContractExecutionTransaction: vi.fn(),
}));
vi.mock('@circle-fin/developer-controlled-wallets', () => ({
  initiateDeveloperControlledWalletsClient: () => sdk,
}));
import { circleOperator, CircleFeeRejectedError } from '../server/src/circle/operator';
beforeEach(() => {
  vi.resetAllMocks();
  process.env.CIRCLE_API_KEY = 'test-fixture';
  process.env.CIRCLE_ENTITY_SECRET = 'test-fixture';
  process.env.CIRCLE_WALLET_ID = 'fixture-wallet';
});
const fee = { gasLimit: '300000', maxFee: '90', priorityFee: '70' };
it('uses the provider quote and rounds fractional gwei upward with a bounded buffer', async () => {
  sdk.estimateContractExecutionFee.mockResolvedValue({
    data: { medium: { gasLimit: '300000', maxFee: '90', priorityFee: '63.7820000103' } },
  });
  const quote = await circleOperator('0x1111111111111111111111111111111111111111').estimate(
    '0x1234',
  );
  expect(BigInt(quote.maxPriorityFeePerGas)).toBeGreaterThan(63782000010n);
  expect(quote.maxFeePerGas).toBe('99000000002');
});
it('distinguishes an explicit fee rejection from an uncertain provider response', async () => {
  const operator = circleOperator('0x1111111111111111111111111111111111111111');
  sdk.createContractExecutionTransaction.mockRejectedValueOnce({
    code: 2,
    status: 400,
    error: {
      response: {
        data: { errors: [{ message: 'priorityFee too low, current lower bound: 63.7820000103' }] },
      },
    },
  });
  await expect(operator.submit('0x1234', 'original-key', fee)).rejects.toBeInstanceOf(
    CircleFeeRejectedError,
  );
  const unknown = new Error('timeout');
  sdk.createContractExecutionTransaction.mockRejectedValueOnce(unknown);
  await expect(operator.submit('0x1234', 'original-key', fee)).rejects.toBe(unknown);
});
