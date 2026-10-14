import { registerEntitySecretCiphertext } from '@circle-fin/developer-controlled-wallets';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
if (!process.env.CIRCLE_API_KEY)
  throw new Error('Save a Circle test API key in the local .env file first.');
const file = new URL('../server/.secrets/circle-entity.json', import.meta.url);
const state = JSON.parse(await readFile(file, 'utf8'));
const recovery = new URL('../server/.secrets/circle-recovery/', import.meta.url);
await mkdir(recovery, { recursive: true });
if (state.attempted && !state.registered)
  throw new Error(
    'Registration outcome is unresolved. Check Circle Console before retrying; do not rotate the entity secret blindly.',
  );
if (!state.registered) {
  state.attempted = true;
  await writeFile(file, JSON.stringify(state), { mode: 0o600 });
  // The SDK prints the entity secret on success. Suppress that output in this isolated CLI.
  const log = console.log,
    info = console.info,
    warn = console.warn;
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  try {
    await registerEntitySecretCiphertext({
      apiKey: process.env.CIRCLE_API_KEY,
      entitySecret: state.entitySecret,
      recoveryFileDownloadPath: fileURLToPath(recovery),
    });
    state.registered = true;
    state.registeredAt = new Date().toISOString();
    await writeFile(file, JSON.stringify(state), { mode: 0o600 });
  } catch {
    throw new Error(
      'Circle registration is unresolved. Check your account before retrying. No secret was displayed.',
    );
  } finally {
    console.log = log;
    console.info = info;
    console.warn = warn;
  }
}
const envFile = new URL('../.env', import.meta.url);
let contents = await readFile(envFile, 'utf8');
contents = /^CIRCLE_ENTITY_SECRET=.*$/m.test(contents)
  ? contents.replace(/^CIRCLE_ENTITY_SECRET=.*$/m, `CIRCLE_ENTITY_SECRET=${state.entitySecret}`)
  : contents + `\nCIRCLE_ENTITY_SECRET=${state.entitySecret}\n`;
await writeFile(envFile, contents, { mode: 0o600 });
console.log(
  'Circle entity secret registered and saved locally. Recovery file is in the ignored secrets directory.',
);
