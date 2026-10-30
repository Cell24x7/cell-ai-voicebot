import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { billingApi } from '@/services/api/billing';
import { ApiError } from '@/services/api/errors';
import { invoicesApi } from '@/services/api/invoices';
import type { Invoice, LedgerEntry, UsageSeries } from '@/services/api/types';
import { walletApi } from '@/services/api/wallet';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

import { usageDataset } from './usage-format';

const chartProps = vi.hoisted(() => ({ last: null as null | Record<string, unknown> }));
vi.mock('@mui/x-charts/BarChart', () => ({
  BarChart: (props: Record<string, unknown>) => {
    chartProps.last = props;
    return <div data-testid="usage-chart" />;
  },
}));
vi.mock('@/services/api/wallet', () => ({
  walletApi: {
    get: vi.fn(),
    ledger: vi.fn(),
    exportLedger: vi.fn(),
    usage: vi.fn(),
  },
}));
vi.mock('@/services/api/invoices', () => ({
  invoicesApi: { list: vi.fn(), download: vi.fn() },
}));
vi.mock('@/services/api/billing', () => ({
  billingApi: { profile: vi.fn(), saveProfile: vi.fn(), states: vi.fn() },
}));
vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))), me: vi.fn() },
}));

const wallet = vi.mocked(walletApi);
const invoices = vi.mocked(invoicesApi);
const billing = vi.mocked(billingApi);
const R = 1_000_000;
const httpError = (
  status: number,
  code: string,
  message = 'Server said no',
  details: { path: string; message: string }[] = [],
) => new ApiError({ status, code, message, kind: 'http', details });

const ROW = (overrides: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: 'l1',
  type: 'topup',
  direction: 'credit',
  status: 'captured',
  amountMicros: 1000 * R,
  currency: 'INR',
  balanceAfterMicros: 1000 * R,
  breakdown: null,
  ref: { type: 'topup', id: 'order1' },
  holdId: null,
  description: 'Wallet recharge',
  note: null,
  createdBy: null,
  releasedAt: null,
  releaseReason: null,
  createdAt: '2026-10-05T06:30:00Z',
  ...overrides,
});
const HOLD = ROW({
  id: 'l2',
  type: 'call_charge',
  direction: 'debit',
  status: 'held',
  amountMicros: 21 * R,
  balanceAfterMicros: null,
  ref: { type: 'simulator', id: 'sim1' },
  description: 'Call hold',
});
const CHARGE = ROW({
  id: 'l3',
  type: 'call_charge',
  direction: 'debit',
  amountMicros: 2 * R + 500_000,
  balanceAfterMicros: 997_500_000,
  breakdown: {
    telephonyMicros: 2 * R,
    aiMicros: 0,
    ttsMicros: 500_000,
    commissionMicros: 0,
    answered: true,
    durationSec: 90,
    billableSeconds: 120,
    pulseSeconds: 60,
    aiSeconds: 0,
    ttsChars: 200,
  },
  ref: { type: 'simulator', id: 'sim1' },
  holdId: 'l2',
  description: 'Call charge',
});
const page = (data: LedgerEntry[], nextCursor: string | null = null) => ({
  success: true as const,
  data,
  meta: { hasMore: Boolean(nextCursor), nextCursor },
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-09T06:00:00Z'));
  wallet.ledger.mockResolvedValue(page([ROW(), HOLD, CHARGE]));
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  chartProps.last = null;
});

