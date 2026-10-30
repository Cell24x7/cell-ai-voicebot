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

type Job = Pick<ExportJob, 'status' | 'progress'>;

/**
 * One export job, live: WS `export.progress` when connected, polling every 3 s otherwise.
 * `get` reads it (contact exports by default; Phase 14 record exports pass theirs).
 */
export function useExportJob(id: string | undefined): ReturnType<typeof useJob<ExportJob>>;
export function useExportJob<T extends Job>(
  id: string | undefined,
  get: (id: string) => Promise<T>,
): ReturnType<typeof useJob<T>>;
export function useExportJob(id: string | undefined, get?: (id: string) => Promise<Job>) {
  return useJob(id, get ?? contactExportsApi.get);
}

const useJob = <T extends Job>(id: string | undefined, get: (id: string) => Promise<T>) => {
  const queryClient = useQueryClient();
  const ws = useWsStatus();
  const query = useQuery({
    queryKey: exportKeys.detail(id ?? ''),
    queryFn: () => get(id ?? ''),
    enabled: Boolean(id),
    meta: { silent: true },
    refetchInterval: (q) =>
      RUNNING.includes(q.state.data?.status ?? '') && ws !== 'open' ? EXPORT_POLL_MS : false,
  });
  useWsEvent('export.progress', (event) => {
    if (!id || event.data.exportJobId !== id) return;
    const current = queryClient.getQueryData<T>(exportKeys.detail(id));
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
