import { encodeDeployData, parseAbi, type Address, type Hex } from 'viem';
import manifest from './vault-deployment.json';
export const SELF_SERVE = {
  chainId: 5042002,
  usdc: '0x3600000000000000000000000000000000000000' as Address,
  delaySeconds: 180,
  maxVaults: 100,
  maxProjects: 1,
  maxContractors: 2,
  maxInvoice: '10000000',
  maxBatch: '5000000',
  walletDailyBatches: 3,
  globalDailyBatches: 30,
  walletDailyGas: '250000000000000000',
  globalDailyGas: '1000000000000000000',
  lifetimeGas: '10000000000000000000',
} as const;
export const constructorAbi = parseAbi([
  'constructor(address token,address initialOwner,address initialOperator,uint64 delaySeconds)',
]);
export function vaultCreation(owner: Address, operator: Address) {
  return encodeDeployData({
    abi: constructorAbi,
    bytecode: manifest.bytecode as Hex,
    args: [SELF_SERVE.usdc, owner, operator, BigInt(SELF_SERVE.delaySeconds)],
  });
}
