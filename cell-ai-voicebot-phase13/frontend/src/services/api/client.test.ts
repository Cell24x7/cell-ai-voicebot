import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from 'axios';
import { afterEach, describe, expect, it } from 'vitest';

import { apiClient, unwrap } from './client';
import { ApiError } from './errors';
import type { SuccessEnvelope } from './types';

const originalAdapter = apiClient.defaults.adapter;

const respondWith =
  (status: number, data: unknown): AxiosAdapter =>
  (config: InternalAxiosRequestConfig) => {
    const response = { status, statusText: '', data, headers: new AxiosHeaders(), config };
    if (status >= 400) {
      return Promise.reject(
        new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, undefined, response),
      );
    }
    return Promise.resolve(response);
  };

describe('apiClient', () => {
  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
  });

  it('rejects with an ApiError built from the error envelope', async () => {
    apiClient.defaults.adapter = respondWith(422, {
      success: false,
      error: { code: 'VALIDATION_FAILED', message: 'Some fields are invalid.', requestId: 'req_1' },
    });
    const err = (await apiClient.get('/contacts').catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.status).toBe(422);
  });

  it('rejects with NETWORK_ERROR when there is no response', async () => {
    apiClient.defaults.adapter = (config) =>
      Promise.reject(new AxiosError('Network Error', 'ERR_NETWORK', config));
    await expect(apiClient.get('/system/info')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('unwrap returns the envelope data', async () => {
    apiClient.defaults.adapter = respondWith(200, { success: true, data: { ok: 1 } });
    await expect(unwrap(apiClient.get<SuccessEnvelope<{ ok: number }>>('/x'))).resolves.toEqual({
      ok: 1,
    });
  });

  it('uses the /api/v1 base path and a 15 s timeout', () => {
    expect(apiClient.defaults.baseURL).toBe('/api/v1');
    expect(apiClient.defaults.timeout).toBe(15_000);
  });
});
