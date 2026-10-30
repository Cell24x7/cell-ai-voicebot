import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { getErrorMessage, isUnexpectedError, toApiError } from '@/services/api/errors';

export type Notify = (message: string, variant: 'error') => void;

const MAX_QUERY_RETRIES = 2;

/**
 * Queries retry only what may succeed next time: network, timeout and 5xx /
 * unknown — up to 2 times. 4xx (validation, auth, not found, rate limit) and
 * canceled requests never retry.
 */
export const shouldRetry = (failureCount: number, error: unknown): boolean => {
  const e = toApiError(error);
  if (e.kind === 'canceled') return false;
  if (e.kind === 'http' && e.status < 500) return false;
  return failureCount < MAX_QUERY_RETRIES;
};

/** Toast text: user message + short request id for support. */
export const errorToastMessage = (error: unknown): string => {
  const e = toApiError(error);
  const ref = e.requestId ? ` (Ref: ${e.requestId.slice(0, 8)})` : '';
  return `${getErrorMessage(e)}${ref}`;
};

export const createQueryClient = ({ notify }: { notify?: Notify } = {}): QueryClient => {
  const report = (error: unknown, meta: { silent?: boolean } | undefined) => {
    if (meta?.silent || !notify || !isUnexpectedError(error)) return;
    notify(errorToastMessage(error), 'error');
  };

  return new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => report(error, query.meta) }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation) => report(error, mutation.meta),
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: 0 },
    },
  });
};
