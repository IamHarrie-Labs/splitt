import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET)
  throw new Error('Configure your Circle test API key and registered entity secret in .env first.');
const file = new URL('../server/.secrets/circle-creation.json', import.meta.url);
await mkdir(new URL('.', file), { recursive: true });
type Creation = {
  setKey: string;
  walletKey: string;
  setId?: string;
  walletId?: string;
  address?: string;
};
let state: Creation;
try {
  state = JSON.parse(await readFile(file, 'utf8'));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  state = { setKey: randomUUID(), walletKey: randomUUID() };
  await writeFile(file, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
}
const save = () => writeFile(file, JSON.stringify(state), { mode: 0o600 });
const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});
if (!state.setId) {
  const result = await client.createWalletSet({
    name: 'Splitt Arc Testnet',
    idempotencyKey: state.setKey,
  });
  state.setId = result.data?.walletSet.id;
  if (!state.setId)
    throw new Error('Wallet set unresolved; rerun with the same saved creation keys.');
  await save();
}
if (!state.walletId) {
  const result = await client.createWallets({
    walletSetId: state.setId,
    blockchains: ['ARC-TESTNET'],
    count: 1,
    accountType: 'EOA',
    idempotencyKey: state.walletKey,
  });
  const wallet = result.data?.wallets?.[0];
  if (!wallet) throw new Error('Wallet creation unresolved; rerun with the same keys.');
  state.walletId = wallet.id;
  state.address = wallet.address;
  await save();
}
const envFile = new URL('../.env', import.meta.url);
let contents = await readFile(envFile, 'utf8');
for (const [name, value] of Object.entries({
  CIRCLE_WALLET_ID: state.walletId,
  OPERATOR_ADDRESS: state.address,
})) {
  if (!value) throw new Error('Circle wallet details are incomplete.');
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  contents = pattern.test(contents)
    ? contents.replace(pattern, `${name}=${value}`)
    : contents + `\n${name}=${value}\n`;
}
await writeFile(envFile, contents, { mode: 0o600 });
console.log(
  JSON.stringify(
    {
      CIRCLE_WALLET_ID: state.walletId,
      OPERATOR_ADDRESS: state.address,
      network: 'ARC-TESTNET',
      funded: false,
    },
    null,
    2,
  ),
);
