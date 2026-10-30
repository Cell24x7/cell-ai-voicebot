import { apiClient, unwrap } from './client';
import type {
  AudiencePreview,
  Campaign,
  CampaignContactRow,
  CampaignContactStatus,
  CampaignEstimate,
  CampaignListItem,
  CampaignStatus,
  CampaignSummary,
  ContactFilter,
  CursorPageMeta,
  ExportJob,
  ListEnvelope,
  SuccessEnvelope,
} from './types';

export type CampaignMode = 'dry_run' | 'live';
export type RetryOn = 'no_answer' | 'busy' | 'failed' | 'no_outcome';
export type DryRunOutcome = 'answered' | 'no_answer' | 'busy' | 'failed' | 'invalid_number';
export type ScenarioKey =
  | 'paid'
  | 'promise'
  | 'refuse'
  | 'callback'
  | 'silence'
  | 'wrong_number'
  | 'hangup_early'
  | 'wrong_keys';

/** Settings groups — every one optional (create fills defaults, update merges). */
export interface CampaignSettingsInput {
  audience?: {
    listIds?: string[];
    segmentId?: string | null;
    filter?: ContactFilter | null;
    contactIds?: string[];
    excludeActiveCampaigns?: boolean;
    skipIfMissing?: string[];
  };
  schedule?: {
    startAt?: string | null;
    endAt?: string | null;
    timezone?: string;
    recurrence?: {
      freq: 'daily' | 'weekly';
      days: number[];
      time: string;
      until: string | null;
    } | null;
  };
  window?: { start: string; end: string; days: number[] };
  retry?: { maxAttempts?: number; intervalMinutes?: number; retryOn?: RetryOn[] };
  followUps?: {
    callbacks?: boolean;
    callbackMaxDays?: number;
    promiseCheck?: { enabled?: boolean; daysAfter?: number };
  };
  pacing?: { concurrency?: number; dialsPerMinute?: number; priority?: 'high' | 'normal' | 'low' };
  autoResume?: boolean;
  /** `mix` in basis points (sum 10 000), `scenarios` in percent (sum 100). */
  dryRun?: {
    mix?: Record<DryRunOutcome, number>;
    scenarios?: Record<ScenarioKey, number>;
    speed?: number;
  } | null;
  chosenVersion?: number | null;
  versionPolicy?: 'pinned' | 'latest';
}

export interface CreateCampaignInput extends CampaignSettingsInput {
  name: string;
  mode?: CampaignMode;
  flowId: string;
}

export interface UpdateCampaignInput extends CampaignSettingsInput {
  revision: number;
  name?: string;
  mode?: CampaignMode;
  flowId?: string;
}

export interface ListCampaignsQuery {
  cursor?: string;
  limit?: number;
  status?: CampaignStatus[];
  mode?: CampaignMode;
  flowId?: string;
  parentId?: string;
  contactId?: string;
  q?: string;
}

export interface ListCampaignContactsQuery {
  cursor?: string;
  limit?: number;
  status?: CampaignContactStatus[];
  lastResult?: NonNullable<CampaignContactRow['lastResult']>;
  disposition?: string;
  skipReason?: string;
  q?: string;
}

export interface AudiencePreviewInput {
  flowId: string;
  chosenVersion?: number | null;
  audience: NonNullable<CampaignSettingsInput['audience']>;
}

/** `/api/v1/campaigns` (PHASE_8_PLAN §1r). */
export const campaignsApi = {
  /** Dashboard card: campaigns by live status + today's campaign calls. */
  summary: () => unwrap(apiClient.get<SuccessEnvelope<CampaignSummary>>('/campaigns/summary')),
  list: async (query: ListCampaignsQuery) =>
    (
      await apiClient.get<ListEnvelope<CampaignListItem, CursorPageMeta>>('/campaigns', {
        params: query,
        paramsSerializer: { indexes: null },
      })
    ).data,
  get: (id: string) => unwrap(apiClient.get<SuccessEnvelope<Campaign>>(`/campaigns/${id}`)),
  create: (body: CreateCampaignInput) =>
    unwrap(apiClient.post<SuccessEnvelope<Campaign>>('/campaigns', body)),
  update: (id: string, body: UpdateCampaignInput) =>
    unwrap(apiClient.patch<SuccessEnvelope<Campaign>>(`/campaigns/${id}`, body)),
  remove: async (id: string) => {
    await apiClient.delete(`/campaigns/${id}`);
  },
  duplicate: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<Campaign>>(`/campaigns/${id}/duplicate`)),
  previewAudience: (body: AudiencePreviewInput) =>
    unwrap(apiClient.post<SuccessEnvelope<AudiencePreview>>('/campaigns/audience/preview', body)),
  estimate: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<CampaignEstimate>>(`/campaigns/${id}/estimate`)),
  /** One Idempotency-Key per Start attempt (a retry of the same click reuses it). */
  start: (id: string, idempotencyKey: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<Campaign>>(`/campaigns/${id}/start`, undefined, {
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    ),
  unschedule: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<Campaign>>(`/campaigns/${id}/unschedule`)),
  pause: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<Campaign>>(`/campaigns/${id}/pause`)),
  resume: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<Campaign>>(`/campaigns/${id}/resume`)),
  cancel: (id: string, hangUpLive: boolean) =>
    unwrap(apiClient.post<SuccessEnvelope<Campaign>>(`/campaigns/${id}/cancel`, { hangUpLive })),
  contacts: async (id: string, query: ListCampaignContactsQuery) =>
    (
      await apiClient.get<ListEnvelope<CampaignContactRow, CursorPageMeta>>(
        `/campaigns/${id}/contacts`,
        { params: query, paramsSerializer: { indexes: null } },
      )
    ).data,
  runs: (id: string) =>
    unwrap(apiClient.get<SuccessEnvelope<CampaignListItem[]>>(`/campaigns/${id}/runs`)),
  /** Results export job; download through `GET /contact-exports/:id`. */
  exportResults: (id: string, format: 'csv' | 'xlsx') =>
    unwrap(apiClient.post<SuccessEnvelope<ExportJob>>(`/campaigns/${id}/export`, { format })),
};
