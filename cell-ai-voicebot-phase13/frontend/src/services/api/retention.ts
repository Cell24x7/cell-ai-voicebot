import { apiClient, unwrap } from './client';
import type { Retention, SuccessEnvelope } from './types';

export type RetentionSettings = Retention['settings'];

/** `/api/v1/account/retention` (Phase 14) — days kept per kind; `null` = platform default. */
export const retentionApi = {
  get: () => unwrap(apiClient.get<SuccessEnvelope<Retention>>('/account/retention')),
  update: (body: Partial<RetentionSettings>) =>
    unwrap(apiClient.put<SuccessEnvelope<Retention>>('/account/retention', body)),
};
