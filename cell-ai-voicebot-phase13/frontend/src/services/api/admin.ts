import { apiClient, unwrap } from './client';
import type {
  AccountLimits,
  Retention,
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
  /** Phase 19 */
  kind?: 'business' | 'reseller';
  parentAccountId?: string;
}

export interface SignupSettings {
  open: boolean;
  resellerSignup: 'open' | 'approval' | 'closed';
}

export interface CreateAccountInput {
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerPhone?: string;
  kind?: 'business' | 'reseller';
  parentAccountId?: string;
}

/** Superadmin endpoints (`/api/v1/admin/*`). */
export const adminApi = {
  createAccount: (body: CreateAccountInput) =>
    unwrap(apiClient.post<SuccessEnvelope<PublicAccount>>('/admin/accounts', body)),
  /** Phase 19: resellers and signup. */
  setReseller: (id: string, parentAccountId: string | null) =>
    unwrap(
      apiClient.patch<SuccessEnvelope<PublicAccount>>(`/admin/accounts/${id}/reseller`, {
        parentAccountId,
      }),
    ),
  approveReseller: (id: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<PublicAccount>>(`/admin/accounts/${id}/approve-reseller`),
    ),
  suspendCustomers: (id: string, reason: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<{ suspended: number }>>(
        `/admin/accounts/${id}/suspend-customers`,
        { reason },
      ),
    ),
  signupSettings: () =>
    unwrap(apiClient.get<SuccessEnvelope<SignupSettings>>('/admin/settings/signup')),
  setSignupSettings: (body: SignupSettings) =>
    unwrap(apiClient.put<SuccessEnvelope<SignupSettings>>('/admin/settings/signup', body)),
  accountDeletions: () =>
    unwrap(
      apiClient.get<
        SuccessEnvelope<
          {
            id: string;
            name: string;
            status: 'scheduled' | 'purging' | 'purged';
            requestedAt: string | null;
            scheduledFor: string | null;
            balanceMicros: number;
          }[]
        >
      >('/admin/account-deletions'),
    ),
  cancelDeletion: (id: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<{ canceled: true }>>(`/admin/accounts/${id}/deletion/cancel`),
    ),
  runDeletion: (id: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<{ status: 'purged' | 'waiting'; contacts: number }>>(
        `/admin/accounts/${id}/deletion/run`,
      ),
    ),
  setApiLimits: (
    id: string,
    apiLimits: { readsPerMinute: number; writesPerMinute: number } | null,
  ) =>
    unwrap(
      apiClient.patch<SuccessEnvelope<unknown>>(`/admin/accounts/${id}/api-limits`, { apiLimits }),
    ),
  /** Phase 18: the phone line of the account's campaigns and calls (`dryrun` = test line). */
  setVoiceLine: (id: string, voiceLine: 'dryrun' | 'sip') =>
    unwrap(
      apiClient.patch<SuccessEnvelope<{ voiceLine: 'dryrun' | 'sip' }>>(
        `/admin/accounts/${id}/voice-line`,
        { voiceLine },
      ),
    ),
  setSipSettings: (
    id: string,
    body: { pulseSec: number | null; spendMinutesPerHour: number | null },
  ) =>
    unwrap(apiClient.patch<SuccessEnvelope<unknown>>(`/admin/accounts/${id}/sip-settings`, body)),
  setOwnerPassword: async (id: string, password: string) => {
    await apiClient.post(`/admin/accounts/${id}/owner-password`, { password });
  },
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
  /** Phase 19: `view` = read-only, `act` = work in the account (sensitive actions refused). */
  impersonate: (id: string, mode: 'view' | 'act' = 'view') =>
    unwrap(
      apiClient.post<SuccessEnvelope<AuthSession>>(`/admin/accounts/${id}/impersonate`, { mode }),
    ),
  /** Dialing limits (max concurrent calls, dials per minute); audited. */
  setLimits: (id: string, body: Partial<AccountLimits>) =>
    unwrap(apiClient.patch<SuccessEnvelope<AccountLimits>>(`/admin/accounts/${id}/limits`, body)),
  /** Phase 14: cap how long an account may keep call records / chats (`null` = platform default). */
  setRetentionCap: (id: string, body: { callsDays: number | null; inboxDays: number | null }) =>
    unwrap(apiClient.put<SuccessEnvelope<Retention>>(`/admin/accounts/${id}/retention-cap`, body)),
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
