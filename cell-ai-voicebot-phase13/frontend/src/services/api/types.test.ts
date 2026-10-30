import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { apiClient } from './client';
import { getSystemInfo } from './system';
import type { ApiErrorEnvelope, AppInfo, SuccessEnvelope } from './types';

describe('generated API types', () => {
  it('AppInfo matches the backend schema', () => {
    expectTypeOf<AppInfo>().toEqualTypeOf<{
      name: string;
      version: string;
      node: string;
      env: string;
    }>();
  });

  it('error envelope has success: false and an error code', () => {
    expectTypeOf<ApiErrorEnvelope['success']>().toEqualTypeOf<false>();
    expectTypeOf<ApiErrorEnvelope['error']['code']>().toEqualTypeOf<string>();
  });
});

describe('getSystemInfo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls /system/info and unwraps the envelope', async () => {
    const info: AppInfo = {
      name: 'cell-ai-voicebot-backend',
      version: '0.0.1',
      node: 'v24.19.0',
      env: 'test',
    };
    const envelope: SuccessEnvelope<AppInfo> = { success: true, data: info };
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: envelope });

    await expect(getSystemInfo()).resolves.toEqual(info);
    expect(getSpy).toHaveBeenCalledWith('/system/info');
  });
});
