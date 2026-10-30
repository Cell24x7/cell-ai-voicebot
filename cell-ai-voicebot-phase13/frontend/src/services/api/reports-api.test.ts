import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { apiClient } from './client';
import { reportsApi } from './reports';

describe('reportsApi', () => {
  const originalAdapter = apiClient.defaults.adapter;
  let seen: { url: string; params: unknown }[] = [];
  beforeEach(() => {
    seen = [];
    apiClient.defaults.adapter = (config: InternalAxiosRequestConfig) => {
      seen.push({ url: config.url ?? '', params: config.params as unknown });
      return Promise.resolve({
        status: 200,
        statusText: '',
        headers: new AxiosHeaders(),
        config,
        data: { success: true, data: { tab: 'calls' } },
      });
    };
  });
  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
  });

  it('GET /reports/:tab with string flags and comma lists', async () => {
    expect(await reportsApi.get('calls', { from: '2026-10-01', to: '2026-10-27' })).toEqual({
      tab: 'calls',
    });
    await reportsApi.get('campaigns', {
      compare: true,
      includeTest: false,
      campaignIds: ['a', 'b'],
      channel: 'voice',
    });
    await reportsApi.get('overview', { campaignIds: [] });
    expect(seen).toEqual([
      { url: '/reports/calls', params: { from: '2026-10-01', to: '2026-10-27' } },
      {
        url: '/reports/campaigns',
        params: { compare: 'true', includeTest: 'false', campaignIds: 'a,b', channel: 'voice' },
      },
      { url: '/reports/overview', params: {} },
    ]);
  });
});
