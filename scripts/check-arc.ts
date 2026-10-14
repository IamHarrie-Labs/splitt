import { createPublicClient, defineChain, erc20Abi, http } from 'viem';
const chain = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
});
const client = createPublicClient({
  chain,
  transport: http(process.env.ARC_RPC_URL ?? chain.rpcUrls.default.http[0], {
    timeout: 15000,
    retryCount: 0,
  }),
});
const token = '0x3600000000000000000000000000000000000000';
const [chainId, block, decimals] = await Promise.all([
  client.getChainId(),
  client.getBlockNumber(),
  client.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
]);
if (chainId !== 5042002 || decimals !== 6)
  throw new Error('Arc network configuration does not match the spec.');
console.log(
  JSON.stringify(
    {
      chainId,
      block: block.toString(),
      erc20Decimals: decimals,
      nativeDecimals: 18,
      status:
        'Read-only checks passed; approve/transferFrom still require a funded testnet wallet.',
    },
    null,
    2,
  ),
);
