import { apiClient, unwrap } from './client';
import type { AccountWithWarning, AuthMe, Schemas, SuccessEnvelope } from './types';

export interface AccountUpdate {
  name?: string;
  timezone?: string;
  country?: string;
  defaultLanguage?: 'hi' | 'en' | 'hinglish';
  settings?: {
    callingWindow?: { start: string; end: string; days: number[] };
    /** Owner / admin only. */
    callCaps?: { perDay: number; perWeek: number; minGapMinutes: number };
    recordingEnabled?: boolean;
    recordingNotice?: string;
    aiDisclosureEnabled?: boolean;
  };
}

/** `/api/v1/account` + own profile. */
export const accountApi = {
  /** The account + `callingWindowWarning` (TRAI / RBI bounds the window crosses). */
  get: () => unwrap(apiClient.get<SuccessEnvelope<AccountWithWarning>>('/account')),
  update: (body: AccountUpdate) =>
    unwrap(apiClient.patch<SuccessEnvelope<AccountWithWarning>>('/account', body)),
  updateProfile: (body: { name?: string; phone?: string | null }) =>
    unwrap(apiClient.patch<SuccessEnvelope<AuthMe>>('/auth/me', body)),
  compliance: () =>
    unwrap(apiClient.get<SuccessEnvelope<Schemas['Compliance']>>('/account/compliance')),
  complianceCsv: async () =>
    (await apiClient.get<Blob>('/account/compliance/export', { responseType: 'blob' })).data,
  startExport: (body: { password: string; includeRecordings: boolean }) =>
    unwrap(apiClient.post<SuccessEnvelope<Schemas['AccountExport']>>('/account/export', body)),
  exports: () =>
    unwrap(apiClient.get<SuccessEnvelope<Schemas['AccountExport'][]>>('/account/exports')),
  exportDetail: (id: string) =>
    unwrap(apiClient.get<SuccessEnvelope<Schemas['AccountExport']>>(`/account/exports/${id}`)),
  scheduleDelete: (body: { password: string; confirmName: string }) =>
    unwrap(apiClient.post<SuccessEnvelope<Schemas['AccountDeletion']>>('/account/delete', body)),
  cancelDelete: () =>
    unwrap(apiClient.post<SuccessEnvelope<{ canceled: true }>>('/account/delete/cancel')),
};
