import { apiClient, unwrap } from './client';
import type { PhoneNumber, SuccessEnvelope } from './types';

export type PhoneNumberKind = PhoneNumber['kind'];

/** Caller-ID numbers on the SIP trunk (Phase 18). */
export interface PhoneLine {
  /** `sip` = real phones over the trunk; `dryrun` = the simulated test line. */
  line: 'sip' | 'dryrun';
  numbers: PhoneNumber[];
  /** Recorded-voice / IVR campaigns over Cell24x7 (superadmin turns it on per account). */
  voiceApi?: { enabled: boolean };
}

export const phoneNumbersApi = {
  /** The account's line and its active numbers (Settings, campaign form). */
  line: () => unwrap(apiClient.get<SuccessEnvelope<PhoneLine>>('/phone-line')),
  /** The signed-in account's active numbers. */
  mine: () => unwrap(apiClient.get<SuccessEnvelope<PhoneNumber[]>>('/phone-numbers')),
  /** Superadmin: every number, optionally of one account. */
  list: (params: { accountId?: string } = {}) =>
    unwrap(apiClient.get<SuccessEnvelope<PhoneNumber[]>>('/admin/phone-numbers', { params })),
  create: (body: { number: string; kind: PhoneNumberKind; label: string }) =>
    unwrap(apiClient.post<SuccessEnvelope<PhoneNumber>>('/admin/phone-numbers', body)),
  update: (id: string, body: Partial<Pick<PhoneNumber, 'label' | 'kind' | 'status'>>) =>
    unwrap(apiClient.patch<SuccessEnvelope<PhoneNumber>>(`/admin/phone-numbers/${id}`, body)),
  assign: (id: string, accountId: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<PhoneNumber>>(`/admin/phone-numbers/${id}/assign`, {
        accountId,
      }),
    ),
  release: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<PhoneNumber>>(`/admin/phone-numbers/${id}/release`)),
};

export const phoneNumberKeys = {
  all: ['phone-numbers'] as const,
  admin: (accountId?: string) => ['phone-numbers', 'admin', accountId ?? 'all'] as const,
  mine: ['phone-numbers', 'mine'] as const,
  line: ['phone-numbers', 'line'] as const,
};

export const PHONE_KIND_LABELS: Record<PhoneNumberKind, string> = {
  '1600': '1600 series',
  landline: 'Landline',
  mobile: 'Mobile',
  other: 'Other',
};