describe('transactions', () => {
  it('lists signed amounts and statuses, opens hold and charge details', async () => {
    signInAs('viewer');
    renderWithProviders({ route: '/wallet?tab=transactions' });
    const table = await screen.findByRole('table', { name: 'Transactions' });
    expect(await within(table).findByText('+₹1,000.00')).toBeInTheDocument();
    expect(within(table).getByText('−₹21.00')).toHaveStyle({ fontStyle: 'italic' });
    expect(within(table).getByText('−₹2.50')).toBeInTheDocument();
    expect(within(table).getByText('On hold')).toBeInTheDocument();
    expect(within(table).getAllByText('05 Oct 2026, 12:00')).toHaveLength(3);
    expect(wallet.ledger).toHaveBeenCalledWith({ limit: 25 });

    await userEvent.click(within(table).getByRole('button', { name: 'Details of Call hold' }));
    let details = await screen.findByRole('region', { name: 'Transaction details' });
    expect(within(details).getByText('Simulated call · sim1')).toBeInTheDocument();
    expect(within(details).queryByText('How this was priced')).not.toBeInTheDocument();
    await userEvent.click(within(details).getByRole('button', { name: 'Close details' }));

    await userEvent.click(
      await within(table).findByRole('button', { name: 'Details of Call charge' }),
    );
    details = await screen.findByRole('region', { name: 'Transaction details' });
    expect(within(details).getByText('1 min 30 s')).toBeInTheDocument();
    expect(within(details).getByText('2 min (60 s pulses)')).toBeInTheDocument();
    expect(within(details).getByText('₹2.00')).toBeInTheDocument();
    expect(within(details).getByText('₹0.50 (200 characters)')).toBeInTheDocument();
    expect(within(details).getByText('l2')).toBeInTheDocument();
  });

  it('shows released holds and adjustment reasons in the drawer', async () => {
    signInAs('viewer');
    wallet.ledger.mockResolvedValue(
      page([
        {
          ...HOLD,
          id: 'l4',
          status: 'released',
          releasedAt: '2026-10-05T06:40:00Z',
          releaseReason: 'settled',
        },
        ROW({
          id: 'l5',
          type: 'adjustment',
          description: 'Adjustment: Goodwill',
          note: 'Goodwill',
          createdBy: { id: 'u9', name: null },
        }),
      ]),
    );
    renderWithProviders({ route: '/wallet?tab=transactions' });
    await userEvent.click(await screen.findByRole('button', { name: 'Details of Call hold' }));
    expect(await screen.findByText(/call ended, charged separately/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close details' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Details of Adjustment: Goodwill' }),
    );
    expect(await screen.findByText('Goodwill')).toBeInTheDocument();
    expect(screen.getByText('Support')).toBeInTheDocument();
  });

  it('puts filters in the URL and sends them as account-timezone instants', async () => {
    signInAs('viewer');
    renderWithProviders({
      route:
        '/wallet?tab=transactions&type=topup,adjustment,bogus&status=captured&from=2026-10-01&to=2026-10-05',
    });
    await screen.findByRole('table', { name: 'Transactions' });
    expect(wallet.ledger).toHaveBeenCalledWith({
      limit: 25,
      type: ['topup', 'adjustment'],
      status: 'captured',
      from: '2026-09-30T18:30:00.000Z',
      to: '2026-10-05T18:30:00.000Z',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(wallet.ledger).toHaveBeenLastCalledWith({ limit: 25 }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }));
    await userEvent.click(await screen.findByRole('option', { name: 'On hold' }));
    await waitFor(() =>
      expect(wallet.ledger).toHaveBeenLastCalledWith({ limit: 25, status: 'held' }),
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Type' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Call charge' }));
    await waitFor(() =>
      expect(wallet.ledger).toHaveBeenLastCalledWith({
        limit: 25,
        status: 'held',
        type: ['call_charge'],
      }),
    );
  });

  it('refuses a reversed range and shows a filtered empty state', async () => {
    signInAs('viewer');
    const view = renderWithProviders({
      route: '/wallet?tab=transactions&from=2026-10-05&to=2026-10-01',
    });
    expect(await screen.findByText('Must be after From')).toBeInTheDocument();
    expect(wallet.ledger).not.toHaveBeenCalled();
    view.unmount();
    wallet.ledger.mockResolvedValue(page([]));
    renderWithProviders({ route: '/wallet?tab=transactions&status=released' });
    expect(await screen.findByText('Nothing matches these filters')).toBeInTheDocument();
  });

  it('loads more with the cursor and retries after an error', async () => {
    signInAs('viewer');
    wallet.ledger
      .mockRejectedValueOnce(httpError(500, 'INTERNAL_ERROR', 'Ledger down'))
      .mockResolvedValueOnce(page([ROW()], 'c1'))
      .mockResolvedValueOnce(page([CHARGE]));
    renderWithProviders({ route: '/wallet?tab=transactions' });
    expect(await screen.findByText('Ledger down')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('−₹2.50')).toBeInTheDocument();
    expect(wallet.ledger).toHaveBeenLastCalledWith({ limit: 25, cursor: 'c1' });
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('exports a CSV for a valid range only', async () => {
    signInAs('viewer');
    const createUrl = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revoke });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    wallet.exportLedger.mockRejectedValueOnce(httpError(422, 'VALIDATION_FAILED', 'Too many rows'));
    wallet.exportLedger.mockResolvedValue(new Blob(['a,b']));
    renderWithProviders({ route: '/wallet?tab=transactions' });
    await userEvent.click(await screen.findByRole('button', { name: 'Export' }));
    const dialog = await screen.findByRole('dialog', { name: 'Export transactions' });
    const from = within(dialog).getByLabelText('From');
    expect(from).toHaveValue('2026-10-01');
    expect(within(dialog).getByLabelText('To')).toHaveValue('2026-10-09');
    await userEvent.clear(from);
    await userEvent.type(from, '2025-01-01');
    expect(within(dialog).getByText('At most one year at a time')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Download CSV' })).toBeDisabled();
    await userEvent.clear(from);
    await userEvent.type(from, '2026-10-10');
    expect(
      within(dialog).getByText('The start date must be before the end date'),
    ).toBeInTheDocument();
    await userEvent.clear(from);
    await userEvent.type(from, '2026-10-01');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Download CSV' }));
    expect(await within(dialog).findByText('Too many rows')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Download CSV' }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(wallet.exportLedger).toHaveBeenLastCalledWith('2026-10-01', '2026-10-09');
    expect(createUrl).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:x');
    expect(await screen.findByText('Transactions downloaded')).toBeInTheDocument();
    click.mockRestore();
  });
});

