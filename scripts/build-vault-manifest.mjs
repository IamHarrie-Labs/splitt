import fs from 'node:fs';
import solc from 'solc';
const source = 'contracts/src/ProjectVault.sol';
const input = {
  language: 'Solidity',
  sources: { [source]: { content: fs.readFileSync(source, 'utf8') } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: 'paris',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};
const output = JSON.parse(
  solc.compile(JSON.stringify(input), {
    import: (name) => {
      try {
        return { contents: fs.readFileSync(`node_modules/${name}`, 'utf8') };
      } catch {
        return { error: 'Missing import' };
      }
    },
  }),
);
if (output.errors?.some((e) => e.severity === 'error'))
  throw new Error('Vault manifest compilation failed.');
const artifact = output.contracts[source].ProjectVault;
fs.writeFileSync(
  'packages/core/src/vault-deployment.json',
  JSON.stringify(
    {
      compiler: '0.8.28',
      chainId: 5042002,
      delaySeconds: 180,
      bytecode: `0x${artifact.evm.bytecode.object}`,
      abi: artifact.abi,
    },
    null,
    2,
  ) + '\n',
);
console.log('Built canonical self-serve vault creation manifest.');
