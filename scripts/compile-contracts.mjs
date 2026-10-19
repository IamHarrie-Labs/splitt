import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
export function compile(includeRuntime = false) {
  const files = [
    'contracts/src/ProjectVault.sol',
    'contracts/src/ProjectVaultV2.sol',
    'contracts/test/MockUSDC.sol',
    'contracts/test/MockMultisigOwner.sol',
  ];
  const input = {
    language: 'Solidity',
    sources: Object.fromEntries(
      files.map((file) => [file, { content: fs.readFileSync(file, 'utf8') }]),
    ),
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: 'paris',
      outputSelection: {
        '*': {
          // The AST names each immutable, so a deployed runtime can be predicted exactly.
          ...(includeRuntime ? { '': ['ast'] } : {}),
          '*': includeRuntime
            ? [
                'abi',
                'metadata',
                'evm.bytecode.object',
                'evm.deployedBytecode.object',
                'evm.deployedBytecode.immutableReferences',
              ]
            : ['abi', 'evm.bytecode.object'],
        },
      },
    },
  };
  const importedSources = {};
  const output = JSON.parse(
    solc.compile(JSON.stringify(input), {
      import: (name) => {
        try {
          const contents = fs.readFileSync(path.join('node_modules', name), 'utf8');
          importedSources[name] = { content: contents };
          return { contents };
        } catch {
          return { error: `Import missing: ${name}` };
        }
      },
    }),
  );
  const errors = (output.errors ?? []).filter((error) => error.severity === 'error');
  if (errors.length) throw new Error(errors.map((error) => error.formattedMessage).join('\n'));
  if (includeRuntime) {
    const names = {};
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.nodeType === 'VariableDeclaration' && node.mutability === 'immutable')
        names[node.id] = node.name;
      for (const value of Object.values(node)) walk(value);
    };
    for (const source of Object.values(output.sources ?? {})) walk(source.ast);
    for (const contracts of Object.values(output.contracts))
      for (const artifact of Object.values(contracts)) {
        const refs = artifact.evm?.deployedBytecode?.immutableReferences ?? {};
        artifact.immutableNames = Object.fromEntries(
          Object.keys(refs).map((id) => [id, names[id]]),
        );
      }
  }
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync(
    'artifacts/verification-input.json',
    JSON.stringify({ ...input, sources: { ...input.sources, ...importedSources } }, null, 2),
  );
  for (const contracts of Object.values(output.contracts))
    for (const [name, artifact] of Object.entries(contracts))
      if (artifact.evm.bytecode.object)
        fs.writeFileSync(`artifacts/${name}.json`, JSON.stringify(artifact, null, 2));
  return output.contracts;
}
if (process.argv[1]?.endsWith('compile-contracts.mjs')) {
  compile();
  console.log('Solidity 0.8.28: testnet vault, mainnet candidate and mock compiled successfully.');
}
