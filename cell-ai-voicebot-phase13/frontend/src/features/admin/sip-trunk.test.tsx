import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as SipTrunksModule from '@/services/api/sip-trunks';
import { sipTrunksApi, type SipTrunkView } from '@/services/api/sip-trunks';
import type * as VoiceApiModule from '@/services/api/voice-api';
import { voiceAdminApi } from '@/services/api/voice-api';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

import { SipTrunkCard } from './SipTrunkCard';

/** Superadmin: an account's own SIP trunk, entered in the app (no env change). */

vi.mock('@/services/api/sip-trunks', async (importOriginal) => ({
  ...(await importOriginal<typeof SipTrunksModule>()),
  sipTrunksApi: { get: vi.fn(), save: vi.fn(), remove: vi.fn() },
}));
vi.mock('@/services/api/voice-api', async (importOriginal) => ({
  ...(await importOriginal<typeof VoiceApiModule>()),
  voiceAdminApi: { setAccount: vi.fn(), setCredentials: vi.fn(), registerAccountWebhook: vi.fn() },
}));
const voice = vi.mocked(voiceAdminApi);
const api = vi.mocked(sipTrunksApi);
const empty: SipTrunkView = { configured: false, trunk: null, state: null, lineConnected: true };

const show = () =>
  renderWithProviders({ routes: [{ path: '/', element: <SipTrunkCard accountId="acc1" /> }] });

beforeEach(() => {
  vi.clearAllMocks();
  signInAs('owner');
  api.get.mockResolvedValue(empty);
  api.save.mockResolvedValue({ ...empty, configured: true, state: 'not_loaded' });
});

describe('SIP trunk card', () => {
  it('checks the fields, then saves the carrier login', { timeout: 60_000 }, async () => {
    show();
    const card = await screen.findByRole('region', { name: 'SIP trunk' });
    // the card loads the saved trunk first
    await userEvent.click(await within(card).findByRole('button', { name: 'Save and connect' }));
    expect(api.save).not.toHaveBeenCalled();
    expect(within(card).getByText('Enter the username the carrier gave')).toBeInTheDocument();
    await userEvent.type(within(card).getByLabelText('SIP server (host)'), 'sip.carrier.in');
    await userEvent.type(within(card).getByLabelText('Username'), 'acme01');
    await userEvent.type(within(card).getByLabelText('Password'), 'secret-1');
    await userEvent.type(
      within(card).getByLabelText('Caller ID (number customers see)'),
      '+911600000001',
    );
    await userEvent.click(within(card).getByRole('button', { name: 'Save and connect' }));
    await waitFor(() =>
      expect(api.save).toHaveBeenCalledWith('acc1', {
        host: 'sip.carrier.in',
        port: 5060,
        transport: 'udp',
        auth: 'register',
        username: 'acme01',
        password: 'secret-1',
        trunkIps: [],
        callerId: '+911600000001',
        codecs: ['ulaw', 'alaw'],
      }),
    );
  });

  it('a saved trunk shows its state and can be removed', async () => {
    api.get.mockResolvedValue({
      configured: true,
      state: 'online',
      lineConnected: true,
      trunk: {
        host: '203.0.113.20',
        port: 5060,
        transport: 'udp',
        auth: 'ip',
        username: null,
        passwordSet: false,
        trunkIps: [],
        callerId: '+911600000001',
        codecs: ['ulaw', 'alaw'],
        updatedAt: '2026-11-07T06:00:00Z',
      },
    });
    api.remove.mockResolvedValue(empty);
    show();
    const card = await screen.findByRole('region', { name: 'SIP trunk' });
    expect(await within(card).findByText('Connected')).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Remove trunk' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('acc1'));
  });

  it('Cell24x7 API key: paste the key → recorded voice on, key saved, webhook registered', async () => {
    const creds = {
      mode: 'own' as const,
      tokenHint: '9876',
      callerId: null,
      verifiedAt: '2026-11-08T06:00:00Z',
      webhookRegisteredAt: null,
    };
    voice.setAccount.mockResolvedValue({ enabled: true, ivrIds: [], ivrEstimateSec: 60 });
    voice.setCredentials.mockResolvedValue(creds);
    voice.registerAccountWebhook.mockResolvedValue({
      ...creds,
      webhookRegisteredAt: '2026-11-08T06:00:01Z',
    });
    show();
    const card = await screen.findByRole('region', { name: 'SIP trunk' });
    await userEvent.click(await within(card).findByDisplayValue('apikey'));
    expect(within(card).getByText(/the AI cannot talk on these calls/)).toBeInTheDocument();
    expect(within(card).queryByLabelText('SIP server (host)')).not.toBeInTheDocument();
    await userEvent.type(within(card).getByLabelText('Cell24x7 API key'), 'cell-key-9876');
    await userEvent.click(within(card).getByRole('button', { name: 'Save and connect' }));
    await waitFor(() => expect(voice.registerAccountWebhook).toHaveBeenCalledWith('acc1'));
    expect(voice.setAccount).toHaveBeenCalledWith('acc1', { enabled: true });
    expect(voice.setCredentials).toHaveBeenCalledWith('acc1', {
      mode: 'own',
      token: 'cell-key-9876',
      callerId: null,
    });
  }, 60_000);
});
