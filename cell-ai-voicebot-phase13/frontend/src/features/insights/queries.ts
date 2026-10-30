import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';

import { usePermission } from '@/features/auth/hooks';
import { callKeys } from '@/features/calls/keys';
import { dispositionLabel } from '@/features/calls/labels';
import { useImpersonating } from '@/features/wallet/queries';
import { getErrorMessage } from '@/services/api/errors';
import { insightsApi } from '@/services/api/insights';
import type { AccountDisposition, CallInsights } from '@/services/api/types';
import { useWsEvent, useWsTopic } from '@/services/realtime';

import { insightKeys } from './keys';

export const useCallInsights = (callId: string) =>
  useQuery({
    queryKey: insightKeys.call(callId),
    queryFn: () => insightsApi.get(callId),
    enabled: Boolean(callId),
    // the card shows its own error
    meta: { silent: true },
  });

/**
 * `call.insights` refreshes the card. `subscribe`: join the call's topic (the call page
 * already joins it while the call is live).
 */
export const useCallInsightsLive = (callId: string, subscribe = true): void => {
  const queryClient = useQueryClient();
  useWsTopic(callId && subscribe ? `call:${callId}` : null);
  useWsEvent('call.insights', (event) => {
    if (event.data.callId !== callId) return;
    void queryClient.invalidateQueries({ queryKey: insightKeys.call(callId) });
    void queryClient.invalidateQueries({ queryKey: callKeys.detail(callId) });
  });
};

export const useRegenerateInsights = (callId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => insightsApi.regenerate(callId),
    meta: { silent: true },
    onSuccess: (view) => {
      queryClient.setQueryData<CallInsights>(insightKeys.call(callId), view);
      enqueueSnackbar('Making new insights — they appear here in a moment', { variant: 'info' });
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
};

export const useSetDisposition = (callId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => insightsApi.setDisposition(callId, key),
    meta: { silent: true },
    onSuccess: (view) => {
      queryClient.setQueryData<CallInsights>(insightKeys.call(callId), view);
      void queryClient.invalidateQueries({ queryKey: callKeys.detail(callId) });
      void queryClient.invalidateQueries({ queryKey: callKeys.lists });
      enqueueSnackbar('Outcome saved', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
};

export const useDispositions = (enabled = true) =>
  useQuery({
    queryKey: insightKeys.dispositions,
    queryFn: insightsApi.dispositions,
    enabled,
    staleTime: 60_000,
    meta: { silent: true },
    select: (d) => d.dispositions,
  });

/** Account outcome label for a key (falls back to the built-in labels, then the key). */
export const outcomeLabel = (
  key: string | null | undefined,
  list: AccountDisposition[] | undefined,
): string | null =>
  key ? (list?.find((d) => d.key === key)?.label ?? dispositionLabel(key)) : null;

export const useInsightsSettings = () =>
  useQuery({ queryKey: insightKeys.settings, queryFn: insightsApi.settings });

/** Regenerate (calls.listen) / set the outcome (calls.trigger), never while impersonating. */
export const useInsightPermissions = () => {
  const listen = usePermission('calls.listen');
  const trigger = usePermission('calls.trigger');
  const impersonating = useImpersonating();
  return { canRegenerate: listen && !impersonating, canSetOutcome: trigger && !impersonating };
};
