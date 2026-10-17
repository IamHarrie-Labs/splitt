export class WorkspaceApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function walletRequestRejected(error: unknown): boolean {
  let current = error;
  for (let depth = 0; current && typeof current === 'object' && depth < 8; depth++) {
    const detail = current as { code?: unknown; name?: unknown; cause?: unknown };
    if (detail.code === 4001 || detail.name === 'UserRejectedRequestError') return true;
    current = detail.cause;
  }
  return false;
}

export async function workspaceRequest<T>(path: string, body?: unknown, csrf = ''): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
      headers: { 'content-type': 'application/json', 'x-splitt-csrf': csrf },
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
    });
  } catch {
    // Do not retry mutations: a transaction or signed payout may already have been accepted.
    throw new WorkspaceApiError(
      0,
      'Connection interrupted. Check activity before retrying a transaction.',
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401)
      throw new WorkspaceApiError(
        401,
        'Your session expired. Connect your wallet again. Saved transactions remain on this device.',
      );
    if (response.status === 429)
      throw new WorkspaceApiError(429, 'Too many requests. Wait a moment, then try again.');
    throw new WorkspaceApiError(
      response.status,
      typeof data?.message === 'string'
        ? data.message
        : 'The workspace is temporarily unavailable. Please try again.',
    );
  }
  if (data === null)
    throw new WorkspaceApiError(
      response.status,
      'The workspace returned an unexpected response. Please reconnect.',
    );
  return data as T;
}
