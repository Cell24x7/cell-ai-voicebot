import { apiClient, unwrap } from './client';
import type { AppInfo, SuccessEnvelope } from './types';

/** `GET /api/v1/system/info` — backend name, version and runtime. */
export const getSystemInfo = (): Promise<AppInfo> =>
  unwrap(apiClient.get<SuccessEnvelope<AppInfo>>('/system/info'));
