import { apiClient, unwrap } from './client';
import type {
  ListEnvelope,
  OffsetPageMeta,
  SuccessEnvelope,
  WhatsAppCampaign,
  WhatsAppCampaignEstimate,
  WhatsAppCampaignRecipient,
  WhatsAppCampaignReport,
} from './types';

/** `/api/v1/whatsapp-campaigns` (Phase 19 T19.13): bulk template sends. */
export interface ListWaCampaignsQuery {
  page?: number;
  limit?: number;
  status?: WhatsAppCampaign['status'];
}

export interface WaCampaignVariants {
  key: 'A' | 'B' | 'C';
  templateId: string;
  splitPct: number;
}

export interface WaCampaignCreateInput {
  name: string;
  headerLocation?: { latitude: number; longitude: number; name?: string; address?: string } | null;
  headerMediaToken?: string | null;
  channelId: string;
  variants: WaCampaignVariants[];
  /** Only for 2+ variants: which metric wins and after how many hours. */
  abWinner?: { metric: 'read' | 'reply'; afterHours: number } | null;
  /** Template variable key → where the value comes from. */
  variables?: Record<
    string,
    { kind: 'field' | 'contact.name' | 'contact.phone' | 'static'; value?: string | null }
  >;
  audience: {
    listIds?: string[];
    segmentId?: string | null;
    tags?: { values: string[]; mode: 'any' | 'all' } | null;
    contactIds?: string[];
    csvUploadId?: string | null;
  };
  excludeRecentDays?: number;
  schedule?: {
    kind: 'now' | 'at' | 'recurring';
    at?: string | null;
    timezone?: string;
    recurrence?: WhatsAppCampaign['schedule']['recurrence'];
  };
}

/** Recipient table filter. */
export interface ListWaRecipientsQuery {
  page?: number;
  limit?: number;
  status?: WhatsAppCampaignRecipient['status'];
}

const c = (id: string, action = '') => `/whatsapp-campaigns/${id}${action}`;

export const waCampaignsApi = {
  list: async (query: ListWaCampaignsQuery = {}) =>
    (
      await apiClient.get<ListEnvelope<WhatsAppCampaign, OffsetPageMeta>>('/whatsapp-campaigns', {
        params: query,
      })
    ).data,
  get: (id: string) => unwrap(apiClient.get<SuccessEnvelope<WhatsAppCampaign>>(c(id))),
  create: (body: WaCampaignCreateInput) =>
    unwrap(apiClient.post<SuccessEnvelope<WhatsAppCampaign>>('/whatsapp-campaigns', body)),
  update: (id: string, body: WaCampaignCreateInput) =>
    unwrap(apiClient.patch<SuccessEnvelope<WhatsAppCampaign>>(c(id), body)),
  remove: async (id: string) => {
    await apiClient.delete(c(id));
  },
  estimate: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<WhatsAppCampaignEstimate>>(c(id, '/estimate'))),
  /** One Idempotency-Key per start attempt (a retry of the same click reuses it). */
  start: (id: string, idempotencyKey: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<WhatsAppCampaign>>(c(id, '/start'), undefined, {
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    ),
  pause: (id: string) => unwrap(apiClient.post<SuccessEnvelope<WhatsAppCampaign>>(c(id, '/pause'))),
  resume: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<WhatsAppCampaign>>(c(id, '/resume'))),
  stop: (id: string) => unwrap(apiClient.post<SuccessEnvelope<WhatsAppCampaign>>(c(id, '/stop'))),
  retryFailed: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<{ retried: number }>>(c(id, '/retry-failed'))),
  recipients: async (id: string, query: ListWaRecipientsQuery = {}) =>
    (
      await apiClient.get<ListEnvelope<WhatsAppCampaignRecipient, OffsetPageMeta>>(
        c(id, '/recipients'),
        { params: query },
      )
    ).data,
  report: (id: string) =>
    unwrap(apiClient.get<SuccessEnvelope<WhatsAppCampaignReport>>(c(id, '/report'))),
  /** CSV download (a blob — open through a download link, not JSON). */
  export: (id: string) =>
    apiClient
      .get<Blob>(c(id, '/export'), { responseType: 'blob' })
      .then((r) => URL.createObjectURL(r.data)),
};
