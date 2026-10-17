import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const entries = [
  '.github',
  '.dockerignore',
  '.env.example',
  '.gitignore',
  '.vercelignore',
  '.prettierrc.json',
  'LICENSE',
  'README.md',
  'brand.md',
  'compose.yaml',
  'compose.vps.yaml',
  'Caddyfile',
  'Dockerfile.api',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vitest.config.ts',
  'contracts',
  'docs',
  'fixtures',
  'packages',
  'scripts',
  'server',
  'tests',
  'video',
  'web',
];
const skip = new Set(['node_modules', '.next', '.secrets', '.data', 'out', 'cache', 'coverage']);
const files = [];
async function visit(relative) {
  const absolute = path.join(root, relative);
  const stat = await (await import('node:fs/promises')).stat(absolute);
  if (!stat.isDirectory()) {
    if (
      !relative.endsWith('.tsbuildinfo') &&
      (!path.basename(relative).startsWith('.env') || relative === '.env.example')
    )
      files.push(relative);
    return;
  }
  for (const entry of await readdir(absolute, { withFileTypes: true }))
    if (!skip.has(entry.name) && !entry.isSymbolicLink())
      await visit(path.join(relative, entry.name));
}
for (const entry of entries) await visit(entry);
const secrets = [];
for (const envFile of [
  '.env',
  '.env.local',
  '.env.testnet.local',
  'web/.env.local',
  'server/.secrets/anthropic.env',
  'server/.secrets/vps.env',
]) {
  try {
    const env = await readFile(path.join(root, envFile), 'utf8');
    for (const line of env.split(/\r?\n/)) {
      const match = line.match(
        /^(?:CIRCLE_API_KEY|CIRCLE_ENTITY_SECRET|ANTHROPIC_API_KEY|AI_GATEWAY_API_KEY|VERCEL_OIDC_TOKEN|DATABASE_URL)=(.+)$/,
      );
      if (match) {
        const value = match[1].replace(/^['"]|['"]$/g, '');
        if (value.length >= 16) secrets.push(value);
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
try {
  const wallet = JSON.parse(
    await readFile(path.join(root, 'server/.secrets/owner-wallet.json'), 'utf8'),
  );
  if (wallet.privateKey) secrets.push(wallet.privateKey);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
let checked = 0;
for (const file of files) {
  const content = await readFile(path.join(root, file));
  if (
    secrets.some((secret) => content.includes(Buffer.from(secret))) ||
    /TEST_API_KEY:[A-Za-z0-9+/=._-]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(
      content.toString('utf8'),
    )
  )
    throw new Error(`Release stopped: sensitive material detected in ${file}.`);
  checked++;
}
await writeFile(
  path.join(root, 'docs/release-manifest.json'),
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      secretScanPassed: true,
      fileCount: checked,
      files: files.map((f) => f.replaceAll('\\', '/')).sort(),
      note: 'Curated source release only; ignored local secrets, storage, credentials and renders excluded. This scanner does not upload files.',
    },
    null,
    2,
  ),
);
console.log(`Release scan passed: ${checked} files. Local credentials excluded.`);
