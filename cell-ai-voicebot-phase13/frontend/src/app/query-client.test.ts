import { describe, expect, it, vi } from 'vitest';

import { ApiError, type ApiErrorKind } from '@/services/api/errors';

import { createQueryClient, errorToastMessage, shouldRetry } from './query-client';

const apiError = (status: number, kind: ApiErrorKind = 'http', requestId?: string) =>
  new ApiError({
    status,
    kind,
    code: kind === 'http' ? 'X' : 'NETWORK_ERROR',
    message: `status ${status}`,
    requestId,
  });

describe('shouldRetry', () => {
  it.each([400, 401, 403, 404, 409, 422, 429])('never retries HTTP %i', (status) => {
    expect(shouldRetry(0, apiError(status))).toBe(false);
  });

  it.each([500, 502, 503])('retries HTTP %i up to 2 times', (status) => {
    expect(shouldRetry(0, apiError(status))).toBe(true);
    expect(shouldRetry(1, apiError(status))).toBe(true);
    expect(shouldRetry(2, apiError(status))).toBe(false);
  });

  it('retries network / timeout / unknown, never canceled', () => {
    expect(shouldRetry(0, apiError(0, 'network'))).toBe(true);
    expect(shouldRetry(1, apiError(0, 'timeout'))).toBe(true);
    expect(shouldRetry(0, apiError(502, 'unknown'))).toBe(true);
    expect(shouldRetry(0, apiError(0, 'canceled'))).toBe(false);
    expect(shouldRetry(0, new Error('plain'))).toBe(true);
  });
});

describe('errorToastMessage', () => {
  it('adds a short request reference when known', () => {
    expect(errorToastMessage(apiError(500, 'http', 'req_abcdef123456'))).toBe(
      'status 500 (Ref: req_abcd)',
    );
    expect(errorToastMessage(apiError(0, 'network'))).toBe(
      "Can't reach the server. Check your connection.",
    );
  });
});

describe('createQueryClient — global error toast', () => {
  const run = async (error: Error, meta?: { silent?: boolean }) => {
    const notify = vi.fn();
    const client = createQueryClient({ notify });
    await client
      .fetchQuery({
        queryKey: ['t', Math.random()],
        queryFn: () => Promise.reject(error),
        retry: false,
        meta,
      })
      .catch(() => undefined);
    return notify;
  };

  it('notifies for 5xx and network errors', async () => {
    expect(await run(apiError(500))).toHaveBeenCalledWith('status 500', 'error');
    expect(await run(apiError(0, 'network'))).toHaveBeenCalledTimes(1);
  });

  it('stays quiet for 4xx, canceled and silent queries', async () => {
    expect(await run(apiError(404))).not.toHaveBeenCalled();
    expect(await run(apiError(0, 'canceled'))).not.toHaveBeenCalled();
    expect(await run(apiError(500), { silent: true })).not.toHaveBeenCalled();
  });

  it('notifies for failed mutations and never retries them', async () => {
    const notify = vi.fn();
    const client = createQueryClient({ notify });
    const fn = vi.fn(() => Promise.reject(apiError(503)));
    const mutation = client.getMutationCache().build(client, { mutationFn: fn });
    await mutation.execute(undefined).catch(() => undefined);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('status 503', 'error');
  });

  it('uses the retry policy and defaults', () => {
    const client = createQueryClient();
    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.retry).toBe(shouldRetry);
    expect(defaults.queries?.staleTime).toBe(30_000);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.mutations?.retry).toBe(0);
  });
});
