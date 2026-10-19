import type { Address } from 'viem';

/**
 * Everything that differs between Arc Testnet and Arc Mainnet lives here, so the
 * server and the web app read one definition instead of scattering chain IDs.
 */
export type SplittNetwork = {
  id: 'testnet' | 'mainnet';
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  /** Arc's ERC-20 USDC interface (6 decimals); the same address on both networks. */
  usdc: Address;
  /** Circle developer-controlled wallet blockchain identifier for the operator. */
  circleBlockchain: 'ARC-TESTNET' | 'ARC';
  /** EIP-712 domain version of the vault contract: V1 on testnet, V2 on mainnet. */
  vaultDomainVersion: '1' | '2';
  /** Public self-serve vaults deploy the pinned V1 artifact, so they stay on testnet. */
  selfServe: boolean;
  /** The CCTP funding bridge routes Base Sepolia to Arc Testnet only. */
  bridge: boolean;
};

export const NETWORKS: Record<SplittNetwork['id'], SplittNetwork> = {
  testnet: {
    id: 'testnet',
    name: 'Arc Testnet',
    chainId: 5042002,
    rpcUrl: 'https://rpc.testnet.arc.io',
    explorerUrl: 'https://explorer.testnet.arc.io',
    usdc: '0x3600000000000000000000000000000000000000',
    circleBlockchain: 'ARC-TESTNET',
    vaultDomainVersion: '1',
    selfServe: true,
    bridge: true,
  },
  mainnet: {
    id: 'mainnet',
    name: 'Arc Mainnet',
    chainId: 5042,
    rpcUrl: 'https://rpc.mainnet.arc.io',
    explorerUrl: 'https://explorer.arc.io',
    usdc: '0x3600000000000000000000000000000000000000',
    circleBlockchain: 'ARC',
    vaultDomainVersion: '2',
    selfServe: false,
    bridge: false,
  },
};

/** Unset means testnet; anything other than the two known names fails closed. */
export function resolveNetwork(value?: string | null): SplittNetwork {
  const key = (value ?? '').trim().toLowerCase();
  if (!key || key === 'testnet' || key === 'arc-testnet') return NETWORKS.testnet;
  if (key === 'mainnet' || key === 'arc-mainnet') return NETWORKS.mainnet;
  throw new Error(`Unknown Splitt network "${value}". Use testnet or mainnet.`);
}

export const explorerTx = (network: SplittNetwork, hash: string) =>
  `${network.explorerUrl}/tx/${hash}`;
export const explorerAddress = (network: SplittNetwork, address: string) =>
  `${network.explorerUrl}/address/${address}`;
