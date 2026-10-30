import { apiClient, unwrap } from './client';
import type {
  AccountLimits,
  AdminAccountDetail,
  AdminAccountRow,
  AuthSession,
  ListEnvelope,
  OffsetPageMeta,
  PublicAccount,
  SuccessEnvelope,
} from './types';

export interface AdminAccountsQuery {
  page?: number;
  limit?: number;
  status?: 'active' | 'suspended';
  search?: string;
}

/** Superadmin endpoints (`/api/v1/admin/*`). */
export const adminApi = {
  accounts: async (query: AdminAccountsQuery) =>
    (
      await apiClient.get<ListEnvelope<AdminAccountRow, OffsetPageMeta>>('/admin/accounts', {
        params: query,
      })
    ).data,
  account: (id: string) =>
    unwrap(apiClient.get<SuccessEnvelope<AdminAccountDetail>>(`/admin/accounts/${id}`)),
  suspend: (id: string, reason: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<PublicAccount>>(`/admin/accounts/${id}/suspend`, { reason }),
    ),
  enable: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<PublicAccount>>(`/admin/accounts/${id}/enable`)),
  impersonate: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<AuthSession>>(`/admin/accounts/${id}/impersonate`)),
  /** Dialing limits (max concurrent calls, dials per minute); audited. */
  setLimits: (id: string, body: Partial<AccountLimits>) =>
    unwrap(apiClient.patch<SuccessEnvelope<AccountLimits>>(`/admin/accounts/${id}/limits`, body)),
  /** Emergency stop: every scheduled / running campaign pauses as `admin`. */
  pauseCampaigns: (id: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<{ paused: number }>>(`/admin/accounts/${id}/campaigns/pause`),
    ),
  /** Lifts an `admin` pause (superadmins only). */
  resumeCampaign: (id: string, campaignId: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<{ id: string; status: string }>>(
        `/admin/accounts/${id}/campaigns/${campaignId}/resume`,
      ),
    ),
  stopImpersonation: () => apiClient.post('/admin/impersonation/stop').then(() => undefined),
};
