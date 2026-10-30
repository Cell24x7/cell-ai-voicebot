import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';

import { fakeRetention } from '@/test/retention';

import { adminApi } from './admin';
import { apiClient } from './client';
import { retentionApi } from './retention';

describe('retention API', () => {
  const original = apiClient.defaults.adapter;
  afterEach(() => {
    apiClient.defaults.adapter = original;
  });

  it('GET / PUT /account/retention and the superadmin cap', async () => {
    const seen: [string, string, unknown][] = [];
    apiClient.defaults.adapter = (config: InternalAxiosRequestConfig) => {
      seen.push([
        config.method ?? '',
        config.url ?? '',
        typeof config.data === 'string' ? (JSON.parse(config.data) as unknown) : undefined,
      ]);
      return Promise.resolve({
        status: 200,
        statusText: '',
        headers: new AxiosHeaders(),
        config,
        data: { success: true, data: fakeRetention() },
      });
    };
    expect(await retentionApi.get()).toEqual(fakeRetention());
    await retentionApi.update({ callsDays: 30 });
    await adminApi.setRetentionCap('a1', { callsDays: 60, inboxDays: null });
    expect(seen).toEqual([
      ['get', '/account/retention', undefined],
      ['put', '/account/retention', { callsDays: 30 }],
      ['put', '/admin/accounts/a1/retention-cap', { callsDays: 60, inboxDays: null }],
    ]);
  });
});
