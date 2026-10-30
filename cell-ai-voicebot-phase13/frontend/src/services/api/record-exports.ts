import { apiClient, unwrap } from './client';
import { reportParams, type ReportQuery, type ReportTab } from './reports';
import type { ListEnvelope, OffsetPageMeta, RecordExport, SuccessEnvelope } from './types';

export type ExportFormat = 'csv' | 'xlsx';

/** `POST /exports/calls` — the calls list filters; days are account-local `YYYY-MM-DD`. */
export interface CallsExportBody {
  format: ExportFormat;
  from?: string;
  to?: string;
  status?: string[];
  flowId?: string;
  agentId?: string;
  campaignId?: string;
  contactId?: string;
  provider?: string;
  direction?: 'inbound' | 'outbound';
  mode?: 'human' | 'ai';
  isTest?: boolean;
  disposition?: string[];
  sentiment?: 'positive' | 'neutral' | 'negative';
  hasPromise?: boolean;
  hasSummary?: boolean;
  channelId?: string;
  answeredBy?: string;
  q?: string;
  /** Full phone numbers (needs `contacts.export` too). */
  includePhone?: boolean;
  includeSummary?: boolean;
}

export interface MessagesExportBody {
  format: ExportFormat;
  from: string;
  to: string;
  channelId?: string;
  direction?: 'in' | 'out';
}

/** `/api/v1/exports` (Phase 14) — files of calls, message metadata or one report tab. */
export const recordExportsApi = {
  calls: (body: CallsExportBody) =>
    unwrap(apiClient.post<SuccessEnvelope<RecordExport>>('/exports/calls', body)),
  messages: (body: MessagesExportBody) =>
    unwrap(apiClient.post<SuccessEnvelope<RecordExport>>('/exports/messages', body)),
  report: (format: ExportFormat, tab: ReportTab, query: ReportQuery) =>
    unwrap(
      apiClient.post<SuccessEnvelope<RecordExport>>('/exports/report', {
        format,
        tab,
        query: reportParams(query),
      }),
    ),
  list: async (query: { page?: number; limit?: number }) =>
    (
      await apiClient.get<ListEnvelope<RecordExport, OffsetPageMeta>>('/exports', {
        params: query,
      })
    ).data,
  get: (id: string) => unwrap(apiClient.get<SuccessEnvelope<RecordExport>>(`/exports/${id}`)),
};
