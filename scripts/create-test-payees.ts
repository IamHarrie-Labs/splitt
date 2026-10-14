import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir(new URL('../server/.secrets/', import.meta.url), { recursive: true });
const wallets = ['amara', 'tobi'].map((name) => {
  const privateKey = generatePrivateKey();
  return { name, address: privateKeyToAccount(privateKey).address, privateKey };
});
await writeFile(
  new URL('../server/.secrets/test-payees.json', import.meta.url),
  JSON.stringify(wallets, null, 2),
  { flag: 'wx', mode: 0o600 },
);
await writeFile(
  new URL('../docs/test-payees.json', import.meta.url),
  JSON.stringify(
    wallets.map(({ name, address }) => ({ name, address })),
    null,
    2,
  ),
);
console.log(
  'Created two local test-only payee wallets. Public addresses are in docs/test-payees.json. Private files remain ignored.',
);
