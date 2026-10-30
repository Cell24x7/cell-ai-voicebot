import { apiClient, unwrap } from './client';
import type {
  CallInsights,
  ChatSummary,
  AccountDisposition,
  Dispositions,
  InsightsSettings,
  SuccessEnvelope,
} from './types';

/** Phase 14 — post-call AI, call outcomes, chat summaries. */
export const insightsApi = {
  get: (callId: string) =>
    unwrap(apiClient.get<SuccessEnvelope<CallInsights>>(`/calls/${callId}/insights`)),
  /** A new version (uses AI credit). */
  regenerate: (callId: string) =>
    unwrap(apiClient.post<SuccessEnvelope<CallInsights>>(`/calls/${callId}/insights/regenerate`)),
  setDisposition: (callId: string, disposition: string) =>
    unwrap(
      apiClient.patch<SuccessEnvelope<CallInsights>>(`/calls/${callId}/disposition`, {
        disposition,
      }),
    ),
  settings: () =>
    unwrap(apiClient.get<SuccessEnvelope<InsightsSettings>>('/account/insights-settings')),
  updateSettings: (body: Partial<InsightsSettings>) =>
    unwrap(apiClient.put<SuccessEnvelope<InsightsSettings>>('/account/insights-settings', body)),
  dispositions: () => unwrap(apiClient.get<SuccessEnvelope<Dispositions>>('/account/dispositions')),
  updateDispositions: (dispositions: AccountDisposition[]) =>
    unwrap(apiClient.put<SuccessEnvelope<Dispositions>>('/account/dispositions', { dispositions })),
  chatSummaries: (conversationId: string) =>
    unwrap(
      apiClient.get<SuccessEnvelope<ChatSummary[]>>(
        `/inbox/conversations/${conversationId}/summary`,
      ),
    ),
  /** Summarise the messages since the last summary (uses AI credit). */
  requestChatSummary: (conversationId: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<ChatSummary[]>>(
        `/inbox/conversations/${conversationId}/summary`,
      ),
    ),
};
