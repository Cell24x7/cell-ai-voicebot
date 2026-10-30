import { apiClient, unwrap } from './client';
import type {
  CursorPageMeta,
  LedgerEntry,
  ListEnvelope,
  OffsetPageMeta,
  RateCardView,
  SuccessEnvelope,
  TopupCheckout,
  TopupOrder,
  UsageSeries,
  Wallet,
  WalletEstimate,
} from './types';

export interface WalletSettingsInput {
  lowBalanceThresholdMicros?: number;
  /** `monthlyWhatsappMicros` 0 = no WhatsApp budget (Phase 11). */
  budgets?: {
    monthlyCallMicros?: number;
    monthlyAiMicros?: number;
    monthlyWhatsappMicros?: number;
  };
}

export type LedgerType = LedgerEntry['type'];
export type LedgerStatus = LedgerEntry['status'];

export interface LedgerQuery {
  limit?: number;
  cursor?: string;
  /** Several types → comma-separated on the wire. */
  type?: LedgerType[];
  status?: LedgerStatus;
  /** e.g. `whatsapp_message` (Phase 11). */
  refType?: LedgerEntry['ref']['type'];
  /** ISO date-times (account timezone handled by the caller). */
  from?: string;
  to?: string;
}

export interface EstimateInput {
  calls: number;
  avgDurationSec: number;
  answerRate: number;
  aiShare: number;
}

const ledgerParams = ({ type, ...rest }: LedgerQuery) => ({
  ...rest,
  ...(type?.length ? { type: type.join(',') } : {}),
});

/** `/api/v1/wallet` (+ `/wallet/topups`). */
export const walletApi = {
  get: () => unwrap(apiClient.get<SuccessEnvelope<Wallet>>('/wallet')),
  updateSettings: (body: WalletSettingsInput) =>
    unwrap(apiClient.patch<SuccessEnvelope<Wallet>>('/wallet/settings', body)),
  rates: () => unwrap(apiClient.get<SuccessEnvelope<RateCardView>>('/wallet/rates')),
  estimate: (body: EstimateInput) =>
    unwrap(apiClient.post<SuccessEnvelope<WalletEstimate>>('/wallet/estimate', body)),
  ledger: async (query: LedgerQuery) =>
    (
      await apiClient.get<ListEnvelope<LedgerEntry, CursorPageMeta>>('/wallet/ledger', {
        params: ledgerParams(query),
      })
    ).data,
  ledgerEntry: (id: string) =>
    unwrap(apiClient.get<SuccessEnvelope<LedgerEntry>>(`/wallet/ledger/${id}`)),
  /** CSV for `from`–`to` (YYYY-MM-DD, account timezone) as a Blob. */
  exportLedger: async (from: string, to: string) =>
    (
      await apiClient.get<Blob>('/wallet/ledger/export', {
        params: { from, to },
        responseType: 'blob',
      })
    ).data,
  usage: (query: { from?: string; to?: string }) =>
    unwrap(apiClient.get<SuccessEnvelope<UsageSeries>>('/wallet/usage', { params: query })),

  /** Top-ups: one Idempotency-Key per Add-money attempt (the caller keeps it). */
  createTopup: (amountMicros: number, idempotencyKey: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<TopupCheckout>>(
        '/wallet/topups',
        { amountMicros },
        { headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    ),
  topups: async (query: { page?: number; limit?: number }) =>
    (
      await apiClient.get<ListEnvelope<TopupOrder, OffsetPageMeta>>('/wallet/topups', {
        params: query,
      })
    ).data,
  topup: (id: string) => unwrap(apiClient.get<SuccessEnvelope<TopupOrder>>(`/wallet/topups/${id}`)),
  verifyTopup: (id: string, body: { providerPaymentId: string; signature: string }) =>
    unwrap(apiClient.post<SuccessEnvelope<TopupOrder>>(`/wallet/topups/${id}/verify`, body)),
  /** Test payments only (`PAYMENT_PROVIDER=fake`). */
  fakeComplete: (id: string, outcome: 'paid' | 'failed') =>
    unwrap(
      apiClient.post<SuccessEnvelope<TopupOrder>>(`/wallet/topups/${id}/fake-complete`, {
        outcome,
      }),
    ),
};
