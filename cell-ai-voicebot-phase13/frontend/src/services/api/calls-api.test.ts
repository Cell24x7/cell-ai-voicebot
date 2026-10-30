import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { callsApi } from './calls';
import { apiClient } from './client';

describe('callsApi', () => {
  const originalAdapter = apiClient.defaults.adapter;
  let seen: { method: string; url: string; params: unknown; data: unknown }[] = [];
  beforeEach(() => {
    seen = [];
    apiClient.defaults.adapter = (config: InternalAxiosRequestConfig) => {
      seen.push({
        method: config.method ?? '',
        url: config.url ?? '',
        params: config.params as unknown,
        data: typeof config.data === 'string' ? (JSON.parse(config.data) as unknown) : config.data,
      });
      return Promise.resolve({
        status: 200,
        statusText: '',
        headers: new AxiosHeaders(),
        config,
        data: { success: true, data: { ok: true }, meta: { hasMore: false, nextCursor: null } },
      });
    };
  });
  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
  });

  it('hits every /calls route with the right method, params and body', async () => {
    await callsApi.startWeb({ flowId: 'f1', version: 'draft', testPhone: '+919000400012' });
    const page = await callsApi.list({
      status: ['completed', 'failed'],
      isTest: false,
      q: 'asha',
      limit: 20,
    });
    await callsApi.list({});
    await callsApi.active();
    await callsApi.get('c1');
    await callsApi.transcript('c1');
    await callsApi.events('c1');
    await callsApi.recording('c1');
    await callsApi.hangup('c1');
    expect(page.meta).toEqual({ hasMore: false, nextCursor: null });
    expect(seen).toEqual([
      {
        method: 'post',
        url: '/calls/web',
        params: undefined,
        data: { flowId: 'f1', version: 'draft', testPhone: '+919000400012' },
      },
      {
        method: 'get',
        url: '/calls',
        params: { q: 'asha', limit: 20, status: 'completed,failed', isTest: 'false' },
        data: undefined,
      },
      { method: 'get', url: '/calls', params: {}, data: undefined },
      { method: 'get', url: '/calls/active', params: undefined, data: undefined },
      { method: 'get', url: '/calls/c1', params: undefined, data: undefined },
      { method: 'get', url: '/calls/c1/transcript', params: undefined, data: undefined },
      { method: 'get', url: '/calls/c1/events', params: undefined, data: undefined },
      { method: 'get', url: '/calls/c1/recording', params: undefined, data: undefined },
      { method: 'post', url: '/calls/c1/hangup', params: undefined, data: undefined },
    ]);
  });
});
