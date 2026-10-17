import { afterEach, expect, it, vi } from 'vitest';
import { pacedRpcFetch } from '../server/src/live/rpc';
afterEach(() => vi.useRealTimers());
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
