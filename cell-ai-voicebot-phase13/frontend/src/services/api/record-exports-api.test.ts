import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { apiClient } from './client';
import { recordExportsApi } from './record-exports';
import { reportSubscriptionsApi } from './report-subscriptions';

describe('record exports + report e-mails API', () => {
  const originalAdapter = apiClient.defaults.adapter;
  let seen: { method: string; url: string; params: unknown; data: unknown }[] = [];
  beforeEach(() => {
    seen = [];
    apiClient.defaults.adapter = (config: InternalAxiosRequestConfig) => {
      seen.push({
        method: config.method ?? '',
        url: config.url ?? '',
        params: config.params as unknown,
        data: typeof config.data === 'string' ? (JSON.parse(config.data) as unknown) : undefined,
      });
      return Promise.resolve({
        status: 200,
        statusText: '',
        headers: new AxiosHeaders(),
        config,
        data: { success: true, data: { id: 'x' }, meta: { total: 0 } },
      });
    };
  });
  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
  });

  it('sends the export requests', async () => {
    expect(await recordExportsApi.calls({ format: 'csv', from: '2026-10-01' })).toEqual({
      id: 'x',
    });
    await recordExportsApi.messages({ format: 'xlsx', from: '2026-10-01', to: '2026-10-02' });
    await recordExportsApi.report('csv', 'campaigns', {
      from: '2026-10-01',
      compare: true,
      campaignIds: ['a', 'b'],
    });
    expect((await recordExportsApi.list({ page: 2 })).meta).toEqual({ total: 0 });
    await recordExportsApi.get('e1');
    expect(seen).toEqual([
      {
        method: 'post',
        url: '/exports/calls',
        params: undefined,
        data: { format: 'csv', from: '2026-10-01' },
      },
      {
        method: 'post',
        url: '/exports/messages',
        params: undefined,
        data: { format: 'xlsx', from: '2026-10-01', to: '2026-10-02' },
      },
      {
        method: 'post',
        url: '/exports/report',
        params: undefined,
        data: {
          format: 'csv',
          tab: 'campaigns',
          query: { from: '2026-10-01', compare: 'true', campaignIds: 'a,b' },
        },
      },
      { method: 'get', url: '/exports', params: { page: 2 }, data: undefined },
      { method: 'get', url: '/exports/e1', params: undefined, data: undefined },
    ]);
  });

  it('manages my report e-mails and the public stop link', async () => {
    await reportSubscriptionsApi.list();
    await reportSubscriptionsApi.create({ frequency: 'daily', tabs: ['overview'], hour: 9 });
    await reportSubscriptionsApi.update('s1', { active: false });
    await reportSubscriptionsApi.remove('s1');
    await reportSubscriptionsApi.unsubscribe('a.b.c');
    expect(seen.map((s) => [s.method, s.url, s.data])).toEqual([
      ['get', '/report-subscriptions', undefined],
      ['post', '/report-subscriptions', { frequency: 'daily', tabs: ['overview'], hour: 9 }],
      ['patch', '/report-subscriptions/s1', { active: false }],
      ['delete', '/report-subscriptions/s1', undefined],
      ['post', '/report-unsubscribe', { token: 'a.b.c' }],
    ]);
  });
});
