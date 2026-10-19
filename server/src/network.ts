import { resolveNetwork } from '@splitt/core';

/** The network this API process serves, chosen by SPLITT_MODE; fixture mode uses testnet values. */
export const NETWORK = resolveNetwork(
  process.env.SPLITT_MODE === 'arc-mainnet' ? 'mainnet' : 'testnet',
);
