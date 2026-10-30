import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationsBell } from '@/features/notifications/NotificationsBell';
import { ledgerDescription, marketName, pricingTypeLabel } from '@/features/wallet/ledger-format';
import { LedgerDetailDrawer } from '@/features/wallet/LedgerDetailDrawer';
import { LedgerTable } from '@/features/wallet/LedgerTable';
import { WhatsAppDashboardCard } from '@/features/whatsapp/WhatsAppDashboardCard';
import { adminWhatsappBillingApi } from '@/services/api/admin-whatsapp-billing';
import { ApiError } from '@/services/api/errors';
import { notificationsApi } from '@/services/api/notifications';
import type {
  AdminAccountDetail,
  LedgerEntry,
  WhatsAppBillingSettingsView,
} from '@/services/api/types';
import { walletApi } from '@/services/api/wallet';
import { whatsappApi } from '@/services/api/whatsapp';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';
import { fakeMarginRow, fakeRateCard, fakeRateMarket, fakeReconcileRow } from '@/test/templates';
import { fakeChannel, fakeWhatsAppConfig } from '@/test/whatsapp';
import * as download from '@/utils/download';

import { AccountWhatsAppBillingCard } from './AccountWhatsAppBillingCard';
import {
  formatBpsPercent,
  formatRate,
  formatRateInput,
  parsePercentInput,
  parseRateInput,
  thisMonth,
} from './format';

