import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { inboxKeys } from '@/features/inbox/keys';
import { useTemplates } from '@/features/templates/queries';
import { whatsappKeys } from '@/features/whatsapp/keys';
import type {
  CallAvailabilityStatus,
  WhatsAppCallingSettings,
  WhatsAppCallingSettingsPatch,
  WhatsAppCallPermission,
} from '@/services/api/types';
import {
  whatsappCallingApi,
  type RequestCallPermissionInput,
} from '@/services/api/whatsapp-calling';
import { useWsEvent } from '@/services/realtime';

import { callingKeys } from './keys';

export {
  useCanAnswer,
  useCanCall,
  useCanManageCalling,
  useCanRequestPermission,
  useCanRequestPermissionBulk,
} from './permissions';

/** Phase 18B: a bulk permission run, polled until it is done or stopped. */
export const PERMISSION_RUN_POLL_MS = 2_000;
export const usePermissionRun = (runId: string | null) =>
  useQuery({
    queryKey: callingKeys.permissionRun(runId ?? ''),
    queryFn: () => whatsappCallingApi.permissionRun(runId ?? ''),
    enabled: Boolean(runId),
    refetchInterval: (q) =>
      q.state.data && (q.state.data.status === 'done' || q.state.data.status === 'stopped')
        ? false
        : PERMISSION_RUN_POLL_MS,
  });

/** Poll while a permission request waits for the customer (live updates can be off). */
export const PERMISSION_POLL_MS = 5_000;

export const useCallingSettings = (channelId: string | null) =>
  useQuery({
    queryKey: callingKeys.settings(channelId ?? ''),
    queryFn: () => whatsappCallingApi.getSettings(channelId ?? ''),
    enabled: Boolean(channelId),
  });

const storeSettings = (
  client: ReturnType<typeof useQueryClient>,
  settings: WhatsAppCallingSettings,
): void => {
  client.setQueryData(callingKeys.settings(settings.channelId), settings);
  // the numbers list shows the calling summary
  void client.invalidateQueries({ queryKey: whatsappKeys.channels });
  void client.invalidateQueries({ queryKey: whatsappKeys.channel(settings.channelId) });
};

/** Phase 18B readiness checklist (Meta checks are cached 1 h on the server). */
export const useCallingReadiness = (channelId: string) =>
  useQuery({
    queryKey: callingKeys.readiness(channelId),
    queryFn: () => whatsappCallingApi.readiness(channelId),
  });

export const useUpdateCallingSettings = (channelId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: WhatsAppCallingSettingsPatch) =>
      whatsappCallingApi.updateSettings(channelId, patch),
    onSuccess: (settings) => {
      storeSettings(client, settings);
      void client.invalidateQueries({ queryKey: callingKeys.readiness(channelId) });
    },
    // a refused or not-applied change: show WhatsApp's real state again (Phase 18B)
    onError: () => void client.invalidateQueries({ queryKey: callingKeys.settings(channelId) }),
  });
};

export const useSyncCallingSettings = (channelId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => whatsappCallingApi.syncSettings(channelId),
    onSuccess: (settings) => storeSettings(client, settings),
  });
};

/** A customer's call permission on a number (with history); polls while requested. */
export const useCallPermission = (channelId: string | null, contactId: string | null) =>
  useQuery({
    queryKey: callingKeys.permission(channelId ?? '', contactId ?? ''),
    queryFn: () => whatsappCallingApi.permission(channelId ?? '', contactId ?? ''),
    enabled: Boolean(channelId && contactId),
    refetchInterval: (q) => (q.state.data?.status === 'requested' ? PERMISSION_POLL_MS : false),
  });

export const useRequestCallPermission = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RequestCallPermissionInput) => whatsappCallingApi.requestPermission(input),
    onSuccess: (_result, input) => {
      client.setQueryData<WhatsAppCallPermission>(
        callingKeys.permission(input.channelId, input.contactId),
        (p) => (p ? { ...p, status: 'requested', canRequest: false } : p),
      );
      void client.invalidateQueries({
        queryKey: callingKeys.permission(input.channelId, input.contactId),
      });
      void client.invalidateQueries({ queryKey: inboxKeys.contacts });
    },
  });
};

export const useSetCallAvailability = () =>
  useMutation({
    mutationFn: (status: CallAvailabilityStatus) => whatsappCallingApi.setAvailability(status),
  });

/**
 * Live updates (mount once in the app shell): permission changes refresh the contact's
 * permission + panel; number changes refresh the call settings.
 */
export const useCallingLiveUpdates = (): void => {
  const client = useQueryClient();
  useWsEvent('whatsapp.call_permission.updated', (event) => {
    const { channelId, contactId } = event.data;
    void client.invalidateQueries({ queryKey: callingKeys.permission(channelId, contactId) });
    // Panels are keyed by conversation id; this event carries only the contact id.
    void client.invalidateQueries({ queryKey: inboxKeys.contacts });
  });
  useWsEvent('whatsapp.channel.updated', (event) => {
    void client.invalidateQueries({ queryKey: callingKeys.settings(event.data.channelId) });
  });
};

/** Phase 18B: A number's call permission templates (not deleted). */
export const usePermissionTemplates = (channelId: string) => {
  const q = useTemplates({ channelId, purpose: 'call_permission' }, Boolean(channelId));
  const rows = (q.data ?? []).filter((t) => t.status !== 'DELETED');
  return { ...q, rows, approved: rows.filter((t) => t.status === 'APPROVED') };
};

/** Recomputed for every selected sender/contact; displayed prices are account selling prices. */
export const useCallPrice = (channelId: string, contactId: string) =>
  useQuery({
    queryKey: callingKeys.price(channelId, contactId),
    queryFn: () => whatsappCallingApi.quote(channelId, contactId),
    enabled: Boolean(channelId && contactId),
    staleTime: 0,
  });
