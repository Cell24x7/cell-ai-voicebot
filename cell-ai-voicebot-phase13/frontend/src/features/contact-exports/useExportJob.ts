import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useCan, useSession } from '@/features/auth/hooks';
import { exportKeys } from '@/features/contacts/keys';
import { contactExportsApi } from '@/services/api/contact-exports';
import type { ExportJob } from '@/services/api/types';
import { useWsEvent, useWsStatus } from '@/services/realtime';

const RUNNING = ['pending', 'processing'];
export const EXPORT_POLL_MS = 3000;

/** Exports need `contacts.export` and are blocked while impersonating (server rule too). */
export const useCanExport = (): boolean => {
  const can = useCan();
  const session = useSession();
  return can('contacts.export') && !session?.impersonation;
};

/** One export job, live: WS `export.progress` when connected, polling every 3 s otherwise. */
export const useExportJob = (id: string | undefined) => {
  const queryClient = useQueryClient();
  const ws = useWsStatus();
  const query = useQuery({
    queryKey: exportKeys.detail(id ?? ''),
    queryFn: () => contactExportsApi.get(id ?? ''),
    enabled: Boolean(id),
    meta: { silent: true },
    refetchInterval: (q) =>
      RUNNING.includes(q.state.data?.status ?? '') && ws !== 'open' ? EXPORT_POLL_MS : false,
  });
  useWsEvent('export.progress', (event) => {
    if (!id || event.data.exportJobId !== id) return;
    const current = queryClient.getQueryData<ExportJob>(exportKeys.detail(id));
    if (current && current.status === event.data.status) {
      queryClient.setQueryData(exportKeys.detail(id), {
        ...current,
        progress: { processed: event.data.processed, total: event.data.total },
      });
      return;
    }
    void queryClient.invalidateQueries({ queryKey: exportKeys.all });
  });
  return query;
};
