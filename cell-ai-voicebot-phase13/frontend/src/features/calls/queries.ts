import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import { usePermission } from '@/features/auth/hooks';
import { useImpersonating } from '@/features/wallet/queries';
import { callsApi, type ListCallsQuery } from '@/services/api/calls';
import type { Call } from '@/services/api/types';
import { useWsEvent } from '@/services/realtime';

import { callKeys } from './keys';

/** Live statuses (the call may still change). */
export const LIVE_STATUSES: readonly Call['status'][] = ['queued', 'ringing', 'in_progress'];

/** calls.trigger and not impersonating (start / hang up test calls). */
export const useCanTriggerCalls = (): boolean => {
  const can = usePermission('calls.trigger');
  const impersonating = useImpersonating();
  return can && !impersonating;
};

/** calls.listen and not impersonating (play recordings). */
export const useCanListenCalls = (): boolean => {
  const can = usePermission('calls.listen');
  const impersonating = useImpersonating();
  return can && !impersonating;
};

/** Cursor pages ("Load more"). */
export const useCalls = (query: Omit<ListCallsQuery, 'cursor'>) =>
  useInfiniteQuery({
    queryKey: callKeys.list(query),
    queryFn: ({ pageParam }) =>
      callsApi.list({ ...query, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '',
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
  });

export const useActiveCalls = (enabled = true) =>
  useQuery({ queryKey: callKeys.active, queryFn: callsApi.active, enabled });

/** Polling interval while a call that should be over is still saved as live. */
export const CALL_SETTLE_POLL_MS = 2_000;

/**
 * One call. `untilSettled`: refetch while the saved call is still live (the
 * tester hears "ended" on its media socket before the backend saved the call).
 */
export const useCall = (id: string, { untilSettled = false }: { untilSettled?: boolean } = {}) =>
  useQuery({
    queryKey: callKeys.detail(id),
    queryFn: () => callsApi.get(id),
    enabled: Boolean(id),
    refetchInterval: (query) =>
      untilSettled && query.state.data && LIVE_STATUSES.includes(query.state.data.status)
        ? CALL_SETTLE_POLL_MS
        : false,
  });

export const useCallTranscript = (id: string) =>
  useQuery({
    queryKey: callKeys.transcript(id),
    queryFn: () => callsApi.transcript(id),
    enabled: Boolean(id),
  });

export const useCallEvents = (id: string) =>
  useQuery({
    queryKey: callKeys.events(id),
    queryFn: () => callsApi.events(id),
    enabled: Boolean(id),
  });

/**
 * Keeps call lists / details fresh from `/ws/events` (mounted on the calls pages):
 * a new call or a status change refreshes lists + active calls; the end of a call
 * also refreshes its detail, transcript and timeline.
 */
export const useCallLiveUpdates = (): void => {
  const queryClient = useQueryClient();
  const refreshLists = () => {
    void queryClient.invalidateQueries({ queryKey: callKeys.lists });
    void queryClient.invalidateQueries({ queryKey: callKeys.active });
  };
  useWsEvent('call.created', refreshLists);
  useWsEvent('call.status', (event) => {
    refreshLists();
    const current = queryClient.getQueryData<Call>(callKeys.detail(event.data.callId));
    if (current) {
      queryClient.setQueryData<Call>(callKeys.detail(event.data.callId), {
        ...current,
        status: event.data.status,
      });
    }
  });
  useWsEvent('call.ended', (event) => {
    refreshLists();
    const id = event.data.callId;
    void queryClient.invalidateQueries({ queryKey: callKeys.detail(id) });
    void queryClient.invalidateQueries({ queryKey: callKeys.transcript(id) });
    void queryClient.invalidateQueries({ queryKey: callKeys.events(id) });
  });
};
