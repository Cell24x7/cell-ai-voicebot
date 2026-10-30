import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { LIVE_STATUSES } from '@/features/calls/queries';
import { callsApi } from '@/services/api/calls';

import { callingKeys } from '../keys';

import { onCallEnded, onCallStatus } from './controller';
import { isLive, useLiveCallStore } from './store';

/** Recover missed account events, including an end while the event socket was offline. */
export const LIVE_CALL_POLL_MS = 2_000;

export const useLiveCallStatus = (): void => {
  const active = useLiveCallStore((s) => s.active);
  const id = active?.callId ?? '';
  const { data } = useQuery({
    queryKey: callingKeys.live(id),
    queryFn: () => callsApi.get(id),
    enabled: Boolean(id) && isLive(active),
    refetchInterval: LIVE_CALL_POLL_MS,
    retry: false,
    staleTime: 0,
    meta: { silent: true },
  });
  useEffect(() => {
    if (!data || data.id !== id) return;
    if (LIVE_STATUSES.includes(data.status)) onCallStatus(id, data.status);
    else onCallEnded(id, { endReason: data.endReason, durationSec: data.durationSec });
  }, [data, id]);
};
