import { readFile, writeFile } from 'node:fs/promises';
import { encodeAbiParameters } from 'viem';
import { createRequire } from 'node:module';
const solc = createRequire(import.meta.url)('solc') as { version(): string };
const deployment = JSON.parse(
  await readFile(new URL('../docs/arc-deployment.json', import.meta.url), 'utf8'),
);
if (deployment.chainId !== 5042002) throw new Error('Verification is Arc Testnet only.');
const base = 'https://explorer.testnet.arc.io/api';
async function request(action: string, fields: Record<string, string> = {}) {
  const url = new URL(base);
  url.searchParams.set('module', 'contract');
  url.searchParams.set('action', action);
  for (const [key, value] of Object.entries(fields)) url.searchParams.set(key, value);
  return (await fetch(url, { signal: AbortSignal.timeout(20000) })).json();
}
const initial = await request('getsourcecode', { address: deployment.vault });
let verified = !!initial.result?.[0]?.SourceCode;
const file = new URL('../docs/arc-verification.json', import.meta.url);
let state: { vault: string; guid?: string; verified: boolean; response?: string } = {
  vault: deployment.vault,
  verified,
};
try {
  const previous = JSON.parse(await readFile(file, 'utf8'));
  if (previous.vault === deployment.vault) state = { ...previous, verified };
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
}
if (!verified && !state.guid) {
  const form = new FormData();
  const args = encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'uint64' }],
    ['0x3600000000000000000000000000000000000000', deployment.owner, deployment.operator, 86400n],
  ).slice(2);
  const fields = {
    contractaddress: deployment.vault,
    contractname: 'contracts/src/ProjectVault.sol:ProjectVault',
    codeformat: 'solidity-standard-json-input',
    sourceCode: await readFile(
      new URL('../artifacts/verification-input.json', import.meta.url),
      'utf8',
    ),
    compilerversion: `v${solc.version().split('.Emscripten')[0]}`,
    constructorArguments: args,
    licenseType: '3',
  };
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  const result = await (
    await fetch(`${base}?module=contract&action=verifysourcecode`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30000),
    })
  ).json();
  if (result.status === '1' && typeof result.result === 'string') state.guid = result.result;
  state.response = JSON.stringify(result);
  await writeFile(file, JSON.stringify(state, null, 2));
  if (!state.guid)
    throw new Error(`Explorer verification did not accept the request: ${JSON.stringify(result)}`);
}
for (let attempt = 0; !verified && state.guid && attempt < 2; attempt++) {
  const status = await request('checkverifystatus', { guid: state.guid });
  state.response = JSON.stringify(status);
  if (/too many|rate limit/i.test(state.response ?? '')) break;
  const current = await request('getsourcecode', { address: deployment.vault });
  verified = !!current.result?.[0]?.SourceCode;
  if (verified) break;
  if (!/pending|queue/i.test(state.response ?? '')) break;
  await new Promise((resolve) => setTimeout(resolve, 6000));
}
state.verified = verified;
if (verified) state.response = 'Verified source code returned by the Arc explorer.';
const result = { ...state, checkedAt: new Date().toISOString() };
await writeFile(file, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
