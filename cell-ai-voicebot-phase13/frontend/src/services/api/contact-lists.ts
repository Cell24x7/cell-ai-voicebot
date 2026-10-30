import { apiClient, unwrap } from './client';
import type { ContactList, ListEnvelope, OffsetPageMeta, SuccessEnvelope } from './types';

/** `/api/v1/contact-lists`. */
export const contactListsApi = {
  list: async (query: { page?: number; limit?: number; q?: string }) =>
    (
      await apiClient.get<ListEnvelope<ContactList, OffsetPageMeta>>('/contact-lists', {
        params: query,
      })
    ).data,
  get: (id: string) => unwrap(apiClient.get<SuccessEnvelope<ContactList>>(`/contact-lists/${id}`)),
  create: (body: { name: string; description?: string | null }) =>
    unwrap(apiClient.post<SuccessEnvelope<ContactList>>('/contact-lists', body)),
  update: (id: string, body: { name?: string; description?: string | null }) =>
    unwrap(apiClient.patch<SuccessEnvelope<ContactList>>(`/contact-lists/${id}`, body)),
  remove: (id: string) => apiClient.delete(`/contact-lists/${id}`).then(() => undefined),
};
