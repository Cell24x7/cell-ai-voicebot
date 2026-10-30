import { AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';

import { authApi } from './auth';
import { apiClient } from './client';

const originalAdapter = apiClient.defaults.adapter;
afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
});

const record = () => {
  const calls: { method?: string; url?: string; data?: unknown; params?: unknown }[] = [];
  const adapter: AxiosAdapter = (config: InternalAxiosRequestConfig) => {
    calls.push({
      method: config.method,
      url: config.url,
      data: typeof config.data === 'string' ? (JSON.parse(config.data) as unknown) : config.data,
      params: config.params as unknown,
    });
    return Promise.resolve({
      status: 200,
      statusText: '',
      headers: new AxiosHeaders(),
      config,
      data: { success: true, data: { ok: true } },
    });
  };
  apiClient.defaults.adapter = adapter;
  return calls;
};

describe('authApi (contract with the backend routes)', () => {
  it('calls every auth endpoint with the right method, path and body', async () => {
    const calls = record();
    await authApi.signup({ businessName: 'B', name: 'N', email: 'e@x.co', password: 'p' });
    await authApi.verifyEmail({ email: 'e@x.co', code: '123456' });
    await authApi.resendVerification('e@x.co');
    await authApi.login({ email: 'e@x.co', password: 'p' });
    await authApi.refresh();
    await authApi.logout();
    await authApi.logoutAll();
    await authApi.me();
    await authApi.forgotPassword('e@x.co');
    await authApi.resetPassword({ token: 't', password: 'p' });
    await authApi.changePassword({ currentPassword: 'a', newPassword: 'b' });
    await authApi.sessions();
    await authApi.revokeSession('fam/1');
    await authApi.inviteInfo('tok');
    await authApi.acceptInvite({ token: 'tok', password: 'p' });
    await authApi.issueWsTicket();
    await authApi.rbacCatalog();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'post /auth/signup',
      'post /auth/verify-email',
      'post /auth/verify-email/resend',
      'post /auth/login',
      'post /auth/refresh',
      'post /auth/logout',
      'post /auth/logout-all',
      'get /auth/me',
      'post /auth/forgot-password',
      'post /auth/reset-password',
      'post /auth/change-password',
      'get /auth/sessions',
      'delete /auth/sessions/fam%2F1',
      'get /auth/invite-info',
      'post /auth/accept-invite',
      'post /ws/tickets',
      'get /rbac/permissions',
    ]);
    expect(calls[2]?.data).toEqual({ email: 'e@x.co' });
    expect(calls[13]?.params).toEqual({ token: 'tok' });
    expect(calls[15]?.data).toEqual({});
  });
});