vi.mock('@/services/api/admin-whatsapp-billing', () => ({
  adminWhatsappBillingApi: {
    rates: vi.fn(),
    importRates: vi.fn(),
    saveRates: vi.fn(),
    settings: vi.fn(),
    updateSettings: vi.fn(),
    setAccountBilling: vi.fn(),
    margin: vi.fn(),
    marginCsv: vi.fn(),
    reconciliation: vi.fn(),
  },
}));
vi.mock('@/services/api/notifications', () => ({
  notificationsApi: {
    unreadCount: vi.fn(),
    list: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

const admin = vi.mocked(adminWhatsappBillingApi);
const R = 1_000_000;
const route = (element: React.ReactNode) => [{ path: '/', element }];

const SETTINGS: WhatsAppBillingSettingsView = {
  settings: { markupBps: 1500, platformFeeMicros: 0, holdMaxAgeHours: 72 },
  defaults: { markupBps: 1500, platformFeeMicros: 0, holdMaxAgeHours: 72 },
  nonInrPlatformChannels: [],
  calling: { markupBps: 1500, platformFeePerMinuteMicros: 0, holdMinutes: 5, holdExtendMinutes: 5 },
  callingDefaults: {
    markupBps: 1500,
    platformFeePerMinuteMicros: 0,
    holdMinutes: 5,
    holdExtendMinutes: 5,
  },
};

beforeEach(() => {
  for (const fn of Object.values(admin)) fn.mockReset();
  admin.rates.mockResolvedValue({
    current: fakeRateCard(),
    scheduled: [
      fakeRateCard({ id: 'rc2', effectiveFrom: '2026-12-01T00:00:00.000Z', note: 'INR card' }),
    ],
    history: [
      {
        id: 'rc1',
        effectiveFrom: '2026-10-01T00:00:00.000Z',
        source: 'manual',
        note: null,
        markets: 2,
      },
      {
        id: 'rc0',
        effectiveFrom: '2026-09-01T00:00:00.000Z',
        source: 'meta_csv',
        note: 'old',
        markets: 250,
      },
    ],
  });
  admin.settings.mockResolvedValue(SETTINGS);
  admin.margin.mockResolvedValue([
    fakeMarginRow(),
    fakeMarginRow({
      category: 'marketing',
      marginMicros: -10_000,
      mismatches: 2,
      metaCostSource: 'analytics',
      marginBps: null,
    }),
  ]);
  admin.reconciliation.mockResolvedValue([
    fakeReconcileRow(),
    fakeReconcileRow({ category: 'marketing', diffVolume: 1, diffMicros: 863_100 }),
  ]);
});
afterEach(() => vi.restoreAllMocks());

describe('formats', () => {
  it('rates keep Meta decimals with string math; percents; month; markets; pricing types', () => {
    expect(formatRateInput(863_100)).toBe('0.8631');
    expect(formatRateInput(1_500_000)).toBe('1.50');
    expect(formatRateInput(115_000)).toBe('0.115');
    expect(formatRate(null)).toBe('—');
    expect(formatRate(140_000)).toBe('₹0.14');
    expect(parseRateInput('₹0.8631')).toEqual({ ok: true, micros: 863_100 });
    expect(parseRateInput('12')).toEqual({ ok: true, micros: 12 * R });
    expect(parseRateInput('')).toMatchObject({ ok: false });
    expect(parseRateInput('0.1234567')).toMatchObject({ ok: false });
    expect(parsePercentInput('20')).toEqual({ ok: true, micros: 2000 });
    expect(parsePercentInput('12.5%')).toEqual({ ok: true, micros: 1250 });
    expect(parsePercentInput('abc')).toMatchObject({ ok: false });
    expect(parsePercentInput('1001')).toMatchObject({ ok: false, message: 'At most 1000%' });
    expect(formatBpsPercent(1250)).toBe('12.5%');
    expect(thisMonth(new Date('2026-10-31T20:00:00Z'))).toBe('2026-11');
    expect(marketName('IN')).toBe('India');
    expect(marketName('NORTH_AMERICA')).toBe('North America');
    expect(marketName('OTHER')).toBe('Other countries');
    expect(marketName('WEIRD_CODE')).toBe('WEIRD_CODE');
    expect(pricingTypeLabel('regular')).toBe('Charged message');
    expect(pricingTypeLabel('new_type')).toBe('new_type');
  });
});

const waEntry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: 'l1',
  type: 'whatsapp_charge',
  direction: 'debit',
  status: 'captured',
  amountMicros: 140_000,
  currency: 'INR',
  balanceAfterMicros: 999 * R,
  breakdown: {
    kind: 'whatsapp',
    waCategory: 'utility',
    waMarket: 'IN',
    waPricingType: 'regular',
    waConversationId: 'cv1',
  },
  ref: { type: 'whatsapp_message', id: 'm1' },
  holdId: 'h1',
  description: 'WhatsApp message',
  note: null,
  createdBy: null,
  releasedAt: null,
  releaseReason: null,
  createdAt: '2026-10-20T10:00:00Z',
  ...over,
});

describe('wallet: WhatsApp lines', () => {
  it('"WhatsApp · Utility · India" in the table; the detail links to the chat', async () => {
    expect(ledgerDescription(waEntry())).toBe('WhatsApp · Utility · India');
    expect(
      ledgerDescription(waEntry({ breakdown: { kind: 'whatsapp', waCategory: 'marketing' } })),
    ).toBe('WhatsApp · Marketing');
    expect(ledgerDescription(waEntry({ breakdown: null }))).toBe('WhatsApp message');
    expect(ledgerDescription(waEntry({ type: 'topup', description: 'Wallet recharge' }))).toBe(
      'Wallet recharge',
    );
    const onOpen = vi.fn();
    renderWithProviders({
      routes: route(<LedgerTable rows={[waEntry()]} timezone="Asia/Kolkata" onOpen={onOpen} />),
    });
    expect(screen.getByText('WhatsApp · Utility · India')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Details of WhatsApp · Utility · India' }),
    );
    expect(onOpen).toHaveBeenCalled();
  });

  it('the detail: category, how WhatsApp billed it, the chat; never the cost for accounts', () => {
    renderWithProviders({
      routes: [
        {
          path: '/',
          element: (
            <LedgerDetailDrawer entry={waEntry()} open timezone="Asia/Kolkata" onClose={vi.fn()} />
          ),
        },
      ],
    });
    const d = within(screen.getByRole('region', { name: 'Transaction details' }));
    expect(d.getByRole('heading', { name: 'WhatsApp · Utility · India' })).toBeInTheDocument();
    expect(d.getByText('Utility · India')).toBeInTheDocument();
    expect(d.getByText('Charged message')).toBeInTheDocument();
    expect(d.getByRole('link', { name: 'Open the chat' })).toHaveAttribute('href', '/inbox/cv1');
    expect(d.queryByText(/Meta cost/)).toBeNull();
  });

  it('superadmin views show the cost split; no chat → the plain source', () => {
    renderWithProviders({
      routes: route(
        <LedgerDetailDrawer
          entry={waEntry({
            breakdown: {
              kind: 'whatsapp',
              waCategory: 'service',
              metaCostMicros: 115_000,
              markupMicros: 25_000,
            },
          })}
          open
          timezone="Asia/Kolkata"
          onClose={vi.fn()}
        />,
      ),
    });
    expect(screen.getByText('Meta cost (superadmin)')).toBeInTheDocument();
    expect(screen.getByText('₹0.03')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp message · m1')).toBeInTheDocument();
  });
});

describe('wallet overview + settings', () => {
  it('WhatsApp spend, budget bar and the WhatsApp prices table', async () => {
    signInAs('owner');
    vi.spyOn(walletApi, 'get').mockResolvedValue({
      currency: 'INR',
      balanceMicros: 1000 * R,
      holdMicros: 140_000,
      availableMicros: 999 * R,
      creditLimitMicros: 0,
      status: 'ok',
      lowBalanceThresholdMicros: 0,
      budgets: { monthlyCallMicros: 0, monthlyAiMicros: 0, monthlyWhatsappMicros: 100 * R },
      monthSpend: {
        month: '2026-10',
        callMicros: 0,
        aiMicros: 0,
        ttsMicros: 0,
        whatsappMicros: 50 * R,
        totalMicros: 50 * R,
      },
      updatedAt: '2026-10-20T00:00:00Z',
    });
    vi.spyOn(walletApi, 'rates').mockResolvedValue({
      callPerMinuteMicros: R,
      pulseSeconds: 60,
      aiPerMinuteMicros: R,
      ttsPer1kCharsMicros: R,
      commissionBps: 0,
      aiTextPer1kTokensMicros: 0,
      embeddingPer1kTokensMicros: 0,
      sttPerMinuteMicros: 500_000,
      billUnansweredAttempts: false,
      source: 'default',
      effectiveFrom: '2026-10-01T00:00:00Z',
      whatsapp: {
        payer: 'platform',
        effectiveFrom: '2026-10-01T00:00:00Z',
        markets: [
          {
            market: 'IN',
            label: 'India',
            prices: {
              marketing: 1_000_000,
              utility: 140_000,
              authentication: 140_000,
              service: 140_000,
            },
          },
        ],
      },
      whatsappCalling: { payer: 'platform', pulseSec: 6, markets: [] },
    });
    const update = vi.spyOn(walletApi, 'updateSettings').mockImplementation(() => walletApi.get());
    renderWithProviders({ route: '/wallet' });
    const table = await screen.findByRole('table', { name: 'WhatsApp prices' });
    expect(within(table).getByRole('row', { name: /India/ })).toHaveTextContent(
      '₹1.00₹0.14₹0.14₹0.14',
    );
    expect(screen.getByText(/WhatsApp ₹50.00/)).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'WhatsApp: 50% of the monthly budget used' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Alerts & budgets' }));
    const dialog = await screen.findByRole('dialog', { name: 'Wallet settings' });
    const wa = within(dialog).getByRole('textbox', { name: 'Monthly WhatsApp budget (₹)' });
    expect(wa).toHaveValue('100');
    await userEvent.clear(wa);
    await userEvent.type(wa, 'abc');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(update).not.toHaveBeenCalled();
    await userEvent.clear(wa);
    await userEvent.type(wa, '250');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        lowBalanceThresholdMicros: 0,
        budgets: { monthlyCallMicros: 0, monthlyAiMicros: 0, monthlyWhatsappMicros: 250 * R },
      }),
    );
  });

  it('customer-pays accounts see the fee-only note', async () => {
    signInAs('owner');
    const { WhatsAppPrices } = await import('@/features/wallet/WhatsAppPrices');
    renderWithProviders({
      routes: route(
        <WhatsAppPrices
          prices={{ payer: 'customer', effectiveFrom: '2026-10-01T00:00:00Z', markets: [] }}
        />,
      ),
    });
    expect(
      screen.getByText(/Meta bills WhatsApp messages to your own WhatsApp account/),
    ).toBeInTheDocument();
  });
});

