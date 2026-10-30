import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ledgerDescription } from '@/features/wallet/ledger-format';
import { WhatsAppCallPrices } from '@/features/wallet/WhatsAppCallPrices';
import { CallingRatesTab } from '@/features/whatsapp-billing/CallingRatesTab';
import { MarginTab } from '@/features/whatsapp-billing/ReportsTabs';
import { SettingsTab } from '@/features/whatsapp-billing/SettingsTab';
import { adminWhatsappBillingApi } from '@/services/api/admin-whatsapp-billing';
import { callsApi } from '@/services/api/calls';
import { campaignsApi } from '@/services/api/campaigns';
import { signInAs } from '@/test/auth';
import { fakeEvents, fakeTranscript } from '@/test/calls';
import { fakeWaCall } from '@/test/calls-wa';
import { renderWithProviders } from '@/test/render';
import { fakeMarginRow, fakeRateCard } from '@/test/templates';

vi.mock('@/services/api/calls', () => ({
  callsApi: {
    list: vi.fn(),
    get: vi.fn(),
    transcript: vi.fn(),
    events: vi.fn(),
    recording: vi.fn(),
    hangup: vi.fn(),
    active: vi.fn(),
  },
}));
vi.mock('@/services/api/campaigns', () => ({ campaignsApi: { list: vi.fn() } }));
vi.mock('@/services/api/admin-whatsapp-billing', () => ({
  adminWhatsappBillingApi: {
    callingRates: vi.fn(),
    importCallingRates: vi.fn(),
    saveRates: vi.fn(),
    settings: vi.fn(),
    updateSettings: vi.fn(),
    margin: vi.fn(),
    marginCsv: vi.fn(),
  },
}));
const calls = vi.mocked(callsApi);
const admin = vi.mocked(adminWhatsappBillingApi);
const page = (data: unknown[]) => ({
  success: true as const,
  data,
  meta: { hasMore: false, nextCursor: null },
});
const IN = {
  market: 'IN',
  label: 'India',
  callingCodes: ['91'],
  perMinuteMicros: 388_500,
  tiers: [{ fromMinutes: 50_000, perMinuteMicros: 360_000 }],
};
const OTHER = {
  market: 'OTHER',
  label: 'Other',
  callingCodes: [],
  perMinuteMicros: 1_000_000,
  tiers: [],
};
const callingCard = (over = {}) => ({
  ...fakeRateCard(),
  kind: 'calling' as const,
  markets: [],
  callingMarkets: [IN, OTHER],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  calls.list.mockResolvedValue(page([]) as never);
  calls.get.mockResolvedValue(fakeWaCall('completed', 'human', 'inbound'));
  calls.transcript.mockResolvedValue(fakeTranscript());
  calls.events.mockResolvedValue(fakeEvents());
  vi.mocked(campaignsApi.list).mockResolvedValue(page([]) as never);
});

