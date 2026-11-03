import { apiClient, unwrap } from './client';
import type { SuccessEnvelope, SystemStatus } from './types';

/** Superadmin production health (`GET /api/v1/admin/system`, Phase 17). */
export const adminSystemApi = {
  status: () => unwrap(apiClient.get<SuccessEnvelope<SystemStatus>>('/admin/system')),
};
