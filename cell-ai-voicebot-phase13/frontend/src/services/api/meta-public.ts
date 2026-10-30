import { apiClient, unwrap } from './client';
import type { SuccessEnvelope } from './types';

export interface DataDeletionStatus {
  status: 'received' | 'completed';
  receivedAt: string;
  completedAt: string | null;
}

/** Public Meta pages (no login). */
export const metaPublicApi = {
  deletionStatus: (code: string) =>
    unwrap(
      apiClient.get<SuccessEnvelope<DataDeletionStatus>>(
        `/meta/data-deletion/${encodeURIComponent(code)}`,
      ),
    ),
};
