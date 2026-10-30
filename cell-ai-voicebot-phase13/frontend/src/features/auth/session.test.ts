import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { onAuthEvent, type AuthEvent } from '@/services/api/auth-events';
import { apiClient } from '@/services/api/client';
import { fakeSession, signInAs } from '@/test/auth';

import {
  bootstrapSession,
  getWsTicket,
  installClientAuth,
  refreshSession,
  reloadMe,
  signOut,
} from './session';
import { useAuthStore } from './store';

const originalAdapter = apiClient.defaults.adapter;
type Handler = (config: InternalAxiosRequestConfig) => { status: number; data: unknown };

const respond = (config: InternalAxiosRequestConfig, status: number, data: unknown) => {
  const response = { status, statusText: '', data, headers: new AxiosHeaders(), config };
  return status >= 400
    ? Promise.reject(new AxiosError('fail', 'ERR_BAD_REQUEST', config, undefined, response))
    : Promise.resolve(response);
};
const useServer = (handler: Handler) => {
  const calls: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = (config) => {
    calls.push(config);
    const { status, data } = handler(config);
    return respond(config, status, data);
  };
  apiClient.defaults.adapter = adapter;
  return calls;
};
const ok = (data: unknown) => ({ status: 200, data: { success: true, data } });
const err = (status: number, code: string) => ({
  status,
  data: { success: false, error: { code, message: code, requestId: 'r' } },
});

let events: AuthEvent[] = [];
let off: () => void;
let uninstall: () => void;

beforeEach(() => {
  events = [];
  off = onAuthEvent((e) => events.push(e));
  uninstall = installClientAuth();
});
afterEach(() => {
  off();
  uninstall();
  apiClient.defaults.adapter = originalAdapter;
  vi.unstubAllGlobals();
});

describe('auth store', () => {
  it('stores the session, updates it from /me and handles impersonation', () => {
    const session = signInAs('manager');
    const s = useAuthStore.getState();
    expect(s.status).toBe('authenticated');
    expect(s.session?.accessToken).toBe(session.accessToken);
    expect(s.session?.permissions.has('team.read')).toBe(true);

    s.setMe({ ...fakeSession('viewer'), impersonation: null });
    expect(useAuthStore.getState().session?.role.key).toBe('viewer');
    expect(useAuthStore.getState().session?.accessToken).toBe(session.accessToken);

    const imp = fakeSession('owner', {
      accessToken: 'imp-token',
      impersonation: { impersonatorId: 'sa', expiresAt: '2026-10-08T01:00:00Z' },
    });
    useAuthStore.getState().startImpersonation(imp);
    expect(useAuthStore.getState().session?.accessToken).toBe('imp-token');
    expect(useAuthStore.getState().savedSession?.accessToken).toBe(session.accessToken);
    expect(useAuthStore.getState().stopImpersonation()?.accessToken).toBe(session.accessToken);
    expect(useAuthStore.getState().session?.accessToken).toBe(session.accessToken);
    expect(useAuthStore.getState().stopImpersonation()).toBeNull();

    useAuthStore.getState().setAnonymous();
    expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', session: null });
  });
});

