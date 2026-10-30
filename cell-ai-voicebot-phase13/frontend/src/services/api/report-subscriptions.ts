import { apiClient, unwrap } from './client';
import type { ReportSubscription, SuccessEnvelope } from './types';

export type ReportFrequency = ReportSubscription['frequency'];
export type EmailReportTab = ReportSubscription['tabs'][number];

export interface SubscriptionInput {
  frequency: ReportFrequency;
  tabs: EmailReportTab[];
  /** 0–23, account timezone. */
  hour: number;
}

/** `/api/v1/report-subscriptions` (Phase 14) — my report e-mails; `/report-unsubscribe` (public). */
export const reportSubscriptionsApi = {
  list: () => unwrap(apiClient.get<SuccessEnvelope<ReportSubscription[]>>('/report-subscriptions')),
  create: (body: SubscriptionInput) =>
    unwrap(apiClient.post<SuccessEnvelope<ReportSubscription>>('/report-subscriptions', body)),
  update: (id: string, body: Partial<SubscriptionInput & { active: boolean }>) =>
    unwrap(
      apiClient.patch<SuccessEnvelope<ReportSubscription>>(`/report-subscriptions/${id}`, body),
    ),
  remove: async (id: string) => {
    await apiClient.delete(`/report-subscriptions/${id}`);
  },
  unsubscribe: (token: string) =>
    unwrap(apiClient.post<SuccessEnvelope<{ stopped: true }>>('/report-unsubscribe', { token })),
};
