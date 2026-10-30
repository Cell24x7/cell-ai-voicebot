import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { callsApi } from './calls';
import { apiClient } from './client';
import { insightsApi } from './insights';

describe('insightsApi (Phase 14)', () => {
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

  it('calls each endpoint with the right method, path and body; unwraps data', async () => {
    expect(await insightsApi.get('c1')).toEqual({ ok: true });
    await insightsApi.regenerate('c1');
    await insightsApi.setDisposition('c1', 'paid');
    await insightsApi.settings();
    await insightsApi.updateSettings({ transcribeHumanCalls: true });
    await insightsApi.dispositions();
    await insightsApi.updateDispositions([{ key: 'paid', label: 'Paid', active: true }]);
    await insightsApi.chatSummaries('v1');
    await insightsApi.requestChatSummary('v1');
    expect(seen.map((r) => [r.method, r.url, r.data])).toEqual([
      ['get', '/calls/c1/insights', undefined],
      ['post', '/calls/c1/insights/regenerate', undefined],
      ['patch', '/calls/c1/disposition', { disposition: 'paid' }],
      ['get', '/account/insights-settings', undefined],
      ['put', '/account/insights-settings', { transcribeHumanCalls: true }],
      ['get', '/account/dispositions', undefined],
      [
        'put',
        '/account/dispositions',
        { dispositions: [{ key: 'paid', label: 'Paid', active: true }] },
      ],
      ['get', '/inbox/conversations/v1/summary', undefined],
      ['post', '/inbox/conversations/v1/summary', undefined],
    ]);
  });

  it('calls list record filters as query strings', async () => {
    await callsApi.list({
      disposition: ['paid', 'callback'],
      sentiment: 'negative',
      hasPromise: false,
      hasSummary: true,
      answeredBy: 'u1',
      channelId: 'n1',
    });
    expect(seen[0]?.params).toEqual({
      disposition: 'paid,callback',
      sentiment: 'negative',
      hasPromise: 'false',
      hasSummary: 'true',
      answeredBy: 'u1',
      channelId: 'n1',
    });
  });
});
