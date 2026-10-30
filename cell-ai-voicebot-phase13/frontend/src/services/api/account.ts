import { apiClient, unwrap } from './client';
import type { AccountWithWarning, AuthMe, SuccessEnvelope } from './types';

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
};