describe('calls pages: WhatsApp calls', () => {
  it('list: WhatsApp badge, type column; WhatsApp filters go to the API', async () => {
    signInAs('agent');
    calls.list.mockResolvedValue(
      page([
        fakeWaCall('completed', 'human', 'inbound'),
        fakeWaCall('completed', 'ai', 'outbound', { id: 'wc2' }),
      ]) as never,
    );
    renderWithProviders({ route: '/calls?provider=whatsapp' });
    const table = await screen.findByRole('table', { name: 'Calls' });
    expect(await within(table).findAllByText('WhatsApp')).toHaveLength(2);
    expect(within(table).getByText('Incoming · Team member')).toBeInTheDocument();
    expect(within(table).getByText('Outgoing · AI')).toBeInTheDocument();
    expect(within(table).getByText('Team member')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Direction' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Incoming' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Answered by' }));
    await userEvent.click(await screen.findByRole('option', { name: 'AI' }));
    await waitFor(() =>
      expect(calls.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ provider: 'whatsapp', direction: 'inbound', mode: 'ai' }),
      ),
    );
  });

  it('list: the WhatsApp filters only show for WhatsApp', async () => {
    signInAs('agent');
    renderWithProviders({ route: '/calls' });
    await screen.findByRole('table', { name: 'Calls' });
    expect(screen.queryByRole('combobox', { name: 'Direction' })).not.toBeInTheDocument();
  });

  it('detail: WhatsApp section with direction, who answered, Meta timeline; free incoming call', async () => {
    signInAs('owner');
    calls.get.mockResolvedValue(
      fakeWaCall('completed', 'human', 'inbound', {
        cost: {
          telephonyMicros: 0,
          aiMicros: 0,
          ttsMicros: 0,
          commissionMicros: 0,
          totalMicros: 0,
        },
      }),
    );
    renderWithProviders({ route: '/calls/wc1' });
    const wa = await screen.findByRole('region', { name: 'WhatsApp' });
    expect(within(wa).getByText('The customer called')).toBeInTheDocument();
    expect(within(wa).getByText('Team member')).toBeInTheDocument();
    expect(within(wa).getByText('134 s (charged in 6-second steps)')).toBeInTheDocument();
    expect(within(wa).getByRole('link', { name: 'Open the chat' })).toHaveAttribute(
      'href',
      '/inbox/cv1',
    );
    expect(
      within(within(wa).getByRole('list', { name: 'WhatsApp timeline' })).getByText(
        'WhatsApp connected the call',
      ),
    ).toBeInTheDocument();
    const cost = screen.getByRole('region', { name: 'Cost' });
    expect(within(cost).getByText('Free (the customer called)')).toBeInTheDocument();
    expect(within(cost).queryByText('Phone line')).not.toBeInTheDocument();
  });
});

describe('wallet', () => {
  it('ledger line "WhatsApp call · India · 2:14" and the call price table', () => {
    expect(
      ledgerDescription({
        type: 'whatsapp_call_charge',
        description: 'x',
        breakdown: { waMarket: 'IN', durationSec: 134 },
      }),
    ).toBe('WhatsApp call · India · 2:14');
    expect(
      ledgerDescription({ type: 'whatsapp_call_charge', description: 'x', breakdown: null }),
    ).toBe('WhatsApp call');
    renderWithProviders({
      routes: [
        {
          path: '/',
          element: (
            <WhatsAppCallPrices
              prices={{
                payer: 'platform',
                pulseSec: 6,
                markets: [{ market: 'IN', label: 'India', perMinuteMicros: 450_000 }],
              }}
            />
          ),
        },
      ],
    });
    const table = screen.getByRole('table', { name: 'WhatsApp call prices' });
    expect(within(table).getByText('₹0.45')).toBeInTheDocument();
    expect(screen.getByText(/6-second steps/)).toBeInTheDocument();
  });
});

