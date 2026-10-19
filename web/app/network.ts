import { explorerAddress, explorerTx, resolveNetwork } from '@splitt/core';

/** The network this web build targets; set NEXT_PUBLIC_SPLITT_NETWORK=mainnet for Arc Mainnet. */
export const NETWORK = resolveNetwork(process.env.NEXT_PUBLIC_SPLITT_NETWORK);
export const LIVE_MODES = ['arc-testnet', 'arc-mainnet'];
export const txUrl = (hash: string) => explorerTx(NETWORK, hash);
export const addressUrl = (address: string) => explorerAddress(NETWORK, address);
export const switchNetworkMessage = `Switch your wallet to ${NETWORK.name} (chain ${NETWORK.chainId}), then sign again.`;
