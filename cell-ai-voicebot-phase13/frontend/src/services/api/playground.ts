import { apiClient, unwrap } from './client';
import type {
  PlaygroundReply,
  PlaygroundSession,
  PlaygroundSessionRow,
  SuccessEnvelope,
} from './types';

export interface StartSessionInput {
  contactId?: string;
  variables?: Record<string, string>;
  testPhone?: string;
}

const base = (agentId: string) => `/agents/${agentId}/playground/sessions`;

/** `/api/v1/agents/:id/playground/sessions` — test conversations (charged per turn). */
export const playgroundApi = {
  list: (agentId: string, mine = false) =>
    unwrap(
      apiClient.get<SuccessEnvelope<PlaygroundSessionRow[]>>(base(agentId), {
        params: mine ? { mine: 'true' } : {},
      }),
    ),
  get: (agentId: string, sid: string) =>
    unwrap(apiClient.get<SuccessEnvelope<PlaygroundSession>>(`${base(agentId)}/${sid}`)),
  start: (agentId: string, body: StartSessionInput) =>
    unwrap(apiClient.post<SuccessEnvelope<PlaygroundSession>>(base(agentId), body)),
  /** Same `clientTurnId` again → the stored reply (no second charge). */
  send: (agentId: string, sid: string, body: { text: string; clientTurnId: string }) =>
    unwrap(
      apiClient.post<SuccessEnvelope<PlaygroundReply>>(`${base(agentId)}/${sid}/messages`, body),
    ),
  reset: (agentId: string, sid: string) =>
    unwrap(apiClient.post<SuccessEnvelope<PlaygroundSession>>(`${base(agentId)}/${sid}/reset`)),
};