describe('superadmin: calling rates, call settings, margin rows', () => {
  beforeEach(() => signInAs('superadmin'));

  it('calling card: current table, CSV import → errors / diff → save; edit one market', async () => {
    admin.callingRates.mockResolvedValue({
      current: callingCard(),
      scheduled: [],
      history: [
        {
          id: 'rc1',
          effectiveFrom: '2026-10-01T00:00:00.000Z',
          source: 'manual',
          note: null,
          markets: 2,
        },
      ],
    });
    admin.importCallingRates
      .mockResolvedValueOnce({
        markets: [],
        callingMarkets: [],
        errors: [{ row: 2, message: 'Only INR rate cards can be imported' }],
        diff: null,
      })
      .mockResolvedValueOnce({
        markets: [],
        callingMarkets: [{ ...IN, perMinuteMicros: 500_000 }, OTHER],
        errors: [],
        diff: {
          added: [],
          removed: [],
          changed: [
            { market: 'IN', field: 'perMinuteMicros', fromMicros: 388_500, toMicros: 500_000 },
          ],
        },
      });
    admin.saveRates.mockResolvedValue(callingCard());
    renderWithProviders({ routes: [{ path: '/', element: <CallingRatesTab /> }] });
    const current = await screen.findByRole('table', { name: 'Current calling rates' });
    expect(within(current).getByText('₹0.3885')).toBeInTheDocument();
    expect(within(current).getByText('50,000+ min: ₹0.36')).toBeInTheDocument();
    const input = screen.getByLabelText('Calling rate card CSV');
    await userEvent.upload(input, new File(['x'], 'bad.csv', { type: 'text/csv' }));
    expect(
      await screen.findByText('Row 2: Only INR rate cards can be imported'),
    ).toBeInTheDocument();
    await userEvent.upload(input, new File(['x'], 'calls.csv', { type: 'text/csv' }));
    expect(await screen.findByText('IN: ₹0.3885 → ₹0.50 a minute')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save calling rates' }));
    await waitFor(() =>
      expect(admin.saveRates).toHaveBeenCalledWith({
        kind: 'calling',
        callingMarkets: [{ ...IN, perMinuteMicros: 500_000 }, OTHER],
        source: 'meta_csv',
        note: null,
      }),
    );
    await userEvent.click(within(current).getByRole('button', { name: 'Edit India' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit India' });
    const field = within(dialog).getByRole('textbox', { name: 'Per minute (₹)' });
    await userEvent.clear(field);
    await userEvent.type(field, 'abc');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.clear(field);
    await userEvent.type(field, '0.42');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(admin.saveRates).toHaveBeenLastCalledWith({
        kind: 'calling',
        callingMarkets: [{ ...IN, perMinuteMicros: 420_000 }, OTHER],
        source: 'manual',
        note: 'Edited India',
      }),
    );
  });

  it('call price settings save inside the billing settings', async () => {
    const view = {
      settings: { markupBps: 1500, platformFeeMicros: 0, holdMaxAgeHours: 72 },
      defaults: { markupBps: 1500, platformFeeMicros: 0, holdMaxAgeHours: 72 },
      nonInrPlatformChannels: [],
      calling: {
        markupBps: 1500,
        platformFeePerMinuteMicros: 0,
        holdMinutes: 5,
        holdExtendMinutes: 5,
      },
      callingDefaults: {
        markupBps: 1500,
        platformFeePerMinuteMicros: 0,
        holdMinutes: 5,
        holdExtendMinutes: 5,
      },
    };
    admin.settings.mockResolvedValue(view);
    admin.updateSettings.mockResolvedValue(view);
    renderWithProviders({ routes: [{ path: '/', element: <SettingsTab /> }] });
    const form = await screen.findByRole('form', { name: 'WhatsApp call price settings' });
    const markup = within(form).getByRole('textbox', {
      name: "Markup on Meta's per-minute rate (%)",
    });
    await userEvent.clear(markup);
    await userEvent.type(markup, '20');
    const hold = within(form).getByRole('textbox', { name: 'Hold at dial (minutes)' });
    await userEvent.clear(hold);
    await userEvent.type(hold, '99');
    await userEvent.click(within(form).getByRole('button', { name: 'Save call settings' }));
    expect(within(form).getAllByText('Between 1 and 60')).toHaveLength(1);
    expect(admin.updateSettings).not.toHaveBeenCalled();
    await userEvent.clear(hold);
    await userEvent.type(hold, '3');
    await userEvent.click(within(form).getByRole('button', { name: 'Save call settings' }));
    await waitFor(() =>
      expect(admin.updateSettings).toHaveBeenCalledWith({
        calling: {
          markupBps: 2000,
          platformFeePerMinuteMicros: 0,
          holdMinutes: 3,
          holdExtendMinutes: 5,
        },
      }),
    );
  });

  it('margin rows for calls', async () => {
    admin.margin.mockResolvedValue([
      fakeMarginRow(),
      fakeMarginRow({
        kind: 'call',
        category: 'call',
        messages: 3,
        billedMicros: 90_000,
        metaCostMicros: 77_700,
      }),
    ]);
    renderWithProviders({ routes: [{ path: '/', element: <MarginTab /> }] });
    const table = await screen.findByRole('table', { name: 'WhatsApp margin' });
    expect(within(table).getByText('WhatsApp calls')).toBeInTheDocument();
    expect(within(table).getByText('utility')).toBeInTheDocument();
  });
});