describe('superadmin WhatsApp billing page', () => {
  const open = async (tab?: string) => {
    signInAs('superadmin');
    renderWithProviders({ route: `/admin/whatsapp-billing${tab ? `?tab=${tab}` : ''}` });
    await screen.findByRole('heading', { level: 1, name: 'WhatsApp billing' });
  };

  it('Rates: the card in force, scheduled, history', async () => {
    await open();
    const current = await screen.findByRole('table', { name: 'Current rates' });
    expect(within(current).getByRole('row', { name: /India/ })).toHaveTextContent(
      '+91₹0.8631₹0.115₹0.115₹0.115',
    );
    expect(within(current).getByRole('row', { name: /Other/ })).toHaveTextContent(
      'Everything else',
    );
    expect(screen.getByText(/From .* · INR card/)).toBeInTheDocument();
    const history = screen.getByRole('table', { name: 'Rate card history' });
    expect(within(history).getAllByRole('row')).toHaveLength(3);
    expect(history).toHaveTextContent("Meta's CSV");
  });

  it('Rates: import a CSV → errors with rows + diff → effective date + note → save', async () => {
    admin.importRates.mockResolvedValue({
      callingMarkets: [],
      markets: [
        fakeRateMarket({ utilityMicros: 120_000 }),
        fakeRateMarket({ market: 'AE', label: 'UAE', callingCodes: ['971'] }),
      ],
      errors: [{ row: 7, message: 'Unknown currency USD' }],
      diff: {
        added: ['AE'],
        removed: ['OTHER'],
        changed: [{ market: 'IN', field: 'utilityMicros', fromMicros: 115_000, toMicros: 120_000 }],
      },
    });
    admin.saveRates.mockResolvedValue(fakeRateCard());
    await open();
    const input = await screen.findByLabelText('Rate card CSV');
    fireEvent.change(input, {
      target: { files: [new File(['Market,Currency'], 'meta-inr.csv', { type: 'text/csv' })] },
    });
    const preview = await screen.findByRole('region', { name: 'Import preview' });
    expect(preview).toHaveTextContent('meta-inr.csv: 2 markets');
    expect(within(preview).getByText('Row 7: Unknown currency USD')).toBeInTheDocument();
    expect(within(preview).getByText('1 added · 1 removed · 1 prices changed')).toBeInTheDocument();
    expect(within(preview).getByText('+ AE')).toBeInTheDocument();
    expect(within(preview).getByText('− OTHER')).toBeInTheDocument();
    expect(within(preview).getByRole('table', { name: 'Changed prices' })).toHaveTextContent(
      'INUtility₹0.115₹0.12',
    );
    fireEvent.change(within(preview).getByLabelText('Effective from'), {
      target: { value: '2026-12-01T00:00' },
    });
    await userEvent.type(
      within(preview).getByRole('textbox', { name: 'Note (optional)' }),
      'Meta INR card',
    );
    await userEvent.click(within(preview).getByRole('button', { name: 'Save rate card' }));
    await waitFor(() => expect(admin.saveRates).toHaveBeenCalled());
    expect(admin.saveRates.mock.calls[0]?.[0]).toMatchObject({
      source: 'meta_csv',
      note: 'Meta INR card',
      effectiveFrom: new Date('2026-12-01T00:00').toISOString(),
    });
    expect(admin.saveRates.mock.calls[0]?.[0].markets).toHaveLength(2);
    expect(await screen.findByText('Rate card saved')).toBeInTheDocument();
    expect(admin.importRates).toHaveBeenCalledWith(expect.any(File), 'meta-inr.csv');
  });

  it('Rates: the first card has nothing to compare; an import error; discard', async () => {
    admin.rates.mockResolvedValue({ current: null, scheduled: [], history: [] });
    admin.importRates
      .mockRejectedValueOnce(
        new ApiError({
          status: 413,
          code: 'PAYLOAD_TOO_LARGE',
          message: 'File too large',
          kind: 'http',
        }),
      )
      .mockResolvedValueOnce({
        markets: [fakeRateMarket()],
        callingMarkets: [],
        errors: [],
        diff: null,
      });
    await open();
    expect(await screen.findByText(/No rate card yet/)).toBeInTheDocument();
    const input = screen.getByLabelText('Rate card CSV');
    fireEvent.change(input, { target: { files: [new File(['x'], 'big.csv')] } });
    expect(await screen.findByText('File too large')).toBeInTheDocument();
    fireEvent.change(input, { target: { files: [new File(['x'], 'ok.csv')] } });
    expect(
      await screen.findByText(/there is no rate card yet to compare with/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('region', { name: 'Import preview' })).toBeNull();
  });

  it('Rates: edit one market by hand (decimals kept)', async () => {
    admin.saveRates.mockResolvedValue(fakeRateCard());
    await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit India' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit India' });
    const utility = within(dialog).getByRole('textbox', { name: 'Utility (₹ per message)' });
    expect(utility).toHaveValue('0.115');
    await userEvent.clear(utility);
    await userEvent.type(utility, 'x');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save rate card' }));
    expect(within(dialog).getByText('Use a price like 0.8631')).toBeInTheDocument();
    await userEvent.clear(utility);
    await userEvent.type(utility, '0.1234');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save rate card' }));
    await waitFor(() => expect(admin.saveRates).toHaveBeenCalled());
    const body = admin.saveRates.mock.calls[0]?.[0];
    expect(body).toMatchObject({ source: 'manual', note: 'Edited India' });
    expect(body?.markets?.find((m) => m.market === 'IN')?.utilityMicros).toBe(123_400);
    expect(body?.markets?.find((m) => m.market === 'OTHER')?.utilityMicros).toBe(115_000);
  });

  it('Rates: a load error', async () => {
    admin.rates.mockRejectedValue(
      new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Boom', kind: 'http' }),
    );
    await open();
    expect(await screen.findByText('Boom')).toBeInTheDocument();
  });

  it('Settings: markup / fee / hold hours saved; validation; the non-INR numbers', async () => {
    admin.settings.mockResolvedValue({
      ...SETTINGS,
      nonInrPlatformChannels: [
        { channelId: 'w1', accountId: 'a1', label: 'Support line', wabaCurrency: 'USD' },
      ],
    });
    admin.updateSettings.mockResolvedValue({
      ...SETTINGS,
      settings: { markupBps: 2000, platformFeeMicros: 50_000, holdMaxAgeHours: 48 },
    });
    await open('settings');
    expect(
      await screen.findByText(/1 platform-paid numbers are not billed in INR/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Support line' })).toHaveAttribute(
      'href',
      '/admin/accounts/a1',
    );
    const markup = screen.getByRole('textbox', { name: "Markup on Meta's rate (%)" });
    expect(markup).toHaveValue('15');
    await userEvent.clear(markup);
    await userEvent.type(markup, 'x');
    const hours = screen.getByRole('textbox', { name: 'Release holds after (hours)' });
    await userEvent.clear(hours);
    await userEvent.type(hours, '0');
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(screen.getByText('Use a percent like 15')).toBeInTheDocument();
    expect(screen.getByText('Between 1 and 720 hours')).toBeInTheDocument();
    await userEvent.clear(markup);
    await userEvent.type(markup, '20');
    await userEvent.clear(hours);
    await userEvent.type(hours, '48');
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Platform fee per message (₹)' }),
      '{selectall}0.05',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() =>
      expect(admin.updateSettings).toHaveBeenCalledWith({
        markupBps: 2000,
        platformFeeMicros: 50_000,
        holdMaxAgeHours: 48,
      }),
    );
    expect(await screen.findByText('WhatsApp price settings saved')).toBeInTheDocument();
  });

  it('Settings: a load error', async () => {
    admin.settings.mockRejectedValue(
      new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Down', kind: 'http' }),
    );
    await open('settings');
    expect(await screen.findByText('Down')).toBeInTheDocument();
  });

  it('Margin: rows, totals, negative margin, CSV; month and account filters', async () => {
    const save = vi.spyOn(download, 'saveBlob').mockImplementation(() => undefined);
    admin.marginCsv.mockResolvedValue(new Blob(['a,b']));
    await open('margin');
    const table = await screen.findByRole('table', { name: 'WhatsApp margin' });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent(
      'Demo Financeutility10₹1.40₹1.15 (list price)₹0.25 · 17.86%0',
    );
    expect(rows[2]).toHaveTextContent("(Meta's analytics)");
    expect(rows[3]).toHaveTextContent('Total20₹2.80₹2.30₹0.24');
    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.stringMatching(/^whatsapp-margin-\d{4}-\d{2}\.csv$/),
      ),
    );
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '2026-09' } });
    await waitFor(() => expect(admin.margin).toHaveBeenLastCalledWith({ month: '2026-09' }));
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '' } });
    await userEvent.type(screen.getByRole('textbox', { name: 'Account id (optional)' }), 'abc');
    expect(screen.getByText('A 24-character account id')).toBeInTheDocument();
    await userEvent.clear(screen.getByRole('textbox', { name: 'Account id (optional)' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Account id (optional)' }),
      'a'.repeat(24),
    );
    await waitFor(() =>
      expect(admin.margin).toHaveBeenLastCalledWith({
        month: '2026-09',
        accountId: 'a'.repeat(24),
      }),
    );
  });

  it('Margin / reconciliation: empty and error states', async () => {
    admin.margin.mockResolvedValue([]);
    admin.reconciliation.mockRejectedValue(
      new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Nope', kind: 'http' }),
    );
    await open('margin');
    expect(await screen.findByText('No WhatsApp charges this month')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Reconciliation' }));
    expect(await screen.findByText('Nope')).toBeInTheDocument();
  });

  it('Reconciliation: per WABA × day × category with differences highlighted', async () => {
    await open('reconciliation');
    const table = await screen.findByRole('table', { name: 'WhatsApp reconciliation' });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Matches');
    expect(rows[2]).toHaveTextContent('+1 messages · ₹0.86');
    expect(rows[2]).toHaveAttribute('data-mismatch', 'true');
    expect(rows[1]).not.toHaveAttribute('data-mismatch');
  });

  it('Reconciliation: empty', async () => {
    admin.reconciliation.mockResolvedValue([]);
    await open('reconciliation');
    expect(await screen.findByText('Nothing reconciled this month')).toBeInTheDocument();
  });
});

