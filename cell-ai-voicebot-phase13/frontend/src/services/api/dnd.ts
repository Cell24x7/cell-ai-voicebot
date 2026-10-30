import { apiClient } from './client';
import type { DndEntry, ListEnvelope, OffsetPageMeta, SuccessEnvelope } from './types';

/** `/api/v1/dnd-entries` — the account's do-not-call list. */
export const dndApi = {
  list: async (query: { page?: number; limit?: number; q?: string }) =>
    (
      await apiClient.get<ListEnvelope<DndEntry, OffsetPageMeta>>('/dnd-entries', {
        params: query,
      })
    ).data,
  /** `created: false` when the number was already listed. */
  add: async (body: { phone: string; reason?: string | null }) => {
    const res = await apiClient.post<SuccessEnvelope<DndEntry>>('/dnd-entries', body);
    return { entry: res.data.data, created: res.status === 201 };
  },
  remove: (id: string) => apiClient.delete(`/dnd-entries/${id}`).then(() => undefined),
};
