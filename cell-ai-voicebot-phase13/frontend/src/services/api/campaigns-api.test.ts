import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { callsApi } from './calls';
import { campaignsApi } from './campaigns';
import { apiClient } from './client';

describe('campaignsApi', () => {
  const originalAdapter = apiClient.defaults.adapter;
  let seen: { method: string; url: string; query: string; data: unknown; key: unknown }[] = [];
  beforeEach(() => {
    seen = [];
    apiClient.defaults.adapter = (config: InternalAxiosRequestConfig) => {
      const full = apiClient.getUri(config);
      seen.push({
        method: config.method ?? '',
        url: config.url ?? '',
        query: full.includes('?') ? decodeURIComponent(full.slice(full.indexOf('?') + 1)) : '',
        data: typeof config.data === 'string' ? (JSON.parse(config.data) as unknown) : config.data,
        key: new AxiosHeaders(config.headers).get('Idempotency-Key'),
      });
      return Promise.resolve({
        status: config.method === 'delete' ? 204 : 200,
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

  it('hits every /campaigns route with the right method, query and body', async () => {
    const page = await campaignsApi.list({
      status: ['running', 'paused'],
      mode: 'dry_run',
      q: 'oct',
    });
    await campaignsApi.get('cp1');
    await campaignsApi.create({ name: 'Oct', flowId: 'f1', mode: 'dry_run' });
    await campaignsApi.update('cp1', { revision: 3, name: 'Oct 2' });
    await campaignsApi.remove('cp1');
    await campaignsApi.duplicate('cp1');
    await campaignsApi.previewAudience({ flowId: 'f1', audience: { listIds: ['l1'] } });
    await campaignsApi.estimate('cp1');
    await campaignsApi.start('cp1', 'key-1');
    await campaignsApi.unschedule('cp1');
    await campaignsApi.pause('cp1');
    await campaignsApi.resume('cp1');
    await campaignsApi.cancel('cp1', true);
    const contacts = await campaignsApi.contacts('cp1', { status: ['retry_wait'], q: 'asha' });
    await campaignsApi.runs('cp1');
    await campaignsApi.exportResults('cp1', 'xlsx');
    expect(page.meta).toEqual({ hasMore: false, nextCursor: null });
    expect(contacts.meta.hasMore).toBe(false);
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'get /campaigns',
      'get /campaigns/cp1',
      'post /campaigns',
      'patch /campaigns/cp1',
      'delete /campaigns/cp1',
      'post /campaigns/cp1/duplicate',
      'post /campaigns/audience/preview',
      'post /campaigns/cp1/estimate',
      'post /campaigns/cp1/start',
      'post /campaigns/cp1/unschedule',
      'post /campaigns/cp1/pause',
      'post /campaigns/cp1/resume',
      'post /campaigns/cp1/cancel',
      'get /campaigns/cp1/contacts',
      'get /campaigns/cp1/runs',
      'post /campaigns/cp1/export',
    ]);
    // arrays as repeated params (`status=a&status=b`), as the API expects
    expect(seen[0]?.query).toBe('status=running&status=paused&mode=dry_run&q=oct');
    expect(seen[13]?.query).toBe('status=retry_wait&q=asha');
    expect(seen[2]?.data).toEqual({ name: 'Oct', flowId: 'f1', mode: 'dry_run' });
    expect(seen[3]?.data).toEqual({ revision: 3, name: 'Oct 2' });
    expect(seen[6]?.data).toEqual({ flowId: 'f1', audience: { listIds: ['l1'] } });
    expect(seen[8]?.key).toBe('key-1');
    expect(seen[12]?.data).toEqual({ hangUpLive: true });
    expect(seen[15]?.data).toEqual({ format: 'xlsx' });
  });

  it('single calls send the Idempotency-Key; the call list filters by campaign and provider', async () => {
    await callsApi.start({ contactId: 'k1', flowId: 'f1' }, 'call-key');
    await callsApi.list({ campaignId: 'cp1', provider: 'dryrun' });
    expect(seen[0]).toMatchObject({
      method: 'post',
      url: '/calls',
      data: { contactId: 'k1', flowId: 'f1' },
      key: 'call-key',
    });
    expect(seen[1]?.query).toBe('campaignId=cp1&provider=dryrun');
  });
});
