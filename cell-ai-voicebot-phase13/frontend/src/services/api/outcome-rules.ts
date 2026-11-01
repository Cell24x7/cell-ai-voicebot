import { apiClient, unwrap } from './client';
import type { AfterCallMessage, OutcomeRule, SuccessEnvelope } from './types';

export type RuleWhen = OutcomeRule['when'];
export type RuleParam = OutcomeRule['send']['params'][number];
export type RuleTiming = OutcomeRule['timing'];

export interface RuleInput {
  name: string;
  active?: boolean;
  order?: number;
  when: Partial<RuleWhen>;
  send: { channelId?: string | null; templateId: string; params: RuleParam[] };
  timing: { mode: RuleTiming['mode']; delayMinutes?: number | null };
}

/** `/api/v1/outcome-rules` (after-the-call rules) + `GET /calls/:id/after-call` (Phase 15). */
export const outcomeRulesApi = {
  list: () => unwrap(apiClient.get<SuccessEnvelope<OutcomeRule[]>>('/outcome-rules')),
  create: (body: RuleInput) =>
    unwrap(apiClient.post<SuccessEnvelope<OutcomeRule>>('/outcome-rules', body)),
  update: (id: string, body: Partial<RuleInput>) =>
    unwrap(apiClient.patch<SuccessEnvelope<OutcomeRule>>(`/outcome-rules/${id}`, body)),
  remove: async (id: string) => {
    await apiClient.delete(`/outcome-rules/${id}`);
  },
  afterCall: (callId: string) =>
    unwrap(apiClient.get<SuccessEnvelope<AfterCallMessage[]>>(`/calls/${callId}/after-call`)),
};
