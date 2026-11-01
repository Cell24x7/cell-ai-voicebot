import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { apiKeysApi } from './api-keys';
import { apiClient } from './client';
import { outcomeRulesApi } from './outcome-rules';
import { sheetImportsApi } from './sheet-imports';
import { webhooksApi } from './webhooks';

type Seen = [string, string, unknown, Record<string, unknown> | undefined];

describe('Phase 15 API clients', () => {
  const original = apiClient.defaults.adapter;
  let seen: Seen[];
  let headers: Record<string, unknown>[];
  beforeEach(() => {
    seen = [];
    headers = [];
    apiClient.defaults.adapter = (config: InternalAxiosRequestConfig) => {
      seen.push([
        config.method ?? '',
        config.url ?? '',
        typeof config.data === 'string' ? (JSON.parse(config.data) as unknown) : undefined,
        config.params as Record<string, unknown> | undefined,
      ]);
      headers.push(config.headers.toJSON());
      return Promise.resolve({
        status: 200,
        statusText: '',
        headers: new AxiosHeaders(),
        config,
        data: { success: true, data: { ok: true } },
      });
    };
  });
  afterEach(() => {
    apiClient.defaults.adapter = original;
  });

  it('webhook endpoints, test, rotate, enable, deliveries and replay', async () => {
    await webhooksApi.list();
    await webhooksApi.create({ url: 'https://x.test/h', events: ['*'] });
    await webhooksApi.update('we1', { active: false });
    await webhooksApi.remove('we1');
    await webhooksApi.test('we1', 'call.completed');
    await webhooksApi.rotateSecret('we1');
    await webhooksApi.enable('we1');
    await webhooksApi.deliveries('we1');
    await webhooksApi.deliveries('we1', { status: 'failed', cursor: 'c2' });
    await webhooksApi.replay('wd1');
    await webhooksApi.devReceiver();
    expect(seen).toEqual([
      ['get', '/webhook-endpoints', undefined, undefined],
      ['post', '/webhook-endpoints', { url: 'https://x.test/h', events: ['*'] }, undefined],
      ['patch', '/webhook-endpoints/we1', { active: false }, undefined],
      ['delete', '/webhook-endpoints/we1', undefined, undefined],
      ['post', '/webhook-endpoints/we1/test', { type: 'call.completed' }, undefined],
      ['post', '/webhook-endpoints/we1/rotate-secret', undefined, undefined],
      ['post', '/webhook-endpoints/we1/enable', undefined, undefined],
      ['get', '/webhook-endpoints/we1/deliveries', undefined, { limit: 50 }],
      [
        'get',
        '/webhook-endpoints/we1/deliveries',
        undefined,
        { limit: 50, status: 'failed', cursor: 'c2' },
      ],
      ['post', '/webhook-deliveries/wd1/replay', undefined, undefined],
      ['get', '/mock/dev-receiver', undefined, undefined],
    ]);
  });

  it('outcome rules and the after-call rows of a call', async () => {
    const body = {
      name: 'R',
      when: {},
      send: { templateId: 't1', params: [] },
      timing: { mode: 'now' as const },
    };
    await outcomeRulesApi.list();
    await outcomeRulesApi.create(body);
    await outcomeRulesApi.update('r1', { active: false });
    await outcomeRulesApi.remove('r1');
    await outcomeRulesApi.afterCall('c1');
    expect(seen.map((s) => s.slice(0, 3))).toEqual([
      ['get', '/outcome-rules', undefined],
      ['post', '/outcome-rules', body],
      ['patch', '/outcome-rules/r1', { active: false }],
      ['delete', '/outcome-rules/r1', undefined],
      ['get', '/calls/c1/after-call', undefined],
    ]);
  });

  it('sheet imports', async () => {
    const body = {
      name: 'Leads',
      url: 'https://docs.google.com/spreadsheets/d/e/x/pub?output=csv',
      schedule: 'daily' as const,
      mapping: [{ index: 0, target: 'phone' as const }],
      updateExisting: true,
    };
    await sheetImportsApi.list();
    await sheetImportsApi.preview(body.url);
    await sheetImportsApi.create(body);
    await sheetImportsApi.run('s1');
    await sheetImportsApi.remove('s1');
    expect(seen.map((s) => s.slice(0, 3))).toEqual([
      ['get', '/sheet-imports', undefined],
      ['post', '/sheet-imports/preview', { url: body.url }],
      ['post', '/sheet-imports', body],
      ['post', '/sheet-imports/s1/run', undefined],
      ['delete', '/sheet-imports/s1', undefined],
    ]);
  });

  it('api keys: update, request log pages and whoami with the pasted key', async () => {
    await apiKeysApi.update('k1', { ipAllowlist: ['203.0.113.0/24'], expiresAt: null });
    await apiKeysApi.requests('k1');
    await apiKeysApi.requests('k1', 'cur');
    await apiKeysApi.whoami('cav_live_secret');
    expect(seen).toEqual([
      ['patch', '/api-keys/k1', { ipAllowlist: ['203.0.113.0/24'], expiresAt: null }, undefined],
      ['get', '/api-keys/k1/requests', undefined, { limit: 50 }],
      ['get', '/api-keys/k1/requests', undefined, { limit: 50, cursor: 'cur' }],
      ['get', '/api-keys/whoami', undefined, undefined],
    ]);
    expect(headers[3]?.['X-API-Key']).toBe('cav_live_secret');
    expect(headers[0]?.['X-API-Key']).toBeUndefined();
  });
});
