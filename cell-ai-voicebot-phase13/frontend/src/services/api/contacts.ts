import { apiClient, unwrap } from './client';
import type {
  Contact,
  ContactFilter,
  ListEnvelope,
  OffsetPageMeta,
  SuccessEnvelope,
} from './types';

export interface ContactsQuery {
  page?: number;
  limit?: number;
  sort?: string;
  q?: string;
  listId?: string;
  tag?: string;
  tagsAll?: string;
  dnd?: 'true' | 'false';
  optedOut?: 'true' | 'false';
  segmentId?: string;
  createdFrom?: string;
  createdTo?: string;
}

/** Input values: currency in rupees, dates `YYYY-MM-DD`; `null` clears (update). */
export type VariablesInput = Record<string, string | number | null>;

export interface ContactInput {
  phone?: string;
  name?: string | null;
  email?: string | null;
  externalId?: string | null;
  variables?: VariablesInput;
  tags?: string[];
  listIds?: string[];
  consent?: { source: string; at: string } | null;
}

export type BulkAction =
  'add_tags' | 'remove_tags' | 'add_to_list' | 'remove_from_list' | 'delete' | 'add_to_dnd';

export interface BulkRequest {
  action: BulkAction;
  ids?: string[];
  filter?: ContactFilter;
  payload?: { tags?: string[]; listId?: string; reason?: string };
}

export type ContactPage = ListEnvelope<Contact, OffsetPageMeta>;

/** `/api/v1/contacts`, `/contact-tags`, opt-out. */
export const contactsApi = {
  list: async (query: ContactsQuery) =>
    (await apiClient.get<ContactPage>('/contacts', { params: query })).data,
  search: async (body: { filter: ContactFilter; page?: number; limit?: number; sort?: string }) =>
    (await apiClient.post<ContactPage>('/contacts/search', body)).data,
  get: (id: string) => unwrap(apiClient.get<SuccessEnvelope<Contact>>(`/contacts/${id}`)),
  create: (body: ContactInput & { phone: string }) =>
    unwrap(apiClient.post<SuccessEnvelope<Contact>>('/contacts', body)),
  update: (id: string, body: ContactInput) =>
    unwrap(apiClient.patch<SuccessEnvelope<Contact>>(`/contacts/${id}`, body)),
  remove: (id: string) => apiClient.delete(`/contacts/${id}`).then(() => undefined),
  tags: () =>
    unwrap(apiClient.get<SuccessEnvelope<{ tag: string; count: number }[]>>('/contact-tags')),
  bulk: async (body: BulkRequest) =>
    (
      await apiClient.post<SuccessEnvelope<{ count: number; jobQueued?: true }>>(
        '/contacts/bulk',
        body,
      )
    ).data.data,
  optOut: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<Contact>>(`/contacts/${id}/opt-out`)),
  undoOptOut: (id: string) =>
    unwrap(apiClient.delete<SuccessEnvelope<Contact>>(`/contacts/${id}/opt-out`)),
};
