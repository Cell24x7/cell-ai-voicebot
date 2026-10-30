import { apiClient, unwrap } from './client';
import type {
  AccountWhatsAppBillingView,
  SuccessEnvelope,
  WhatsAppBillingInput,
  WhatsAppBillingSettingsPatch,
  WhatsAppBillingSettingsView,
  WhatsAppMarginRow,
  WhatsAppRateCard,
  WhatsAppRateCards,
  WhatsAppRateCardSave,
  WhatsAppRateImport,
  WhatsAppReconcileRow,
} from './types';

export interface MonthQuery {
  /** `YYYY-MM`. */
  month: string;
  accountId?: string;
}

/** Superadmin WhatsApp billing (`/api/v1/admin/whatsapp-*`, PHASE_11_PLAN §1n). */
export const adminWhatsappBillingApi = {
  rates: () => unwrap(apiClient.get<SuccessEnvelope<WhatsAppRateCards>>('/admin/whatsapp-rates')),
  /** Preview Meta's INR CSV (≤ 2 MB): markets, row errors, diff — nothing saved. */
  importRates: (file: Blob, fileName?: string) => {
    const form = new FormData();
    if (fileName === undefined) form.append('file', file);
    else form.append('file', file, fileName);
    return unwrap(
      apiClient.post<SuccessEnvelope<WhatsAppRateImport>>('/admin/whatsapp-rates/import', form, {
        timeout: 0,
      }),
    );
  },
  /** Phase 12: the per-minute calling cards (same shape, `callingMarkets` filled). */
  callingRates: () =>
    unwrap(
      apiClient.get<SuccessEnvelope<WhatsAppRateCards>>('/admin/whatsapp-rates', {
        params: { kind: 'calling' },
      }),
    ),
  /** Preview Meta's INR calling CSV (`Market, Currency, Per minute` + tiers). */
  importCallingRates: (file: Blob, fileName?: string) => {
    const form = new FormData();
    if (fileName === undefined) form.append('file', file);
    else form.append('file', file, fileName);
    return unwrap(
      apiClient.post<SuccessEnvelope<WhatsAppRateImport>>('/admin/whatsapp-rates/import', form, {
        timeout: 0,
        params: { kind: 'calling' },
      }),
    );
  },
  saveRates: (body: WhatsAppRateCardSave) =>
    unwrap(apiClient.post<SuccessEnvelope<WhatsAppRateCard>>('/admin/whatsapp-rates', body)),
  settings: () =>
    unwrap(apiClient.get<SuccessEnvelope<WhatsAppBillingSettingsView>>('/admin/whatsapp-billing')),
  updateSettings: (body: WhatsAppBillingSettingsPatch) =>
    unwrap(
      apiClient.patch<SuccessEnvelope<WhatsAppBillingSettingsView>>(
        '/admin/whatsapp-billing',
        body,
      ),
    ),
  /** Payer (Phase 9) + the account's price override (markup / fixed prices / platform fee). */
  setAccountBilling: (accountId: string, body: WhatsAppBillingInput) =>
    unwrap(
      apiClient.patch<SuccessEnvelope<AccountWhatsAppBillingView>>(
        `/admin/accounts/${accountId}/whatsapp-billing`,
        body,
      ),
    ),
  margin: (query: MonthQuery) =>
    unwrap(
      apiClient.get<SuccessEnvelope<WhatsAppMarginRow[]>>('/admin/reports/whatsapp-margin', {
        params: query,
      }),
    ),
  /** The margin report as CSV (a Blob). */
  marginCsv: async (query: MonthQuery) =>
    (
      await apiClient.get<Blob>('/admin/reports/whatsapp-margin', {
        params: { ...query, format: 'csv' },
        responseType: 'blob',
      })
    ).data,
  reconciliation: (query: MonthQuery) =>
    unwrap(
      apiClient.get<SuccessEnvelope<WhatsAppReconcileRow[]>>(
        '/admin/reports/whatsapp-reconciliation',
        { params: query },
      ),
    ),
};
