import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  WhatsAppCampaign,
  WhatsAppCampaignEstimate,
  WhatsAppCampaignRecipientStatus,
} from '@/services/api/types';
import { waCampaignsApi } from '@/services/api/whatsapp-campaigns';
import type { ListWaCampaignsQuery } from '@/services/api/whatsapp-campaigns';
import { useWsEvent } from '@/services/realtime';

import { waCampaignKeys } from './keys';

/** Live counters update while a campaign may still change (WS + a short poll fallback). */
export const WA_CAMPAIGN_POLL_MS = 5_000;

/** Poll the detail while it is not a terminal state (live updates can be off — Phase 8 lesson). */
export const useWaCampaigns = (query: ListWaCampaignsQuery = {}, enabled = true) =>
  useQuery({
    queryKey: waCampaignKeys.list(query),
    queryFn: () => waCampaignsApi.list(query),
    enabled,
    refetchInterval: WA_CAMPAIGN_POLL_MS,
  });

export const useWaCampaign = (id: string) =>
  useQuery({
    queryKey: waCampaignKeys.detail(id),
    queryFn: () => waCampaignsApi.get(id),
    enabled: Boolean(id),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'running' ||
        s === 'scheduled' ||
        s === 'waiting_for_limit' ||
        s === 'paused' ||
        s === 'completed'
        ? WA_CAMPAIGN_POLL_MS
        : false;
    },
  });

export const useWaCampaignEstimate = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: waCampaignKeys.estimate(id),
    queryFn: () => waCampaignsApi.estimate(id),
    enabled: Boolean(id) && enabled,
  });

export const useWaCampaignReport = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: waCampaignKeys.report(id),
    queryFn: () => waCampaignsApi.report(id),
    enabled: Boolean(id) && enabled,
    refetchInterval: enabled ? WA_CAMPAIGN_POLL_MS : false,
  });

export const useWaCampaignRecipients = (
  id: string,
  query: { page?: number; limit?: number; status?: WhatsAppCampaignRecipientStatus } = {},
  live = false,
) =>
  useQuery({
    queryKey: waCampaignKeys.recipients(id, query),
    queryFn: () => waCampaignsApi.recipients(id, { page: 1, limit: 50, ...query }),
    enabled: Boolean(id),
    refetchInterval: live ? WA_CAMPAIGN_POLL_MS : false,
  });

const storeWaCampaign = (client: ReturnType<typeof useQueryClient>, c: WhatsAppCampaign): void => {
  client.setQueryData(waCampaignKeys.detail(c.id), c);
  void client.invalidateQueries({ queryKey: waCampaignKeys.recipientLists(c.id) });
  void client.invalidateQueries({ queryKey: waCampaignKeys.report(c.id) });
  void client.invalidateQueries({ queryKey: waCampaignKeys.lists });
};

export const useStartWaCampaign = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, key }: { id: string; key: string }) => waCampaignsApi.start(id, key),
    meta: { silent: true },
    onSuccess: (c) => storeWaCampaign(client, c),
  });
};
export const usePauseWaCampaign = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => waCampaignsApi.pause(id),
    meta: { silent: true },
    onSuccess: (c) => storeWaCampaign(client, c),
  });
};
export const useResumeWaCampaign = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => waCampaignsApi.resume(id),
    meta: { silent: true },
    onSuccess: (c) => storeWaCampaign(client, c),
  });
};
export const useStopWaCampaign = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => waCampaignsApi.stop(id),
    meta: { silent: true },
    onSuccess: (c) => storeWaCampaign(client, c),
  });
};
export const useRetryWaCampaignFailed = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => waCampaignsApi.retryFailed(id),
    meta: { silent: true },
    onSuccess: (_r, id) => {
      void client.invalidateQueries({ queryKey: waCampaignKeys.detail(id) });
      void client.invalidateQueries({ queryKey: waCampaignKeys.recipientLists(id) });
      void client.invalidateQueries({ queryKey: waCampaignKeys.report(id) });
    },
  });
};

/**
 * `whatsapp_campaign.progress` (account level, mounted on the campaign pages): the
 * counters of one campaign moved — patch that detail, refetch the lists. A 5 s poll is
 * the fallback when live updates are off (Phase 8 lesson).
 */
export const useWaCampaignLiveUpdates = (): void => {
  const client = useQueryClient();
  useWsEvent('whatsapp_campaign.progress', (event) => {
    const { campaignId } = event.data;
    // Fetch authoritative state: progress events omit pauseReason and nextBatchAt,
    // and late events must not overwrite newer counters or terminal statuses.
    void client.invalidateQueries({ queryKey: waCampaignKeys.detail(campaignId) });
    void client.invalidateQueries({ queryKey: waCampaignKeys.lists });
    void client.invalidateQueries({ queryKey: waCampaignKeys.recipientLists(campaignId) });
    void client.invalidateQueries({ queryKey: waCampaignKeys.report(campaignId) });
  });
};

export type { WhatsAppCampaignEstimate };
