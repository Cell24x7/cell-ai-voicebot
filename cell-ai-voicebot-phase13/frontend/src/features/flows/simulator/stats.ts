import { useMemo } from 'react';

import { useAuthStore } from '@/features/auth/store';
import type { FlowNodeStat } from '@/services/api/types';
import { shiftYmd, todayInTz } from '@/utils/datetime';

import { useFlowStats } from '../queries';

export interface StatsSelection {
  on: boolean;
  version: 'draft' | number;
  days: 7 | 30;
}

/** Stats overlay toggle + version / range pickers; returns the per-step map. */
export function useStatsOverlay(flowId: string, sel: StatsSelection) {
  const timezone = useAuthStore((s) => s.session?.account.timezone ?? 'Asia/Kolkata');
  const to = todayInTz(timezone);
  const stats = useFlowStats(
    flowId,
    { version: sel.version, mode: 'simulator', from: shiftYmd(to, -(sel.days - 1)), to },
    sel.on,
  );
  const map = useMemo(
    () =>
      sel.on && stats.data
        ? new Map<string, FlowNodeStat>(stats.data.map((s) => [s.nodeId, s]))
        : undefined,
    [sel.on, stats.data],
  );
  return { map, isError: stats.isError, isFetching: stats.isFetching };
}
