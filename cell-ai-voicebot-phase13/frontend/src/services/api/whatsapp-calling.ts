import { apiClient, unwrap } from './client';
import type {
  CallAvailabilityStatus,
  CallPermissionRequestResult,
  StartedWhatsAppCall,
  SuccessEnvelope,
  WhatsAppCallingReadiness,
  WhatsAppCallingSettings,
  WhatsAppCallingSettingsPatch,
  WhatsAppCallMediaTicket,
  WhatsAppCallPermissionRun,
  WhatsAppCallPermission,
  WhatsAppCallProgram,
} from './types';

export interface StartWhatsAppCallInput {
  channelId: string;
  contactId: string;
  mode: 'human' | 'ai';
  program?: WhatsAppCallProgram | null;
}

export interface RequestCallPermissionInput {
  channelId: string;
  contactId: string;
  /** The request text (default: the number's permission request text). */
  body?: string;
  /** Phase 18B: outside the window, this approved permission template. */
  templateId?: string;
}

/** Phase 18B: exactly one target. */
export type BulkPermissionTarget =
  { contactIds: string[] } | { listId: string } | { segmentId: string };

export interface BulkCallPermissionInput {
  channelId: string;
  target: BulkPermissionTarget;
  templateId: string;
  variables?: Record<string, string>;
}

const settings = (channelId: string, action = '') =>
  `/whatsapp/channels/${channelId}/calling${action}`;
const call = (id: string, action: string) => `/whatsapp/calls/${id}/${action}`;

/** `/api/v1/whatsapp/…` calling routes (PHASE_12_PLAN §1o, api.md §14f). */
export const whatsappCallingApi = {
  getSettings: (channelId: string) =>
    unwrap(apiClient.get<SuccessEnvelope<WhatsAppCallingSettings>>(settings(channelId))),
  /** Meta first: only the fields that changed go to Meta (409 when calling is unavailable). */
  updateSettings: (channelId: string, body: WhatsAppCallingSettingsPatch) =>
    unwrap(apiClient.patch<SuccessEnvelope<WhatsAppCallingSettings>>(settings(channelId), body)),
  /** Phase 18B: what calling on the number needs, with the fix for each item. */
  readiness: (channelId: string) =>
    unwrap(
      apiClient.get<SuccessEnvelope<WhatsAppCallingReadiness>>(settings(channelId, '/readiness')),
    ),
  syncSettings: (channelId: string) =>
    unwrap(apiClient.post<SuccessEnvelope<WhatsAppCallingSettings>>(settings(channelId, '/sync'))),
  /** `refresh` asks Meta again (else ≤ 60 s old). */
  permission: (channelId: string, contactId: string, refresh = false) =>
    unwrap(
      apiClient.get<SuccessEnvelope<WhatsAppCallPermission>>('/whatsapp/call-permissions', {
        params: { channelId, contactId, ...(refresh ? { refresh: 'true' } : {}) },
      }),
    ),
  requestPermission: (body: RequestCallPermissionInput) =>
    unwrap(
      apiClient.post<SuccessEnvelope<CallPermissionRequestResult>>(
        '/whatsapp/call-permissions/request',
        body,
      ),
    ),
  /** Phase 18B: ask up to 5,000 contacts with an approved permission template (202 + run id). */
  requestPermissionBulk: (body: BulkCallPermissionInput, idempotencyKey: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<{ runId: string }>>('/whatsapp/call-permissions/bulk', body, {
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    ),
  permissionRun: (runId: string) =>
    unwrap(
      apiClient.get<SuccessEnvelope<WhatsAppCallPermissionRun>>(
        `/whatsapp/call-permissions/bulk/${runId}`,
      ),
    ),
  /** One Idempotency-Key per attempt; agent calls return the browser leg's media ticket. */
  start: (body: StartWhatsAppCallInput, idempotencyKey: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<StartedWhatsAppCall>>('/whatsapp/calls', body, {
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    ),
  /** First wins (409 `WHATSAPP_CALL_TAKEN` / `WHATSAPP_CALL_NOT_RINGING`). */
  answer: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<WhatsAppCallMediaTicket>>(call(id, 'answer'))),
  decline: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<{ declined: boolean }>>(call(id, 'decline'))),
  hold: (id: string, on: boolean) =>
    unwrap(apiClient.post<SuccessEnvelope<{ held: boolean }>>(call(id, 'hold'), { on })),
  /** AI calls: ring the team (or one user) — the agent takes over the same call. */
  transfer: (id: string, userId?: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<{ callId: string; ringing: boolean }>>(
        call(id, 'transfer'),
        userId ? { userId } : {},
      ),
    ),
  /** The agent's media socket again (reconnect). */
  mediaTicket: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<WhatsAppCallMediaTicket>>(`/calls/${id}/media-ticket`)),
  setAvailability: (status: CallAvailabilityStatus) =>
    unwrap(
      apiClient.patch<SuccessEnvelope<{ status: CallAvailabilityStatus }>>(
        '/users/me/call-availability',
        { status },
      ),
    ),
};
