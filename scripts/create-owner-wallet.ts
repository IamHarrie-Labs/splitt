import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { mkdir, writeFile } from 'node:fs/promises';
const directory = new URL('../server/.secrets/', import.meta.url);
await mkdir(directory, { recursive: true });
const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);
// Exclusive creation prevents silently replacing an existing owner wallet.
await writeFile(
  new URL('owner-wallet.json', directory),
  JSON.stringify({ address: account.address, privateKey }, null, 2),
  { flag: 'wx', mode: 0o600 },
);
await writeFile(
  new URL('../docs/owner-wallet.json', import.meta.url),
  JSON.stringify(
    {
      address: account.address,
      chainId: 5042002,
      network: 'Arc Testnet',
      purpose: 'Splitt owner',
      funded: false,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      address: account.address,
      network: 'Arc Testnet',
      privateKeyLocation: 'server/.secrets/owner-wallet.json',
      status: 'Created locally; not funded. Never upload the private wallet file.',
    },
    null,
    2,
  ),
);
