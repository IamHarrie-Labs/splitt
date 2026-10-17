import { afterEach, expect, it, vi } from 'vitest';
import { pacedRpcFetch } from '../server/src/live/rpc';
afterEach(() => vi.useRealTimers());
it('paces by the number of calls inside a JSON-RPC batch', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const starts: number[] = [];
  const transport = pacedRpcFetch(async () => {
    starts.push(Date.now());
    return new Response('{}');
  }, 500);
  const requests = Promise.all([
    transport('https://rpc.example', {
      body: JSON.stringify([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]),
    }),
    transport('https://rpc.example'),
  ]);
  await vi.runAllTimersAsync();
  await requests;
  expect(starts).toEqual([0, 2000]);
});
it('backs off JSON-RPC rate errors and respects HTTP retry-after', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const starts: number[] = [];
  const transport = pacedRpcFetch(async () => {
    starts.push(Date.now());
    return starts.length === 1
      ? Response.json([{ error: { message: 'rate limit exceeded' } }])
      : starts.length === 2
        ? new Response('{}', { status: 429, headers: { 'retry-after': '3' } })
        : Response.json({ result: 'ok' });
  }, 500);
  const requests = Promise.all(Array.from({ length: 3 }, () => transport('https://rpc.example')));
  await vi.runAllTimersAsync();
  await requests;
  expect(starts).toEqual([0, 2000, 5000]);
});
it('paces concurrent RPC requests and continues after a failed request', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const starts: number[] = [];
  const transport = pacedRpcFetch(async () => {
    starts.push(Date.now());
    if (starts.length === 1) throw new Error('temporary RPC failure');
    return new Response('{}');
  }, 500);
  const result = Promise.allSettled([
    transport('https://rpc.example'),
    transport('https://rpc.example'),
    transport('https://rpc.example'),
  ]);
  await vi.runAllTimersAsync();
  expect(starts).toEqual([0, 500, 1000]);
  expect((await result).map((r) => r.status)).toEqual(['rejected', 'fulfilled', 'fulfilled']);
});
