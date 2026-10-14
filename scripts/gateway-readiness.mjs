import { writeFile } from 'node:fs/promises';
const token = process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY;
if (!token) throw new Error('Configure a project-scoped Vercel OIDC token or gateway key locally.');
const response = await fetch('https://ai-gateway.vercel.sh/v1/credits', {
  headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000),
});
const body = await response.json();
const report = { checkedAt: new Date().toISOString(), status: response.status,
  authenticated: response.ok, balance: response.ok ? body.balance : null,
  totalUsed: response.ok ? body.total_used : null,
  modelCallsMade: 0,
  note: 'Read-only credit check. Does not establish whether the balance consists of free or purchased credits.',
};
await writeFile(new URL('../docs/gateway-readiness.json', import.meta.url), JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
