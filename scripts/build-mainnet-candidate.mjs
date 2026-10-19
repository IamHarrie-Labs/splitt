import fs from 'node:fs';
import solc from 'solc';
import { keccak256, stringToHex } from 'viem';
import { compile } from './compile-contracts.mjs';

const sourcePath = 'contracts/src/ProjectVaultV2.sol';
const source = fs.readFileSync(sourcePath, 'utf8');
const artifact = compile(true)[sourcePath].ProjectVaultV2;
const manifest = {
  contract: 'ProjectVaultV2',
  source: sourcePath,
  compiler: solc.version(),
  settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: 'paris' },
  eip712: { name: 'Splitt', version: '2' },
  sourceHash: keccak256(stringToHex(source)),
  creationCodeHash: keccak256(`0x${artifact.evm.bytecode.object}`),
  runtimeTemplateHash: keccak256(`0x${artifact.evm.deployedBytecode.object}`),
  immutableReferences: artifact.evm.deployedBytecode.immutableReferences,
  immutableNames: artifact.immutableNames,
  deploymentStatus: 'blocked_pending_audit_and_production_controls',
  note: 'Runtime changes when constructor immutables are embedded. Lock the audited deployed runtime hash separately before release.',
};
fs.writeFileSync('docs/mainnet-candidate.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
