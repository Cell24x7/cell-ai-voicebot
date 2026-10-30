import { apiClient, unwrap } from './client';
import type {
  ContactFilter,
  ExportJob,
  ListEnvelope,
  OffsetPageMeta,
  SuccessEnvelope,
} from './types';

export interface ExportRequest {
  scope: 'ids' | 'filter' | 'list' | 'segment';
  ids?: string[];
  filter?: ContactFilter;
  listId?: string;
  segmentId?: string;
  columns?: string[];
}

export const BASE_EXPORT_COLUMNS = [
  'name',
  'phone',
  'email',
  'external_id',
  'tags',
  'lists',
  'dnd',
  'opted_out',
  'consent_source',
  'consent_at',
  'created_at',
] as const;

/** `/api/v1/contact-exports`. */
export const contactExportsApi = {
  create: (body: ExportRequest) =>
    unwrap(apiClient.post<SuccessEnvelope<ExportJob>>('/contact-exports', body)),
  list: async (query: { page?: number; limit?: number }) =>
    (
      await apiClient.get<ListEnvelope<ExportJob, OffsetPageMeta>>('/contact-exports', {
        params: query,
      })
    ).data,
  get: (id: string) => unwrap(apiClient.get<SuccessEnvelope<ExportJob>>(`/contact-exports/${id}`)),
};
