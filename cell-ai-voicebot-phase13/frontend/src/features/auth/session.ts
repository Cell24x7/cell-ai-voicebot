import type { QueryClient } from '@tanstack/react-query';

import { adminApi } from '@/services/api/admin';
import { authApi } from '@/services/api/auth';
import { emitAuthEvent } from '@/services/api/auth-events';
import { installAuthHooks } from '@/services/api/client';
import type { AuthSession } from '@/services/api/types';

import { getAccessToken, useAuthStore } from './store';

const LOCK_NAME = 'cav-auth-refresh';

/**
 * Refresh tokens rotate and a reused one ends the session — so two tabs must
 * never refresh at the same time. The Web Locks API serialises refreshes
 * across tabs: the second tab waits, then sends the cookie the first one
 * just received. (No lock support → plain call.)
 */
const withRefreshLock = <T>(work: () => Promise<T>): Promise<T> => {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? locks.request(LOCK_NAME, work) : work();
};

let inflight: Promise<AuthSession | null> | null = null;

/** One refresh at a time in this tab (parallel 401s share it). */
const refreshOnce = (): Promise<AuthSession | null> => {
  inflight ??= withRefreshLock(() => authApi.refresh())
    .then(
      (s) => s,
      () => null,
    )
    .finally(() => {
      inflight = null;
    });
  return inflight;
};

/**
 * Called by the HTTP client on an expired / invalidated token. Returns the
 * new token, or null (signed out). Impersonation sessions can't refresh:
 * they end and the superadmin session is restored.
 */
export const refreshSession = async (): Promise<string | null> => {
  const store = useAuthStore.getState();
  if (store.session?.impersonation) {
    store.stopImpersonation();
    emitAuthEvent({ type: 'impersonation-ended' });
    return null;
  }
  const session = await refreshOnce();
  if (session) {
    useAuthStore.getState().setSession(session);
    return session.accessToken;
  }
  const wasSignedIn = useAuthStore.getState().status === 'authenticated';
  useAuthStore.getState().setAnonymous();
  if (wasSignedIn) emitAuthEvent({ type: 'signed-out', reason: 'session_ended' });
  return null;
};

/** Page load: restore the session from the refresh cookie (no "signed out" event). */
export const bootstrapSession = async (): Promise<void> => {
  const session = await refreshOnce();
  if (session) useAuthStore.getState().setSession(session);
  else useAuthStore.getState().setAnonymous();
};

/** Connects the HTTP client to the session (token header + refresh on 401). */
export const installClientAuth = (): (() => void) => {
  installAuthHooks({ getToken: getAccessToken, refresh: refreshSession });
  return () => installAuthHooks(null);
};

/** Sign out here (server call best-effort), drop cached data. */
export const signOut = async (queryClient?: QueryClient): Promise<void> => {
  await authApi.logout().catch(() => undefined);
  useAuthStore.getState().setAnonymous();
  queryClient?.clear();
};

/** Re-reads user / account / permissions (after `user.updated`, account events). */
export const reloadMe = async (): Promise<void> => {
  const me = await authApi.me();
  useAuthStore.getState().setMe(me);
};

/** WS ticket provider for the realtime client (stable function). */
export const getWsTicket = async (): Promise<string> => (await authApi.issueWsTicket()).ticket;

/**
 * Ends an impersonation: tells the server (audit, best effort) with the
 * impersonation token, then restores the superadmin session.
 */
export const endImpersonation = async (queryClient?: QueryClient): Promise<void> => {
  await adminApi.stopImpersonation().catch(() => undefined);
  useAuthStore.getState().stopImpersonation();
  queryClient?.clear();
};