const detail = (wb: Partial<AdminAccountDetail['whatsappBilling']> = {}) =>
  ({
    account: { id: 'acc1' },
    whatsappBilling: {
      metaPayer: 'platform',
      markupBps: null,
      fixedPrices: null,
      platformFeeMicros: null,
      ...wb,
    },
  }) as AdminAccountDetail;

describe('account WhatsApp billing region', () => {
  it('saves the markup, fixed prices and fee (empty = global)', async () => {
    signInAs('superadmin');
    admin.setAccountBilling.mockResolvedValue({
      metaPayer: 'platform',
      whatsappBilling: {
        markupBps: 2000,
        fixedPrices: { utility: 300_000 },
        platformFeeMicros: null,
      },
      whatsappCallingBilling: {
        markupBps: null,
        fixedPerMinuteMicros: null,
        platformFeePerMinuteMicros: null,
      },
    });
    renderWithProviders({ routes: route(<AccountWhatsAppBillingCard detail={detail()} />) });
    const region = within(screen.getByRole('region', { name: 'WhatsApp billing' }));
    await userEvent.type(region.getByRole('textbox', { name: 'Markup (%)' }), '20');
    await userEvent.type(region.getByRole('textbox', { name: 'Fixed Utility price (₹)' }), '0.30');
    await userEvent.click(region.getByRole('button', { name: 'Save prices' }));
    await waitFor(() =>
      expect(admin.setAccountBilling).toHaveBeenCalledWith('acc1', {
        markupBps: 2000,
        platformFeeMicros: null,
        fixedPrices: { utility: 300_000 },
      }),
    );
    expect(await screen.findByText('WhatsApp prices saved')).toBeInTheDocument();
  });

  it('prefills the override; invalid inputs; clearing everything sends nulls; errors show', async () => {
    signInAs('superadmin');
    admin.setAccountBilling
      .mockRejectedValueOnce(
        new ApiError({
          status: 409,
          code: 'CONFLICT_INVALID_STATE',
          message: 'Platform account',
          kind: 'http',
        }),
      )
      .mockResolvedValue({
        metaPayer: 'platform',
        whatsappBilling: { markupBps: null, fixedPrices: null, platformFeeMicros: null },
        whatsappCallingBilling: {
          markupBps: null,
          fixedPerMinuteMicros: null,
          platformFeePerMinuteMicros: null,
        },
      });
    renderWithProviders({
      routes: route(
        <AccountWhatsAppBillingCard
          detail={detail({
            markupBps: 1250,
            fixedPrices: { marketing: 863_100 },
            platformFeeMicros: 50_000,
          })}
        />,
      ),
    });
    const markup = screen.getByRole('textbox', { name: 'Markup (%)' });
    expect(markup).toHaveValue('12.5');
    expect(screen.getByRole('textbox', { name: 'Fixed Marketing price (₹)' })).toHaveValue(
      '0.8631',
    );
    expect(screen.getByRole('textbox', { name: 'Platform fee (₹ per message)' })).toHaveValue(
      '0.05',
    );
    await userEvent.clear(markup);
    await userEvent.type(markup, 'zz');
    await userEvent.click(screen.getByRole('button', { name: 'Save prices' }));
    expect(screen.getByText('Use a percent like 15')).toBeInTheDocument();
    expect(admin.setAccountBilling).not.toHaveBeenCalled();
    await userEvent.clear(markup);
    await userEvent.clear(screen.getByRole('textbox', { name: 'Fixed Marketing price (₹)' }));
    await userEvent.clear(screen.getByRole('textbox', { name: 'Platform fee (₹ per message)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save prices' }));
    expect(await screen.findByText('Platform account')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save prices' }));
    await waitFor(() => expect(admin.setAccountBilling).toHaveBeenCalledTimes(2));
    expect(admin.setAccountBilling).toHaveBeenLastCalledWith('acc1', {
      markupBps: null,
      platformFeeMicros: null,
      fixedPrices: null,
    });
  });
});

describe('notifications and dashboard', () => {
  it('the 7 Phase 11 notification types get an icon', async () => {
    signInAs('owner');
    const types = [
      ['template.approved', 'Template approved'],
      ['template.rejected', 'Template rejected'],
      ['template.paused', 'Template paused'],
      ['template.disabled', 'Template disabled'],
      ['template.category_changed', 'Template category changed'],
      ['template.quality_low', 'Template quality low'],
      ['wallet.whatsapp_late_charge', 'WhatsApp charge after a release'],
    ] as const;
    vi.mocked(notificationsApi.unreadCount).mockResolvedValue(7);
    vi.mocked(notificationsApi.list).mockResolvedValue({
      success: true,
      data: types.map(([type], i) => ({
        id: `n${String(i)}`,
        type,
        title: `Title ${String(i)}`,
        body: 'x',
        link: '/whatsapp/templates',
        readAt: null,
        createdAt: '2026-10-22T06:00:00.000Z',
      })),
      meta: {},
    } as never);
    renderWithProviders({ routes: route(<NotificationsBell />) });
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 7 unread' }));
    const menu = await screen.findByRole('menu');
    await within(menu).findByText('Title 6');
    for (const [, label] of types) expect(within(menu).getByTitle(label)).toBeInTheDocument();
  });

  it('the dashboard WhatsApp card shows this month on WhatsApp (wallet readers only)', async () => {
    vi.spyOn(whatsappApi, 'config').mockResolvedValue(fakeWhatsAppConfig());
    vi.spyOn(whatsappApi, 'channels').mockResolvedValue({
      items: [fakeChannel()],
      counts: { connected: 1 },
      limit: 10,
    });
    vi.spyOn(walletApi, 'get').mockResolvedValue({
      currency: 'INR',
      balanceMicros: R,
      holdMicros: 0,
      availableMicros: R,
      creditLimitMicros: 0,
      status: 'ok',
      lowBalanceThresholdMicros: 0,
      budgets: { monthlyCallMicros: 0, monthlyAiMicros: 0, monthlyWhatsappMicros: 0 },
      monthSpend: {
        month: '2026-10',
        callMicros: 0,
        aiMicros: 0,
        ttsMicros: 0,
        whatsappMicros: 1_230_000,
        totalMicros: 1_230_000,
      },
      updatedAt: '2026-10-20T00:00:00Z',
    });
    signInAs('owner');
    const first = renderWithProviders({ routes: route(<WhatsAppDashboardCard />) });
    expect(await screen.findByText('This month: ₹1.23 on WhatsApp')).toBeInTheDocument();
    first.unmount();
    signInAs('agent');
    renderWithProviders({ routes: route(<WhatsAppDashboardCard />) });
    expect(await screen.findByText('1 connected')).toBeInTheDocument();
    expect(screen.queryByText(/on WhatsApp/)).toBeNull();
  });
});
