import { apiClient, unwrap } from './client';
import type {
  AccountRateCards,
  AdminBillingConfig,
  AdminPayment,
  BillingSummary,
  CursorPageMeta,
  LedgerEntry,
  ListEnvelope,
  OffsetPageMeta,
  PaymentEvent,
  RateCardVersion,
  SimulatedCallResult,
  SimulatedHold,
  SuccessEnvelope,
  TopupOrder,
  Wallet,
  WalletAdjustment,
} from './types';
import type { LedgerQuery } from './wallet';

/** What a superadmin may set on a rate card (integer micros / bps). */
export interface RateCardInput {
  callPerMinuteMicros: number;
  pulseSeconds: 15 | 30 | 60;
  aiPerMinuteMicros: number;
  ttsPer1kCharsMicros: number;
  commissionBps: number;
  billUnansweredAttempts: boolean;
  /** Phase 5 — AI text and embedding prices per 1,000 tokens. */
  aiTextPer1kTokensMicros: number;
  embeddingPer1kTokensMicros: number;
  note?: string | null;
}

export interface AdjustmentInput {
  direction: 'credit' | 'debit';
  amountMicros: number;
  reason: string;
  allowNegative?: boolean;
}

export interface SimulatedEndInput {
  answered: boolean;
  durationSec: number;
  aiSeconds?: number;
  ttsChars?: number;
}

export interface PaymentsQuery {
  page?: number;
  limit?: number;
  status?: TopupOrder['status'];
  /** Account id. */
  account?: string;
  from?: string;
  to?: string;
}

const acc = (id: string) => `/admin/accounts/${id}`;

/** Superadmin billing (`/api/v1/admin/…`, platform.billing.manage). */
export const adminBillingApi = {
  config: () => unwrap(apiClient.get<SuccessEnvelope<AdminBillingConfig>>('/admin/billing/config')),
  defaultRateCard: () =>
    unwrap(apiClient.get<SuccessEnvelope<RateCardVersion>>('/admin/rate-cards/default')),
  setDefaultRateCard: (body: RateCardInput) =>
    unwrap(apiClient.put<SuccessEnvelope<RateCardVersion>>('/admin/rate-cards/default', body)),
  defaultRateCardHistory: (limit = 50) =>
    unwrap(
      apiClient.get<SuccessEnvelope<RateCardVersion[]>>('/admin/rate-cards/default/history', {
        params: { limit },
      }),
    ),
  accountRateCards: (id: string, limit = 50) =>
    unwrap(
      apiClient.get<SuccessEnvelope<AccountRateCards>>(`${acc(id)}/rate-cards`, {
        params: { limit },
      }),
    ),
  setAccountRateCard: (id: string, body: RateCardInput) =>
    unwrap(apiClient.post<SuccessEnvelope<AccountRateCards>>(`${acc(id)}/rate-cards`, body)),
  accountRateCardToDefault: (id: string, note?: string | null) =>
    unwrap(
      apiClient.delete<SuccessEnvelope<AccountRateCards>>(`${acc(id)}/rate-cards`, {
        data: note ? { note } : {},
      }),
    ),
  wallet: (id: string) => unwrap(apiClient.get<SuccessEnvelope<Wallet>>(`${acc(id)}/wallet`)),
  setCreditLimit: (id: string, creditLimitMicros: number) =>
    unwrap(apiClient.patch<SuccessEnvelope<Wallet>>(`${acc(id)}/wallet`, { creditLimitMicros })),
  ledger: async (id: string, { type, ...query }: LedgerQuery) =>
    (
      await apiClient.get<ListEnvelope<LedgerEntry, CursorPageMeta>>(`${acc(id)}/ledger`, {
        params: { ...query, ...(type?.length ? { type: type.join(',') } : {}) },
      })
    ).data,
  adjust: (id: string, body: AdjustmentInput, idempotencyKey: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<WalletAdjustment>>(`${acc(id)}/wallet/adjustments`, body, {
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    ),
  startSimulatedCall: (id: string, estimateMinutes?: number) =>
    unwrap(
      apiClient.post<SuccessEnvelope<SimulatedHold>>(
        `${acc(id)}/billing/simulated-calls`,
        estimateMinutes ? { estimateMinutes } : {},
      ),
    ),
  endSimulatedCall: (id: string, holdId: string, body: SimulatedEndInput) =>
    unwrap(
      apiClient.post<SuccessEnvelope<SimulatedCallResult>>(
        `${acc(id)}/billing/simulated-calls/${holdId}/end`,
        body,
      ),
    ),
  summary: (month?: string) =>
    unwrap(
      apiClient.get<SuccessEnvelope<BillingSummary>>('/admin/billing/summary', {
        params: month ? { month } : {},
      }),
    ),
  payments: async (query: PaymentsQuery) =>
    (
      await apiClient.get<ListEnvelope<AdminPayment, OffsetPageMeta>>('/admin/payments', {
        params: query,
      })
    ).data,
  paymentEvents: async (query: {
    page?: number;
    limit?: number;
    outcome?: PaymentEvent['outcome'];
  }) =>
    (
      await apiClient.get<ListEnvelope<PaymentEvent, OffsetPageMeta>>('/admin/payment-events', {
        params: query,
      })
    ).data,
};
