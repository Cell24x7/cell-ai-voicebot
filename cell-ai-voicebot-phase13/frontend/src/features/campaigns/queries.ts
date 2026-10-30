import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  campaignsApi,
  type AudiencePreviewInput,
  type ListCampaignContactsQuery,
  type ListCampaignsQuery,
} from '@/services/api/campaigns';
import type { Campaign, CampaignStats } from '@/services/api/types';
import { useWsEvent, useWsTopic } from '@/services/realtime';

import { campaignKeys } from './keys';
import { ACTIVE_CAMPAIGN_STATUSES } from './labels';

/** Poll the detail while the campaign may still change (Phase 7 lesson: WS can miss). */
export const CAMPAIGN_POLL_MS = 5_000;
/** Debounce of the audience preview while the wizard is edited. */
export const PREVIEW_DEBOUNCE_MS = 400;

export { useCanExportCampaigns, useCanRunCampaigns, useCanWriteCampaigns } from './permissions';

/** Dashboard card; refreshed every 30 s (and by live campaign events through `campaignKeys.all`). */
export const useCampaignSummary = (enabled = true) =>
  useQuery({
    queryKey: campaignKeys.summary,
    queryFn: campaignsApi.summary,
    enabled,
    refetchInterval: 30_000,
  });

/** Cursor pages ("Load more"). */
export const useCampaigns = (query: Omit<ListCampaignsQuery, 'cursor'>, enabled = true) =>
  useInfiniteQuery({
    queryKey: campaignKeys.list(query),
    enabled,
    queryFn: ({ pageParam }) =>
      campaignsApi.list({ ...query, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '',
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
  });

/** One campaign; polled every 5 s while scheduled / running / paused. */
export const useCampaign = (id: string) =>
  useQuery({
    queryKey: campaignKeys.detail(id),
    queryFn: () => campaignsApi.get(id),
    enabled: Boolean(id),
    refetchInterval: (query) =>
      query.state.data && ACTIVE_CAMPAIGN_STATUSES.includes(query.state.data.status)
        ? CAMPAIGN_POLL_MS
        : false,
  });

/** Results refresh while the campaign may still change (live updates can be off). */
export const RESULTS_POLL_MS = 10_000;

export const useCampaignContacts = (
  id: string,
  query: Omit<ListCampaignContactsQuery, 'cursor'>,
  live = false,
) =>
  useInfiniteQuery({
    queryKey: campaignKeys.contactsList(id, query),
    queryFn: ({ pageParam }) =>
      campaignsApi.contacts(id, { ...query, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '',
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
    enabled: Boolean(id),
    refetchInterval: live ? RESULTS_POLL_MS : false,
  });

export const useCampaignRuns = (id: string, enabled = true) =>
  useQuery({
    queryKey: campaignKeys.runs(id),
    queryFn: () => campaignsApi.runs(id),
    enabled: Boolean(id) && enabled,
  });

export const useCampaignEstimate = (id: string, enabled = true) =>
  useQuery({
    queryKey: campaignKeys.estimate(id),
    queryFn: () => campaignsApi.estimate(id),
    enabled: Boolean(id) && enabled,
  });

/** Audience counts while the wizard is edited (debounced; `null` = nothing to preview). */
export const useAudiencePreview = (body: AudiencePreviewInput | null) => {
  const key = JSON.stringify(body);
  const debounced = useDebouncedValue(key, PREVIEW_DEBOUNCE_MS);
  const input = debounced === 'null' ? null : (JSON.parse(debounced) as AudiencePreviewInput);
  return useQuery({
    queryKey: campaignKeys.preview(input),
    queryFn: () => campaignsApi.previewAudience(input as AudiencePreviewInput),
    enabled: input !== null,
    staleTime: 10_000,
  });
};

/**
 * Keeps campaign lists / details fresh from `/ws/events` (mounted on the campaign
 * pages): `campaign.status` refreshes lists + that detail; `campaign.progress`
 * (topic `campaign:<id>`, subscribed with `campaignId`) puts the counters into the
 * detail; a campaign call that ended refreshes that campaign's results table.
 */
export const useCampaignLiveUpdates = (campaignId?: string): void => {
  const queryClient = useQueryClient();
  useWsTopic(campaignId ? `campaign:${campaignId}` : null);
  useWsEvent('campaign.status', (event) => {
    void queryClient.invalidateQueries({ queryKey: campaignKeys.lists });
    void queryClient.invalidateQueries({ queryKey: campaignKeys.detail(event.data.campaignId) });
  });
  useWsEvent('campaign.progress', (event) => {
    const key = campaignKeys.detail(event.data.campaignId);
    const current = queryClient.getQueryData<Campaign>(key);
    if (current) {
      queryClient.setQueryData<Campaign>(key, {
        ...current,
        stats: { ...current.stats, ...(event.data.stats as Partial<CampaignStats>) },
      });
    }
  });
  useWsEvent('call.ended', (event) => {
    if (!event.data.campaignId) return;
    void queryClient.invalidateQueries({
      queryKey: campaignKeys.contacts(event.data.campaignId),
    });
  });
};
