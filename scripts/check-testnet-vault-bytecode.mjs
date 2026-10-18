import fs from 'node:fs';
import { createPublicClient, http, keccak256 } from 'viem';

const proof = JSON.parse(fs.readFileSync('docs/sourcify-verification.json', 'utf8'));
const deployment = JSON.parse(fs.readFileSync('docs/arc-deployment.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('packages/core/src/vault-deployment.json', 'utf8'));
const expected = JSON.parse(fs.readFileSync('docs/testnet-bytecode-lock.json', 'utf8'));
const rpc = process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.io';
const client = createPublicClient({ transport: http(rpc, { timeout: 15_000, retryCount: 1 }) });

if (proof.vault.toLowerCase() !== deployment.vault.toLowerCase())
  throw new Error('Sourcify proof and deployment record name different vaults.');
if (
  proof.contract?.creationMatch !== 'exact_match' ||
  proof.contract?.runtimeMatch !== 'exact_match'
)
  throw new Error('The stored Sourcify result is not an exact creation and runtime match.');
if (manifest.compiler !== expected.selfServeManifest.compiler)
  throw new Error('The self-serve manifest compiler changed.');

const [chainId, runtime] = await Promise.all([
  client.getChainId(),
  client.getCode({ address: deployment.vault }),
]);
if (chainId !== deployment.chainId) throw new Error(`RPC returned chain ${chainId}.`);
if (!runtime) throw new Error('The verified vault has no deployed runtime code.');

const runtimeCodeHash = keccak256(runtime);
const manifestCreationCodeHash = keccak256(manifest.bytecode);
if (runtimeCodeHash !== expected.verifiedDeployment.runtimeCodeHash)
  throw new Error('The deployed V1 runtime changed from the reviewed lock.');
if (manifestCreationCodeHash !== expected.selfServeManifest.creationCodeHash)
  throw new Error('The pinned self-serve creation artifact changed from the reviewed lock.');

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      chainId,
      vault: deployment.vault,
      runtimeCodeHash,
      sourcifyCreationMatch: proof.contract.creationMatch,
      sourcifyRuntimeMatch: proof.contract.runtimeMatch,
      selfServeManifestCompiler: manifest.compiler,
      manifestCreationCodeHash,
      ok: true,
      note: 'This checks the deployed V1 runtime and the pinned self-serve V1 creation artifact. ProjectVaultV2 is a separate, undeployed mainnet candidate.',
    },
    null,
    2,
  ),
);
