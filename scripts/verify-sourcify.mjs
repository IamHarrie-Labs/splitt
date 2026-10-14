import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const solc = createRequire(import.meta.url)('solc');
const deployment = JSON.parse(await readFile(new URL('../docs/arc-deployment.json', import.meta.url), 'utf8'));
if (deployment.chainId !== 5042002) throw new Error('Arc Testnet only.');
const base = 'https://sourcify.dev/server';
const file = new URL('../docs/sourcify-verification.json', import.meta.url);
async function request(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'User-Agent': 'Splitt/0.1 (Arc Testnet ProjectVault verification)', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (response.status === 409 && result.customCode === 'already_verified') return { alreadyVerified: true };
  if (!response.ok) throw new Error(`Sourcify ${response.status}: ${JSON.stringify(result)}`);
  return result;
}
let state = { vault: deployment.vault, chainId: deployment.chainId, verified: false };
try {
  const previous = JSON.parse(await readFile(file, 'utf8'));
  if (previous.vault === deployment.vault) state = previous;
} catch (error) { if (error.code !== 'ENOENT') throw error; }
if (state.verified) { console.log(JSON.stringify(state, null, 2)); process.exit(0); }
try {
  const chains = await request('/chains');
  const chain = chains.find((entry) => Number(entry.chainId) === deployment.chainId);
  if (!chain?.supported) throw new Error('Sourcify does not currently support Arc Testnet verification.');
  if (!state.verificationId) {
    const ticket = await request(`/v2/verify/${deployment.chainId}/${deployment.vault}`, {
      stdJsonInput: JSON.parse(await readFile(new URL('../artifacts/verification-input.json', import.meta.url), 'utf8')),
      compilerVersion: solc.version().split('.Emscripten')[0],
      contractIdentifier: 'contracts/src/ProjectVault.sol:ProjectVault',
      creationTransactionHash: deployment.txHash,
    });
    state.verificationId = ticket.verificationId;
    state.alreadyVerified = ticket.alreadyVerified === true;
    if (!state.verificationId && !state.alreadyVerified) throw new Error('No verification ticket returned.');
    await writeFile(file, JSON.stringify(state, null, 2));
  }
  if (state.verificationId) state.job = await request(`/v2/verify/${state.verificationId}`);
  if (state.alreadyVerified || state.job?.isJobCompleted) {
    const contract = await request(`/v2/contract/${deployment.chainId}/${deployment.vault}`);
    state.contract = contract;
    state.verified = ['exact_match', 'match'].includes(contract.runtimeMatch) && ['exact_match', 'match'].includes(contract.creationMatch);
    state.url = `https://repo.sourcify.dev/${deployment.chainId}/${deployment.vault}`;
    delete state.error;
  }
} catch (error) { state.error = error.message; }
state.checkedAt = new Date().toISOString();
await writeFile(file, JSON.stringify(state, null, 2));
console.log(JSON.stringify(state, null, 2));
