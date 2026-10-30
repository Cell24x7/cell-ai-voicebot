import { apiClient, unwrap } from './client';
import type { AdminAiConfig, SuccessEnvelope } from './types';

/** `/api/v1/admin/ai/*` — superadmin AI settings (read-only). */
export const adminAiApi = {
  config: () => unwrap(apiClient.get<SuccessEnvelope<AdminAiConfig>>('/admin/ai/config')),
};