const USAGE = (total = 5 * R): UsageSeries => ({
  from: '2026-10-01',
  to: '2026-10-09',
  timezone: 'Asia/Kolkata',
  series: [
    {
      date: '2026-10-05',
      callMicros: 2 * R,
      aiMicros: R,
      ttsMicros: 500_000,
      otherMicros: 0,
      whatsappMicros: 0,
      totalMicros: 3_500_000,
    },
    {
      date: '2026-10-06',
      callMicros: R,
      aiMicros: 500_000,
      ttsMicros: 0,
      otherMicros: 0,
      whatsappMicros: 0,
      totalMicros: 1_500_000,
    },
  ],
  totals: {
    callMicros: 3 * R,
    aiMicros: 1_500_000,
    ttsMicros: 500_000,
    otherMicros: 0,
    whatsappMicros: 0,
    totalMicros: total,
  },
});

describe('usage', () => {
  it('charts the month by default and switches presets', async () => {
    signInAs('viewer');
    wallet.usage.mockResolvedValue(USAGE());
    renderWithProviders({ route: '/wallet?tab=usage' });
    expect(await screen.findByTestId('usage-chart')).toBeInTheDocument();
    expect(wallet.usage).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-09' });
    expect(screen.getByText('₹5.00')).toBeInTheDocument();
    expect(screen.getByText('₹3.00')).toBeInTheDocument();
    const props = chartProps.last as {
      series: { dataKey: string; stack: string }[];
      dataset: unknown[];
    };
    expect(props.series.map((s) => [s.dataKey, s.stack])).toEqual([
      ['call', 'total'],
      ['ai', 'total'],
      ['tts', 'total'],
      ['whatsapp', 'total'],
    ]);
    expect(props.dataset[0]).toEqual({
      label: '05 Oct',
      call: 2 * R,
      ai: R,
      tts: 500_000,
      whatsapp: 0,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    await waitFor(() =>
      expect(wallet.usage).toHaveBeenLastCalledWith({ from: '2026-10-03', to: '2026-10-09' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Last 30 days' }));
    await waitFor(() =>
      expect(wallet.usage).toHaveBeenLastCalledWith({ from: '2026-09-10', to: '2026-10-09' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'This month' }));
    await waitFor(() =>
      expect(wallet.usage).toHaveBeenLastCalledWith({ from: '2026-10-01', to: '2026-10-09' }),
    );
  });

  it('shows the empty state, validates the range and retries', async () => {
    signInAs('viewer');
    wallet.usage
      .mockRejectedValueOnce(httpError(500, 'INTERNAL_ERROR', 'Usage down'))
      .mockResolvedValue(USAGE(0));
    renderWithProviders({ route: '/wallet?tab=usage' });
    expect(await screen.findByText('Usage down')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No usage in this period')).toBeInTheDocument();
    const from = screen.getByLabelText('From');
    await userEvent.clear(from);
    await userEvent.type(from, '2026-10-20');
    expect(screen.getByText('The start date must be before the end date')).toBeInTheDocument();
    await userEvent.clear(from);
    await userEvent.type(from, '2024-01-01');
    expect(screen.getByText('At most one year at a time')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('To'));
    expect(screen.getByText('Choose both dates')).toBeInTheDocument();
  });

  it('formats chart values as rupees', async () => {
    signInAs('viewer');
    wallet.usage.mockResolvedValue(USAGE());
    renderWithProviders({ route: '/wallet?tab=usage' });
    await screen.findByTestId('usage-chart');
    const props = chartProps.last as {
      yAxis: { valueFormatter: (v: number) => string }[];
      series: { valueFormatter: (v: number | null) => string }[];
    };
    expect(props.yAxis[0]?.valueFormatter(2_000_000)).toBe('₹2');
    expect(props.series[0]?.valueFormatter(2_500_000)).toBe('₹2.50');
    expect(props.series[0]?.valueFormatter(null)).toBe('');
  });

  it('maps API days to chart rows', () => {
    expect(usageDataset(USAGE().series).map((r) => r.label)).toEqual(['05 Oct', '06 Oct']);
  });
});

const INVOICE = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'i1',
  number: 'CAV/26-27/000001',
  fy: '26-27',
  status: 'ready',
  seller: { name: 'S', address: 'A', gstin: null, stateCode: '08' },
  buyer: {
    legalName: 'B',
    email: 'b@x.in',
    addressLine1: 'a',
    addressLine2: null,
    city: 'c',
    stateCode: '08',
    pin: '302001',
    gstin: null,
  },
  placeOfSupply: { stateCode: '08', stateName: 'Rajasthan' },
  sacCode: '998319',
  amounts: {
    baseMicros: 1000 * R,
    cgstMicros: 90 * R,
    sgstMicros: 90 * R,
    igstMicros: 0,
    taxMicros: 180 * R,
    totalMicros: 1180 * R,
  },
  paymentId: 'pay_1',
  topupOrderId: 't1',
  issuedAt: '2026-10-05T06:30:00Z',
  ...overrides,
});

describe('invoices', () => {
  it('lists invoices and downloads with a fresh link; preparing ones are disabled', async () => {
    signInAs('viewer');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    invoices.list.mockResolvedValue({
      success: true,
      data: [
        INVOICE(),
        INVOICE({ id: 'i2', number: 'CAV/26-27/000002', status: 'rendering' }),
        INVOICE({ id: 'i3', number: 'CAV/26-27/000003', status: 'failed' }),
      ],
      meta: { page: 1, limit: 20, total: 3, totalPages: 1 },
    });
    invoices.download.mockResolvedValueOnce({
      url: 'https://files/x.pdf?sig=1',
      expiresInSec: 900,
    });
    renderWithProviders({ route: '/wallet?tab=invoices' });
    const table = await screen.findByRole('table', { name: 'Invoices' });
    expect(await within(table).findAllByText('₹1,180.00')).toHaveLength(3);
    expect(within(table).getAllByText('₹180.00')).toHaveLength(3);
    expect(within(table).getByText('Preparing')).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Download CAV/26-27/000002' })).toBeDisabled();
    expect(within(table).getByRole('button', { name: 'Download CAV/26-27/000003' })).toBeDisabled();
    await userEvent.click(within(table).getByRole('button', { name: 'Download CAV/26-27/000001' }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith('https://files/x.pdf?sig=1', '_blank', 'noopener'),
    );
    invoices.download.mockRejectedValueOnce(
      httpError(409, 'CONFLICT_INVALID_STATE', 'The invoice PDF is not ready yet'),
    );
    await userEvent.click(within(table).getByRole('button', { name: 'Download CAV/26-27/000001' }));
    expect(await screen.findByText('The invoice PDF is not ready yet')).toBeInTheDocument();
    expect(invoices.download).toHaveBeenCalledTimes(2);
    open.mockRestore();
  });

  it('pages through invoices', async () => {
    signInAs('viewer');
    invoices.list.mockResolvedValue({
      success: true,
      data: [INVOICE()],
      meta: { page: 1, limit: 20, total: 45, totalPages: 3 },
    });
    renderWithProviders({ route: '/wallet?tab=invoices' });
    await screen.findAllByText('₹1,180.00');
    await userEvent.click(screen.getByRole('button', { name: /next page/i }));
    await waitFor(() => expect(invoices.list).toHaveBeenLastCalledWith({ page: 2, limit: 20 }));
    await userEvent.click(screen.getByRole('combobox', { name: /rows per page/i }));
    await userEvent.click(await screen.findByRole('option', { name: '50' }));
    await waitFor(() => expect(invoices.list).toHaveBeenLastCalledWith({ page: 1, limit: 50 }));
  });

  it('shows the empty state', async () => {
    signInAs('viewer');
    invoices.list.mockResolvedValue({
      success: true,
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    renderWithProviders({ route: '/wallet?tab=invoices' });
    expect(await screen.findByText('No invoices yet')).toBeInTheDocument();
  });
});

describe('settings → billing details', () => {
  beforeEach(() => {
    billing.states.mockResolvedValue([
      { code: '08', name: 'Rajasthan' },
      { code: '27', name: 'Maharashtra' },
    ]);
  });

  it('owners edit; a bad GSTIN and server field errors show on the field', async () => {
    signInAs('owner');
    billing.profile.mockResolvedValue({
      profile: {
        legalName: 'Demo',
        email: 'b@demo.in',
        addressLine1: 'MI Road',
        addressLine2: null,
        city: 'Jaipur',
        stateCode: '08',
        pin: '302001',
        gstin: null,
        updatedAt: '2026-10-01T00:00:00Z',
      },
      complete: true,
      sellerStateCode: '08',
    });
    billing.saveProfile.mockRejectedValueOnce(
      httpError(422, 'VALIDATION_FAILED', 'Invalid', [
        { path: 'body.gstin', message: 'GSTIN belongs to a different state' },
      ]),
    );
    renderWithProviders({ route: '/settings/billing' });
    const gstin = await screen.findByLabelText('GSTIN (optional)');
    await userEvent.type(gstin, '08ABCDE1234F1Z9');
    await userEvent.click(screen.getByRole('button', { name: 'Save billing details' }));
    expect(await screen.findByText(/check digit is wrong|Not a valid GSTIN/)).toBeInTheDocument();
    await userEvent.clear(gstin);
    await userEvent.click(screen.getByRole('button', { name: 'Save billing details' }));
    expect(await screen.findByText('GSTIN belongs to a different state')).toBeInTheDocument();
    billing.saveProfile.mockResolvedValue({
      profile: {
        legalName: 'Demo 2',
        email: 'b@demo.in',
        addressLine1: 'MI Road',
        addressLine2: null,
        city: 'Jaipur',
        stateCode: '08',
        pin: '302001',
        gstin: null,
        updatedAt: '2026-10-09T00:00:00Z',
      },
      complete: true,
      sellerStateCode: '08',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save billing details' }));
    expect(await screen.findByText('Billing details saved')).toBeInTheDocument();
  });

  it('is read-only for managers, hidden from agents, and retries a load error', async () => {
    signInAs('manager');
    billing.profile
      .mockRejectedValueOnce(httpError(500, 'INTERNAL_ERROR', 'Profile down'))
      .mockResolvedValue({ profile: null, complete: false, sellerStateCode: '08' });
    const view = renderWithProviders({ route: '/settings/billing' });
    expect(await screen.findByText('Profile down')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByText('Only the owner and admins can change billing details.'),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText('City')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save billing details' })).not.toBeInTheDocument();
    view.unmount();
    signInAs('agent');
    renderWithProviders({ route: '/settings/billing' });
    expect(await screen.findByRole('heading', { level: 1, name: '403' })).toBeInTheDocument();
  });

  it('shows a server error that is not about a field', async () => {
    signInAs('owner');
    billing.profile.mockResolvedValue({ profile: null, complete: false, sellerStateCode: '08' });
    billing.states.mockRejectedValue(httpError(500, 'INTERNAL_ERROR'));
    billing.saveProfile.mockRejectedValue(
      httpError(403, 'AUTH_IMPERSONATION_BLOCKED', 'Not while viewing as a user'),
    );
    renderWithProviders({ route: '/settings/billing' });
    expect(await screen.findByText('Could not load the state list')).toBeInTheDocument();
  });
});
