import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type {
  WhatsAppChannel,
  WhatsAppChannelDetail,
  WhatsAppChannelList,
} from '@/services/api/types';
import { whatsappApi, type EmbeddedSignupInput, type SimulatorKind } from '@/services/api/whatsapp';
import { useWsEvent } from '@/services/realtime';

import { whatsappKeys } from './keys';
import { SETTLING_STATUSES } from './labels';

export { useCanManageWhatsApp } from './permissions';

/** Poll while a number is settling (live updates can be off — Phase 8 lesson). */
export const WHATSAPP_POLL_MS = 5_000;

const settling = (channels: { status: WhatsAppChannel['status'] }[]) =>
  channels.some((c) => SETTLING_STATUSES.includes(c.status));

/** Signup config (public values only); 503 `WHATSAPP_NOT_CONFIGURED` when the server has WhatsApp off. */
export const useWhatsAppConfig = (enabled = true) =>
  useQuery({
    queryKey: whatsappKeys.config,
    queryFn: whatsappApi.config,
    enabled,
    staleTime: Infinity,
    // the page explains "not set up" (503) itself
    meta: { silent: true },
  });

export const useChannels = (enabled = true) =>
  useQuery({
    queryKey: whatsappKeys.channels,
    queryFn: () => whatsappApi.channels(),
    enabled,
    refetchInterval: (query) =>
      query.state.data && settling(query.state.data.items) ? WHATSAPP_POLL_MS : false,
  });

export const useChannel = (id: string | null) =>
  useQuery({
    queryKey: whatsappKeys.channel(id ?? ''),
    queryFn: () => whatsappApi.channel(id ?? ''),
    enabled: Boolean(id),
    refetchInterval: (query) =>
      query.state.data && settling([query.state.data]) ? WHATSAPP_POLL_MS : false,
  });

/** Puts a channel returned by an action into the list and its detail. */
export const storeChannel = (client: QueryClient, channel: WhatsAppChannel): void => {
  client.setQueryData<WhatsAppChannelList>(whatsappKeys.channels, (list) => {
    if (!list) return list;
    const exists = list.items.some((c) => c.id === channel.id);
    const items = exists
      ? list.items.map((c) => (c.id === channel.id ? channel : c))
      : [channel, ...list.items];
    const counts: Record<string, number> = {};
    for (const c of items) counts[c.status] = (counts[c.status] ?? 0) + 1;
    return { ...list, items, counts };
  });
  client.setQueryData<WhatsAppChannelDetail>(whatsappKeys.channel(channel.id), (detail) =>
    detail ? { ...detail, ...channel } : detail,
  );
  void client.invalidateQueries({ queryKey: whatsappKeys.channel(channel.id) });
};

/**
 * `whatsapp.channel.updated` (mounted on the WhatsApp page): patch status / quality /
 * tier / name status at once, then refetch the full rows.
 */
export const useWhatsAppLiveUpdates = (): void => {
  const client = useQueryClient();
  useWsEvent('whatsapp.channel.updated', (event) => {
    const { channelId, ...patch } = event.data;
    client.setQueryData<WhatsAppChannelList>(whatsappKeys.channels, (list) =>
      list
        ? {
            ...list,
            items: list.items.map((c) =>
              c.id === channelId ? ({ ...c, ...patch } as WhatsAppChannel) : c,
            ),
          }
        : list,
    );
    client.setQueryData<WhatsAppChannelDetail>(whatsappKeys.channel(channelId), (detail) =>
      detail ? ({ ...detail, ...patch } as WhatsAppChannelDetail) : detail,
    );
    void client.invalidateQueries({ queryKey: whatsappKeys.channels });
    void client.invalidateQueries({ queryKey: whatsappKeys.channel(channelId) });
  });
};

const useChannelMutation = <TArgs, TResult extends { channel: WhatsAppChannel } | WhatsAppChannel>(
  fn: (args: TArgs) => Promise<TResult>,
  silent = false,
) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    meta: { silent },
    onSuccess: (result) => {
      storeChannel(client, 'channel' in result ? result.channel : result);
    },
  });
};

/** Silent: the connect wizard shows every error (Meta's too) itself. */
export const useConnectWhatsApp = () =>
  useChannelMutation((body: EmbeddedSignupInput) => whatsappApi.signup(body), true);
export const useRenameChannel = () =>
  useChannelMutation(({ id, label }: { id: string; label: string }) =>
    whatsappApi.rename(id, label),
  );
export const useSyncChannel = () => useChannelMutation((id: string) => whatsappApi.sync(id));
export const useRetrySetup = () => useChannelMutation((id: string) => whatsappApi.retrySetup(id));
export const useRegisterPin = () =>
  useChannelMutation(({ id, pin }: { id: string; pin: string }) => whatsappApi.register(id, pin));
export const useCoexistenceSync = () =>
  useChannelMutation((id: string) => whatsappApi.coexistenceSync(id));
export const useDisconnectChannel = () =>
  useChannelMutation((id: string) => whatsappApi.disconnect(id));

/** DEV ONLY — simulated Meta event; the effect arrives through the worker + WS / polling. */
export const useSimulateEvent = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: SimulatorKind }) =>
      whatsappApi.simulate(id, kind),
    onSuccess: (_result, { id }) => {
      // the worker needs a moment; refetch soon after
      setTimeout(() => {
        void client.invalidateQueries({ queryKey: whatsappKeys.channels });
        void client.invalidateQueries({ queryKey: whatsappKeys.channel(id) });
      }, 1_500);
    },
  });
};
