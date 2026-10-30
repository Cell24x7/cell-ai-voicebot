import { apiClient, unwrap } from './client';
import type { Invoice, ListEnvelope, OffsetPageMeta, SuccessEnvelope } from './types';

/** `/api/v1/invoices` — GST invoices of paid top-ups. */
export const invoicesApi = {
  list: async (query: { page?: number; limit?: number }) =>
    (await apiClient.get<ListEnvelope<Invoice, OffsetPageMeta>>('/invoices', { params: query }))
      .data,
  get: (id: string) => unwrap(apiClient.get<SuccessEnvelope<Invoice>>(`/invoices/${id}`)),
  /** A fresh signed link (15 min) — never cached. */
  download: (id: string) =>
    unwrap(
      apiClient.get<SuccessEnvelope<{ url: string; expiresInSec: number }>>(
        `/invoices/${id}/download`,
      ),
    ),
};
