import { apiClient, unwrap } from './client';
import type { CustomField, FieldType, SuccessEnvelope } from './types';

export interface CustomFieldInput {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** Currency in rupees, dates `YYYY-MM-DD`. */
  defaultValue?: string | number | null;
}

/** `/api/v1/custom-fields`. */
export const customFieldsApi = {
  list: (withUsage = false) =>
    unwrap(
      apiClient.get<SuccessEnvelope<CustomField[]>>('/custom-fields', {
        params: withUsage ? { withUsage: 'true' } : {},
      }),
    ),
  create: (body: CustomFieldInput) =>
    unwrap(apiClient.post<SuccessEnvelope<CustomField>>('/custom-fields', body)),
  update: (id: string, body: Partial<Omit<CustomFieldInput, 'key'>>) =>
    unwrap(apiClient.patch<SuccessEnvelope<CustomField>>(`/custom-fields/${id}`, body)),
  reorder: (ids: string[]) =>
    unwrap(apiClient.put<SuccessEnvelope<CustomField[]>>('/custom-fields/order', { ids })),
  remove: (id: string) => apiClient.delete(`/custom-fields/${id}`).then(() => undefined),
};
