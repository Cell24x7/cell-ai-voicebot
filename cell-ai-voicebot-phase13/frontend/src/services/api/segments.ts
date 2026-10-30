import { apiClient, unwrap } from './client';
import type { ContactFilter, Segment, SegmentPreview, SuccessEnvelope } from './types';

/** `/api/v1/segments` — saved contact filters. */
export const segmentsApi = {
  list: (withCounts = false) =>
    unwrap(
      apiClient.get<SuccessEnvelope<Segment[]>>('/segments', {
        params: withCounts ? { withCounts: 'true' } : {},
      }),
    ),
  get: (id: string) => unwrap(apiClient.get<SuccessEnvelope<Segment>>(`/segments/${id}`)),
  create: (body: { name: string; filter: ContactFilter }) =>
    unwrap(apiClient.post<SuccessEnvelope<Segment>>('/segments', body)),
  update: (id: string, body: { name?: string; filter?: ContactFilter }) =>
    unwrap(apiClient.patch<SuccessEnvelope<Segment>>(`/segments/${id}`, body)),
  remove: (id: string) => apiClient.delete(`/segments/${id}`).then(() => undefined),
  preview: (filter: ContactFilter) =>
    unwrap(apiClient.post<SuccessEnvelope<SegmentPreview>>('/segments/preview', { filter })),
};
