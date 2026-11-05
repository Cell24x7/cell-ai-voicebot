import { apiClient, unwrap } from './client';
import type {
  AuthSession,
  ListEnvelope,
  OffsetPageMeta,
  ResellerCreditResult,
  ResellerCustomer,
  ResellerCustomerDetail,
  ResellerStatementRow,
  ResellerSummary,
  SuccessEnvelope,
} from './types';

export interface ResellerCustomersQuery {
  q?: string;
  status?: 'active' | 'suspended';
  page?: number;
  limit?: number;
}

export interface NewCustomerInput {
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string;
  ownerPassword: string;
  timezone?: string;
  startingCreditMicros?: number;
}

const c = (id: string, action = '') => `/reseller/customers/${id}${action}`;

/** `/api/v1/reseller/*` (Phase 19): only on reseller accounts. */
export const resellersApi = {
  summary: () => unwrap(apiClient.get<SuccessEnvelope<ResellerSummary>>('/reseller/summary')),
  customers: async (query: ResellerCustomersQuery) => {
    const res = await apiClient.get<ListEnvelope<ResellerCustomer, OffsetPageMeta>>(
      '/reseller/customers',
      { params: query },
    );
    return res.data;
  },
  createCustomer: (body: NewCustomerInput, idempotencyKey: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<ResellerCustomer>>('/reseller/customers', body, {
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    ),
  customer: (id: string) => unwrap(apiClient.get<SuccessEnvelope<ResellerCustomerDetail>>(c(id))),
  updateCustomer: (id: string, body: { name?: string; status?: 'active' | 'suspended' }) =>
    unwrap(apiClient.patch<SuccessEnvelope<ResellerCustomerDetail>>(c(id), body)),
  setOwnerPassword: (id: string, password: string) =>
    apiClient.post(c(id, '/owner-password'), { password }).then(() => undefined),
  loginAs: (id: string) => unwrap(apiClient.post<SuccessEnvelope<AuthSession>>(c(id, '/login-as'))),
  credit: (
    id: string,
    way: 'give' | 'take',
    body: { amountMicros: number; note?: string },
    idempotencyKey: string,
  ) =>
    unwrap(
      apiClient.post<SuccessEnvelope<ResellerCreditResult>>(
        c(id, way === 'give' ? '/credit' : '/credit/reclaim'),
        body,
        { headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    ),
  statement: (query: { from?: string; to?: string } = {}) =>
    unwrap(
      apiClient.get<SuccessEnvelope<ResellerStatementRow[]>>('/reseller/statement', {
        params: query,
      }),
    ),
  statementCsv: (query: { from?: string; to?: string } = {}) =>
    apiClient
      .get<Blob>('/reseller/statement', {
        params: { ...query, format: 'csv' },
        responseType: 'blob',
      })
      .then((r) => r.data),
  settings: () =>
    unwrap(apiClient.get<SuccessEnvelope<{ customersCanTopUp: boolean }>>('/reseller/settings')),
  updateSettings: (body: { customersCanTopUp: boolean }) =>
    unwrap(
      apiClient.patch<SuccessEnvelope<{ customersCanTopUp: boolean }>>('/reseller/settings', body),
    ),
  /** For a reseller's customer: who adds credit (`GET /wallet/provider`). */
  walletProvider: () =>
    unwrap(
      apiClient.get<SuccessEnvelope<{ provider: { name: string } | null; topupAllowed: boolean }>>(
        '/wallet/provider',
      ),
    ),
};
