import { apiClient, unwrap } from './client';
import type {
  KnowledgeBase,
  KnowledgeSearchResult,
  KnowledgeSource,
  SuccessEnvelope,
} from './types';

/** `/api/v1/knowledge-bases` — knowledge bases, sources and test search. */
export const knowledgeApi = {
  list: () => unwrap(apiClient.get<SuccessEnvelope<KnowledgeBase[]>>('/knowledge-bases')),
  get: (id: string) =>
    unwrap(apiClient.get<SuccessEnvelope<KnowledgeBase>>(`/knowledge-bases/${id}`)),
  create: (body: { name: string; description?: string | null }) =>
    unwrap(apiClient.post<SuccessEnvelope<KnowledgeBase>>('/knowledge-bases', body)),
  update: (id: string, body: { name?: string; description?: string | null }) =>
    unwrap(apiClient.patch<SuccessEnvelope<KnowledgeBase>>(`/knowledge-bases/${id}`, body)),
  /** 409 while agents use it unless `force` (then they are unlinked). */
  remove: async (id: string, force = false) => {
    await apiClient.delete(`/knowledge-bases/${id}`, { params: force ? { force: 'true' } : {} });
  },
  sources: (id: string) =>
    unwrap(apiClient.get<SuccessEnvelope<KnowledgeSource[]>>(`/knowledge-bases/${id}/sources`)),
  upload: (id: string, files: File[], onProgress?: (percent: number) => void) => {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    return unwrap(
      apiClient.post<SuccessEnvelope<KnowledgeSource[]>>(
        `/knowledge-bases/${id}/sources/files`,
        form,
        {
          onUploadProgress: (e) => {
            if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
          },
        },
      ),
    );
  },
  addUrl: (id: string, body: { url: string; title?: string }) =>
    unwrap(
      apiClient.post<SuccessEnvelope<KnowledgeSource>>(`/knowledge-bases/${id}/sources/url`, body),
    ),
  removeSource: async (id: string, sid: string) => {
    await apiClient.delete(`/knowledge-bases/${id}/sources/${sid}`);
  },
  reindexSource: (id: string, sid: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<KnowledgeSource>>(
        `/knowledge-bases/${id}/sources/${sid}/reindex`,
      ),
    ),
  reindex: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<KnowledgeSource[]>>(`/knowledge-bases/${id}/reindex`)),
  search: (id: string, body: { query: string; topK?: number; minScoreHundredths?: number }) =>
    unwrap(
      apiClient.post<SuccessEnvelope<KnowledgeSearchResult[]>>(
        `/knowledge-bases/${id}/search`,
        body,
      ),
    ),
};
