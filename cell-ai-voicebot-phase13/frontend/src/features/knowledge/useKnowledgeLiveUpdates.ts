import { useQueryClient } from '@tanstack/react-query';

import { knowledgeKeys } from '@/features/agents/keys';
import type { KnowledgeSource } from '@/services/api/types';
import { useWsEvent } from '@/services/realtime';

/**
 * Keeps knowledge sources live: `kb.source.updated` patches the cached source
 * (status, progress, error) without a refetch; a finished source marks the
 * base (counts) and the list stale.
 */
export const useKnowledgeLiveUpdates = (): void => {
  const queryClient = useQueryClient();
  useWsEvent('kb.source.updated', (event) => {
    const { kbId, sourceId, status, progress, error } = event.data;
    const sources = queryClient.getQueryData<KnowledgeSource[]>(knowledgeKeys.sources(kbId));
    if (sources?.some((s) => s.id === sourceId)) {
      queryClient.setQueryData<KnowledgeSource[]>(
        knowledgeKeys.sources(kbId),
        sources.map((s) =>
          s.id === sourceId ? { ...s, status, progress, error: error ?? null } : s,
        ),
      );
    } else {
      void queryClient.invalidateQueries({ queryKey: knowledgeKeys.sources(kbId) });
    }
    if (status === 'ready' || status === 'failed') {
      // chunk counts and sizes changed — fetch them in the background
      void queryClient.invalidateQueries({
        queryKey: knowledgeKeys.sources(kbId),
        refetchType: 'none',
      });
      void queryClient.invalidateQueries({ queryKey: knowledgeKeys.detail(kbId) });
      void queryClient.invalidateQueries({ queryKey: knowledgeKeys.list });
    }
  });
};
