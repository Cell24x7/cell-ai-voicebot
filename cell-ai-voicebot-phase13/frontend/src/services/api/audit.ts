import { apiClient } from './client';
import type { AuditEntry, CursorPageMeta, ListEnvelope } from './types';

export interface AuditQuery {
  cursor?: string;
  limit?: number;
  action?: string;
  actorId?: string;
  targetType?: string;
  from?: string;
  to?: string;
}

/** `GET /api/v1/audit-logs` (cursor pagination). */
export const auditApi = {
  list: async (query: AuditQuery) =>
    (
      await apiClient.get<ListEnvelope<AuditEntry, CursorPageMeta>>('/audit-logs', {
        params: query,
      })
    ).data,
};
