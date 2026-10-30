import type {
  Call,
  WhatsAppCallingSettings,
  WhatsAppCallPermission,
  WhatsAppCallPermissionStatus,
} from '@/services/api/types';
import type { WsEventMap } from '@/services/realtime/events';

import { fakeCall } from './calls';

/** Calling settings of a number (calling on, team route, no call hours). */
export const fakeCallingSettings = (
  overrides: Partial<WhatsAppCallingSettings> = {},
): WhatsAppCallingSettings => ({
  channelId: 'wa1',
  status: 'enabled',
  unavailableReason: null,
  businessCallsAvailable: true,
  businessCallsBlockedBy: null,
  callIconVisibility: 'DEFAULT',
  iconCountries: [],
  callHours: { enabled: false, timezone: 'Asia/Kolkata', weekly: [], holidays: [] },
  callbackPermission: false,
  inbound: { route: 'team', aiProgram: null, ringTimeoutSec: 30, ringUserIds: null },
  permissionRequestBody: 'Kya hum aapko WhatsApp par call kar sakte hain?',
  restrictions: [],
  syncedAt: '2026-10-25T08:00:00.000Z',
  lastError: null,
  ...overrides,
});

/** A customer's permission in a state (`temporary` expires in 5 days). */
export const fakeCallPermission = (
  status: WhatsAppCallPermissionStatus = 'none',
  overrides: Partial<WhatsAppCallPermission> = {},
): WhatsAppCallPermission => {
  const can = status === 'temporary' || status === 'permanent';
  return {
    status,
    expiresAt: status === 'temporary' ? '2026-10-30T10:00:00.000Z' : null,
    canCall: can,
    canRequest: !can && status !== 'requested' && status !== 'declined',
    nextRequestAt: null,
    reason: can
      ? null
      : status === 'requested'
        ? 'requested'
        : status === 'declined'
          ? 'declined'
          : 'no_permission',
    history:
      status === 'none'
        ? []
        : [{ status, at: '2026-10-25T09:00:00.000Z', source: 'request_reply' }],
    ...overrides,
  };
};

type WaCallState = 'ringing' | 'in_progress' | 'completed' | 'no_answer' | 'failed';

/** A WhatsApp call (agent or AI, either direction). */
export const fakeWaCall = (
  state: WaCallState = 'in_progress',
  mode: 'human' | 'ai' = 'human',
  direction: 'outbound' | 'inbound' = 'outbound',
  overrides: Partial<Call> = {},
): Call =>
  fakeCall({
    id: 'wc1',
    provider: 'whatsapp',
    direction,
    mode,
    isTest: false,
    agentUserId: mode === 'human' ? 'u1' : null,
    status: state,
    endReason:
      state === 'completed' ? 'customer_hangup' : state === 'no_answer' ? 'not_answered' : null,
    source:
      mode === 'ai'
        ? { kind: 'flow', flowId: 'f1', flowVersionRef: 1, agentId: null, name: 'Loan recovery' }
        : { kind: null, flowId: null, flowVersionRef: null, agentId: null, name: null },
    whatsapp: {
      channelId: 'wa1',
      conversationId: 'cv1',
      direction: direction === 'outbound' ? 'BUSINESS_INITIATED' : 'USER_INITIATED',
      metaStatus: state === 'completed' ? 'COMPLETED' : null,
      metaDuration: state === 'completed' ? 134 : null,
      answeredBy: direction === 'inbound' && mode === 'human' ? 'u1' : null,
      transferredTo: null,
      timeline: [
        { event: direction === 'outbound' ? 'dialed' : 'connect', at: '2026-10-25T10:00:00.000Z' },
      ],
    },
    ...overrides,
  });

/** `whatsapp.call.incoming` payload. */
export const fakeIncoming = (
  overrides: Partial<WsEventMap['whatsapp.call.incoming']> = {},
): WsEventMap['whatsapp.call.incoming'] => ({
  callId: 'wc1',
  conversationId: 'cv1',
  contactId: 'k1',
  channelId: 'wa1',
  ringUntil: new Date(Date.now() + 30_000).toISOString(),
  ...overrides,
});
