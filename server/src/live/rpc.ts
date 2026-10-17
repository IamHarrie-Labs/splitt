/** Shared across vault clients so concurrent work cannot burst the public RPC. */
export function pacedRpcFetch(fetcher: typeof fetch = fetch, intervalMs = 500): typeof fetch {
  let tail = Promise.resolve();
  let nextStart = 0;
  return (input, init) => {
    const run = async () => {
      const delay = Math.max(0, nextStart - Date.now());
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      init?.signal?.throwIfAborted();
      nextStart = Date.now() + intervalMs;
      return fetcher(input, init);
    };
    const result = tail.then(run);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}
export const arcRpcFetch = pacedRpcFetch();