describe('HTTP client auth', () => {
  it('sends the access token', async () => {
    signInAs('owner');
    const calls = useServer(() => ok({}));
    await apiClient.get('/account');
    expect(calls[0]?.headers.get('Authorization')).toBe('Bearer test-access-token');
  });

  it('refreshes once for parallel expired requests and retries each', async () => {
    signInAs('owner');
    let refreshes = 0;
    const calls = useServer((config) => {
      if (config.url === '/auth/refresh') {
        refreshes += 1;
        return ok(fakeSession('owner', { accessToken: 'new-token' }));
      }
      return config.headers.get('Authorization') === 'Bearer new-token'
        ? ok({ url: config.url })
        : err(401, 'AUTH_TOKEN_EXPIRED');
    });
    const results = await Promise.all(['/a', '/b', '/c'].map((u) => apiClient.get(u)));
    expect(refreshes).toBe(1);
    expect(results.map((r) => (r.data as { data: { url: string } }).data.url)).toEqual([
      '/a',
      '/b',
      '/c',
    ]);
    expect(calls.filter((c) => c.url !== '/auth/refresh')).toHaveLength(6);
    expect(useAuthStore.getState().session?.accessToken).toBe('new-token');
  });

  it('also refreshes after AUTH_UNAUTHENTICATED (tokenVersion changed by a role change)', async () => {
    signInAs('manager');
    useServer((config) =>
      config.url === '/auth/refresh'
        ? ok(fakeSession('viewer', { accessToken: 'v2' }))
        : config.headers.get('Authorization') === 'Bearer v2'
          ? ok({})
          : err(401, 'AUTH_UNAUTHENTICATED'),
    );
    await apiClient.get('/team/users');
    expect(useAuthStore.getState().session?.role.key).toBe('viewer');
  });

  it('signs out when the refresh fails (one event, no loop)', async () => {
    signInAs('owner');
    const calls = useServer((config) =>
      config.url === '/auth/refresh'
        ? err(401, 'AUTH_SESSION_REVOKED')
        : err(401, 'AUTH_TOKEN_EXPIRED'),
    );
    await expect(apiClient.get('/account')).rejects.toMatchObject({ code: 'AUTH_TOKEN_EXPIRED' });
    expect(calls.map((c) => c.url)).toEqual(['/account', '/auth/refresh']);
    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(events).toEqual([{ type: 'signed-out', reason: 'session_ended' }]);
  });

  it('never refreshes for session endpoints or requests without a token', async () => {
    const calls = useServer(() => err(401, 'AUTH_INVALID_CREDENTIALS'));
    await expect(apiClient.post('/auth/login', {})).rejects.toBeTruthy();
    signInAs('owner');
    await expect(apiClient.post('/auth/refresh')).rejects.toBeTruthy();
    expect(calls.map((c) => c.url)).toEqual(['/auth/login', '/auth/refresh']);
  });

  it('signs out if the retried request is still 401', async () => {
    signInAs('owner');
    useServer((config) =>
      config.url === '/auth/refresh'
        ? ok(fakeSession('owner', { accessToken: 'n' }))
        : err(401, 'AUTH_UNAUTHENTICATED'),
    );
    await expect(apiClient.get('/x')).rejects.toBeTruthy();
    expect(events).toContainEqual({ type: 'signed-out', reason: 'AUTH_UNAUTHENTICATED' });
  });

  it('ends an expired impersonation instead of refreshing', async () => {
    const own = signInAs('superadmin');
    useAuthStore.getState().startImpersonation(
      fakeSession('owner', {
        accessToken: 'imp',
        impersonation: { impersonatorId: 'u1', expiresAt: 'x' },
      }),
    );
    const calls = useServer(() => err(401, 'AUTH_TOKEN_EXPIRED'));
    await expect(apiClient.get('/team/users')).rejects.toBeTruthy();
    expect(calls.map((c) => c.url)).toEqual(['/team/users']);
    expect(useAuthStore.getState().session?.accessToken).toBe(own.accessToken);
    expect(events).toEqual([{ type: 'impersonation-ended' }]);
  });

  it('serialises refreshes across tabs with the Web Locks API', async () => {
    const request = vi.fn((_name: string, work: () => Promise<unknown>) => work());
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    signInAs('owner');
    useServer(() => ok(fakeSession('owner')));
    await refreshSession();
    expect(request).toHaveBeenCalledWith('cav-auth-refresh', expect.any(Function));
  });
});

describe('bootstrap / sign out / helpers', () => {
  it('restores a session from the cookie, or stays anonymous without an event', async () => {
    useServer(() => ok(fakeSession('admin')));
    await bootstrapSession();
    expect(useAuthStore.getState().session?.role.key).toBe('admin');
    useAuthStore.getState().setAnonymous();
    useServer(() => err(401, 'AUTH_UNAUTHENTICATED'));
    await bootstrapSession();
    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(events).toEqual([]);
  });

  it('signOut calls logout (best effort) and clears the store + cache', async () => {
    signInAs('owner');
    const calls = useServer(() => err(500, 'INTERNAL_ERROR'));
    const clear = vi.fn();
    await signOut({ clear } as never);
    expect(calls[0]?.url).toBe('/auth/logout');
    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(clear).toHaveBeenCalled();
  });

  it('reloadMe updates the session; getWsTicket returns the ticket', async () => {
    signInAs('owner');
    useServer((config) =>
      config.url === '/auth/me'
        ? ok({ ...fakeSession('viewer'), accessToken: undefined })
        : ok({ ticket: 'wst_abc', expiresAt: 'x' }),
    );
    await reloadMe();
    expect(useAuthStore.getState().session?.role.key).toBe('viewer');
    expect(await getWsTicket()).toBe('wst_abc');
  });
});
