import { writeFile } from 'node:fs/promises';

// Read-only API checks; this script does not operate a browser or sign transactions.
const origin = 'https://www.usesplitt.xyz';
const checks: { name: string; path: string; status: number | null; passed: boolean }[] = [];
async function check(name: string, path: string, expected: (status: number, data: any) => boolean) {
  try {
    const response = await fetch(origin + '/api' + path, {
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
      headers: { accept: 'application/json' },
    });
    const data = await response.json().catch(() => null);
    checks.push({ name, path, status: response.status, passed: expected(response.status, data) });
  } catch {
    checks.push({ name, path, status: null, passed: false });
  }
}
await check(
  'Self-serve API health',
  '/health',
  (status, data) => status === 200 && data?.status === 'ok' && data?.mode === 'selfserve-testnet',
);
await check(
  'Arc configuration',
  '/selfserve/config',
  (status, data) =>
    status === 200 &&
    data?.chainId === 5042002 &&
    data?.usdc?.toLowerCase() === '0x3600000000000000000000000000000000000000',
);
await check('Anonymous vault access denied', '/selfserve/vaults', (status) => status === 401);
const report = {
  checkedAt: new Date().toISOString(),
  origin,
  publicApiChecksPassed: checks.every((check) => check.passed),
  checks,
  browserQaCompleted: false,
  limitation:
    'Read-only HTTP API checks only. No wallet login, browser, mobile, payment or business-pilot verification.',
};
await writeFile(
  new URL('../docs/public-launch-check.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report));
if (!report.publicApiChecksPassed) process.exitCode = 1;
