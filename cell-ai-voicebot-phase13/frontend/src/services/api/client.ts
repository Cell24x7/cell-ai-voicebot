import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import { emitAuthEvent } from './auth-events';
import { toApiError } from './errors';
import type { SuccessEnvelope } from './types';

/**
 * Shared HTTP client. Requests go through the Vite dev proxy (`/api` → API on :5100)
 * unless VITE_API_URL points elsewhere. Every failure rejects with an `ApiError`.
 */
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  timeout: 15_000,
  withCredentials: true,
});

/** Auth wiring, installed by `features/auth/session.ts` (keeps the client free of app imports). */
interface AuthHooks {
  /** Current access token (memory only). */
  getToken: () => string | null;
  /** Single-flight session refresh → new token, or null when the session is gone. */
  refresh: () => Promise<string | null>;
}
let hooks: AuthHooks | null = null;
export const installAuthHooks = (next: AuthHooks | null): void => {
  hooks = next;
};

/** Requests that must never trigger a refresh (they ARE the session endpoints). */
const NO_REFRESH =
  /\/auth\/(login|refresh|logout|signup|verify-email|forgot-password|reset-password|accept-invite|invite-info)\b/;

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

apiClient.interceptors.request.use((config) => {
  const token = hooks?.getToken();
  if (token && !config.headers.has('Authorization'))
    config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const apiError = toApiError(error);
    const config = (axios.isAxiosError(error) ? error.config : undefined) as
      RetriableConfig | undefined;
    const hadToken = Boolean(config?.headers.has('Authorization'));
    const sessionError =
      apiError.status === 401 &&
      (apiError.code === 'AUTH_TOKEN_EXPIRED' || apiError.code === 'AUTH_UNAUTHENTICATED');

    // Expired token, or tokenVersion changed (role change): refresh once and retry.
    if (
      sessionError &&
      hadToken &&
      config &&
      !config._retried &&
      !NO_REFRESH.test(config.url ?? '') &&
      hooks
    ) {
      const token = await hooks.refresh();
      if (token) {
        config._retried = true;
        config.headers.set('Authorization', `Bearer ${token}`);
        return apiClient.request(config);
      }
      return Promise.reject(apiError);
    }
    if (apiError.status === 401 && hadToken && config?._retried) {
      emitAuthEvent({ type: 'signed-out', reason: apiError.code });
    }
    return Promise.reject(apiError);
  },
);

/** Unwraps the success envelope: `await unwrap(apiClient.get<SuccessEnvelope<T>>(…))` → `T`. */
export const unwrap = async <T>(request: Promise<AxiosResponse<SuccessEnvelope<T>>>): Promise<T> =>
  (await request).data.data;
