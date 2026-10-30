import { apiClient, unwrap } from './client';
import type { Report, SuccessEnvelope } from './types';

export type ReportTab = Report['tab'];
export type ReportUnit = Report['kpis'][number]['unit'];

/** `GET /reports/:tab` filters (account-local days; one slice at a time). */
export interface ReportQuery {
  from?: string;
  to?: string;
  compare?: boolean;
  channel?: 'voice' | 'whatsapp';
  channelId?: string;
  campaignId?: string;
  campaignIds?: string[];
  flowId?: string;
  agentId?: string;
  userId?: string;
  includeTest?: boolean;
}

/** `ReportQuery` → the wire format (string flags, comma lists) — also the `/exports/report` body's `query`. */
export const reportParams = ({ compare, includeTest, campaignIds, ...rest }: ReportQuery) => ({
  ...rest,
  ...(compare === undefined ? {} : { compare: String(compare) }),
  ...(includeTest === undefined ? {} : { includeTest: String(includeTest) }),
  ...(campaignIds?.length ? { campaignIds: campaignIds.join(',') } : {}),
});

/** Phase 14 — reports from the daily rollups. */
export const reportsApi = {
  get: (tab: ReportTab, query: ReportQuery) =>
    unwrap(
      apiClient.get<SuccessEnvelope<Report>>(`/reports/${tab}`, { params: reportParams(query) }),
    ),
};
