import { apiClient, unwrap } from './client';
import type {
  Call,
  CallEvent,
  CallRecordingLink,
  CallStatusValue,
  CallTranscriptTurn,
  CursorPageMeta,
  ListEnvelope,
  StartedWebCall,
  SuccessEnvelope,
} from './types';

export interface StartWebCallInput {
  flowId?: string;
  version?: 'draft' | 'published' | number;
  agentId?: string;
  contactId?: string;
  variables?: Record<string, string>;
  testPhone?: string;
}

/** `POST /calls` — one contact now (dry-run line until phone lines exist). */
export interface StartCallInput {
  contactId: string;
  flowId?: string;
  version?: 'published' | number;
  agentId?: string;
}

export interface ListCallsQuery {
  cursor?: string;
  limit?: number;
  status?: CallStatusValue[];
  flowId?: string;
  agentId?: string;
  contactId?: string;
  campaignId?: string;
  provider?: Call['provider'];
  /** Phase 12 (WhatsApp calls): who called, agent or AI. */
  direction?: Call['direction'];
  mode?: Call['mode'];
  isTest?: boolean;
  from?: string;
  to?: string;
  q?: string;
}

const listParams = ({ status, isTest, ...rest }: ListCallsQuery) => ({
  ...rest,
  ...(status?.length ? { status: status.join(',') } : {}),
  ...(isTest === undefined ? {} : { isTest: String(isTest) }),
});

/** `/api/v1/calls` — browser test calls, history, transcripts, recordings. */
export const callsApi = {
  /** Creates the call + wallet hold; join `/ws/media` with the ticket within 60 s. */
  startWeb: (body: StartWebCallInput) =>
    unwrap(apiClient.post<SuccessEnvelope<StartedWebCall>>('/calls/web', body)),
  /** "Call now": one Idempotency-Key per attempt (a retry of the same submit reuses it). */
  start: (body: StartCallInput, idempotencyKey: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<Call>>('/calls', body, {
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    ),
  list: async (query: ListCallsQuery) =>
    (
      await apiClient.get<ListEnvelope<Call, CursorPageMeta>>('/calls', {
        params: listParams(query),
      })
    ).data,
  active: () => unwrap(apiClient.get<SuccessEnvelope<Call[]>>('/calls/active')),
  get: (id: string) => unwrap(apiClient.get<SuccessEnvelope<Call>>(`/calls/${id}`)),
  transcript: (id: string) =>
    unwrap(apiClient.get<SuccessEnvelope<CallTranscriptTurn[]>>(`/calls/${id}/transcript`)),
  events: (id: string) =>
    unwrap(apiClient.get<SuccessEnvelope<CallEvent[]>>(`/calls/${id}/events`)),
  /** Signed 5-minute link (calls.listen; audited on the server). */
  recording: (id: string) =>
    unwrap(apiClient.get<SuccessEnvelope<CallRecordingLink>>(`/calls/${id}/recording`)),
  hangup: (id: string) => unwrap(apiClient.post<SuccessEnvelope<Call>>(`/calls/${id}/hangup`)),
};
