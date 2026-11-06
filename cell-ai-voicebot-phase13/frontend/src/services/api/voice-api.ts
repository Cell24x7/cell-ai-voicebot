import { apiClient, unwrap } from './client';
import type { components } from './schema.gen';
import type { SuccessEnvelope } from './types';

type Schemas = components['schemas'];
export type AccountVoiceApi = Schemas['AccountVoiceApi'];
export type AdminVoiceStatus = Schemas['AdminVoiceStatus'];
export type AdminVoiceIvr = Schemas['AdminVoiceIvr'];
/** Which Cell24x7 login an account uses (never the token). */
export type VoiceCredentials = Schemas['VoiceCredentials'];
export type VoiceCredentialsInput = Schemas['VoiceCredentialsBody'];

export const voiceApiKeys = {
  status: ['admin', 'voice-api', 'status'] as const,
  ivrs: ['admin', 'voice-api', 'ivrs'] as const,
};

/** Recorded-voice / IVR campaigns over Cell24x7 — superadmin controls (VAPI). */
export const voiceAdminApi = {
  setAccount: (accountId: string, body: Partial<AccountVoiceApi>) =>
    unwrap(
      apiClient.patch<SuccessEnvelope<AccountVoiceApi>>(
        `/admin/accounts/${accountId}/voice-api`,
        body,
      ),
    ),
  /** The account's own Cell24x7 token + caller ID (checked first), or back to the platform token. */
  setCredentials: (accountId: string, body: VoiceCredentialsInput) =>
    unwrap(
      apiClient.put<SuccessEnvelope<VoiceCredentials>>(
        `/admin/accounts/${accountId}/voice-api/credentials`,
        body,
      ),
    ),
  /** Points the account's own Cell24x7 login at its own result webhook. */
  registerAccountWebhook: (accountId: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<VoiceCredentials>>(
        `/admin/accounts/${accountId}/voice-api/webhook`,
      ),
    ),
  status: () => unwrap(apiClient.get<SuccessEnvelope<AdminVoiceStatus>>('/admin/voice-api/status')),
  registerWebhook: () =>
    unwrap(
      apiClient.post<SuccessEnvelope<{ registered: boolean; matches: boolean }>>(
        '/admin/voice-api/webhook',
      ),
    ),
  ivrs: () => unwrap(apiClient.get<SuccessEnvelope<AdminVoiceIvr[]>>('/admin/voice-api/ivrs')),
  resolveBatch: (
    campaignId: string,
    batchNo: number,
    body: { outcome: 'submitted'; requestId: string } | { outcome: 'not_submitted' },
  ) =>
    unwrap(
      apiClient.post<SuccessEnvelope<{ batchNo: number; state: string }>>(
        `/admin/campaigns/${campaignId}/voice-batches/${String(batchNo)}/resolve`,
        body,
      ),
    ),
};
