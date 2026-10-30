import { apiClient, unwrap } from './client';
import type {
  ImportColumnMapping,
  ImportJob,
  ImportOptions,
  ListEnvelope,
  OffsetPageMeta,
  SuccessEnvelope,
} from './types';

export type ImportKind = 'contacts' | 'dnd';

/** `/api/v1/contact-imports` — upload → map → validate → start. */
export const contactImportsApi = {
  upload: (file: File, kind: ImportKind, onProgress?: (percent: number) => void) => {
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', file);
    return unwrap(
      apiClient.post<SuccessEnvelope<ImportJob>>('/contact-imports', form, {
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
        },
      }),
    );
  },
  list: async (query: { page?: number; limit?: number; kind?: ImportKind; status?: string }) =>
    (
      await apiClient.get<ListEnvelope<ImportJob, OffsetPageMeta>>('/contact-imports', {
        params: query,
      })
    ).data,
  get: (id: string) => unwrap(apiClient.get<SuccessEnvelope<ImportJob>>(`/contact-imports/${id}`)),
  setMapping: (
    id: string,
    body: { sheet?: string; columns: ImportColumnMapping[]; options?: ImportOptions },
  ) => unwrap(apiClient.put<SuccessEnvelope<ImportJob>>(`/contact-imports/${id}/mapping`, body)),
  validate: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<ImportJob>>(`/contact-imports/${id}/validate`)),
  start: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<ImportJob>>(`/contact-imports/${id}/start`)),
  cancel: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<ImportJob>>(`/contact-imports/${id}/cancel`)),
  errorReport: (id: string) =>
    unwrap(
      apiClient.get<SuccessEnvelope<{ url: string; expiresInSec: number }>>(
        `/contact-imports/${id}/error-report`,
      ),
    ),
  /** CSV template (blob) with the account's fields. */
  template: async () =>
    (await apiClient.get<Blob>('/contact-imports/template.csv', { responseType: 'blob' })).data,
};
