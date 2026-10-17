/** Shared across vault clients so concurrent work cannot burst the public RPC. */
export function pacedRpcFetch(fetcher: typeof fetch = fetch, intervalMs = 500): typeof fetch {
  let tail = Promise.resolve();
  let nextStart = 0;
  let cooldownUntil = 0;
  let consecutiveLimits = 0;
  return (input, init) => {
    const run = async () => {
      const delay = Math.max(0, nextStart - Date.now(), cooldownUntil - Date.now());
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      init?.signal?.throwIfAborted();
      let calls = 1;
      try {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
        if (Array.isArray(body)) calls = Math.max(1, body.length);
      } catch {
        /* Non-JSON requests still count as one call. */
      }
      nextStart = Date.now() + intervalMs * calls;
      const response = await fetcher(input, init);
      let limited = response.status === 429;
      if (!limited) {
        const body = await response
          .clone()
          .json()
          .catch(() => null);
        limited = (Array.isArray(body) ? body : [body]).some((item) =>
          /rate limit|too many requests/i.test(item?.error?.message ?? ''),
        );
      }
      if (limited) {
        consecutiveLimits++;
        const retrySeconds = Number(response.headers.get('retry-after'));
        const pause =
          Number.isFinite(retrySeconds) && retrySeconds > 0
            ? retrySeconds * 1000
            : 1000 * 2 ** Math.min(consecutiveLimits, 4);
        cooldownUntil = Date.now() + Math.min(15000, Math.max(1000, pause));
      } else if (Date.now() >= cooldownUntil) consecutiveLimits = 0;
      return response;
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
