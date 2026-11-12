import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WhatsAppCard } from '@/features/admin/WhatsAppCard';
import { adminWhatsappApi } from '@/services/api/admin-whatsapp';
import { ApiError } from '@/services/api/errors';
import type { AdminAccountDetail } from '@/services/api/types';
import { fakeSession, signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';
import { fakeRetention } from '@/test/retention';
import { fakeAdminWhatsAppRow, fakeAdminWhatsAppStatus, fakeChannel } from '@/test/whatsapp';

import { managedNumberProblems } from './managed-number';

vi.mock('@/services/api/admin-whatsapp', () => ({
  adminWhatsappApi: {
    status: vi.fn(),
    events: vi.fn(),
    replay: vi.fn(),
    disconnect: vi.fn(),
    setBilling: vi.fn(),
    manualConnect: vi.fn(),
    addManagedNumber: vi.fn(),
    replaceManagedKey: vi.fn(),
    resetManagedWebhook: vi.fn(),
    setManagedCreditLine: vi.fn(),
  },
}));

const admin = vi.mocked(adminWhatsappApi);
const routes = (element: ReactNode) => [{ path: '/', element }];
const httpError = (status: number, code: string, message = 'Server said no') =>
  new ApiError({ status, code, message, kind: 'http' });

const KEY = 'pin_live_secret_key_123456';
const base = fakeSession('owner');
const detail = (rows = [fakeAdminWhatsAppRow()]): AdminAccountDetail => ({
  account: { ...base.account, id: 'acc1' },
  owner: base.user as AdminAccountDetail['owner'],
  usersCount: 1,
  apiLimits: null,
  voiceLine: 'dryrun',
  phoneLine: { server: 'dryrun', connected: false },
  sipSettings: { pulseSec: null, spendMinutesPerHour: null },
  voiceApi: {
    enabled: false,
    ivrIds: [],
    ivrEstimateSec: 60,
    credentials: {
      mode: 'platform',
      tokenHint: null,
      callerId: null,
      verifiedAt: null,
      webhookRegisteredAt: null,
      checkError: null,
    },
  },
  usersByStatus: { active: 1, invited: 0, disabled: 0 },
  retention: fakeRetention(),
  limits: { maxConcurrentCalls: 10, dialsPerMinute: 60 },
  activeCampaigns: 0,
  adminPausedCampaigns: [],
  whatsappBilling: {
    metaPayer: 'platform',
    markupBps: null,
    fixedPrices: null,
    platformFeeMicros: null,
  },
  whatsappChannels: rows,
  recentAudit: [],
});

const pinnacleOn = (enabled = true) =>
  admin.status.mockResolvedValue(
    fakeAdminWhatsAppStatus({
      pinnacle: {
        enabled,
        baseUrl: 'https://partnersv1.pinbot.ai',
        voiceBaseUrl: 'https://partnersv1.pinbot.ai',
      },
    }),
  );

const managedRow = fakeAdminWhatsAppRow({
  id: 'wa9',
  label: 'Managed line',
  provider: 'pinnacle',
  managed: true,
  creditLineStatus: 'partner_pending',
  pinnacle: {
    keyLast4: '3456',
    webhookUrl: 'https://api.example.test/api/v1/webhooks/pinnacle/wa9',
    webhookSetAt: '2026-11-12T08:00:00.000Z',
    keyCheckedAt: '2026-11-12T09:00:00.000Z',
    lastBalanceErrorAt: new Date().toISOString(),
  },
});

beforeEach(() => {
  for (const fn of Object.values(admin)) fn.mockReset();
  signInAs('superadmin');
});

describe('managedNumberProblems', () => {
  it('needs a label, digit ids and a key without spaces', () => {
    expect(
      managedNumberProblems({
        label: ' ',
        wabaId: '12a',
        phoneNumberId: '',
        apiKey: 'short',
        creditLine: 'partner_pending',
      }),
    ).toEqual({
      label: 'Enter a label',
      wabaId: 'Digits only',
      phoneNumberId: 'Digits only',
      apiKey: 'At least 8 characters, no spaces',
    });
    expect(
      managedNumberProblems({
        label: 'x',
        wabaId: '1',
        phoneNumberId: '2',
        apiKey: KEY,
        creditLine: 'partner_active',
      }),
    ).toEqual({});
  });
});

describe('Add managed number (superadmin, PN-T10)', () => {
  it('the button shows only when the server has managed numbers on', async () => {
    pinnacleOn(false);
    const { unmount } = renderWithProviders({ routes: routes(<WhatsAppCard detail={detail()} />) });
    expect(await screen.findByRole('button', { name: 'Manual connect' })).toBeInTheDocument();
    await waitFor(() => expect(admin.status).toHaveBeenCalled());
    expect(
      screen.queryByRole('button', { name: 'Add managed number (Pinnacle)' }),
    ).not.toBeInTheDocument();
    unmount();
    pinnacleOn(true);
    renderWithProviders({ routes: routes(<WhatsAppCard detail={detail()} />) });
    expect(
      await screen.findByRole('button', { name: 'Add managed number (Pinnacle)' }),
    ).toBeInTheDocument();
  });

  it('validates, shows each server error, submits and never keeps the key', async () => {
    pinnacleOn();
    admin.addManagedNumber
      .mockRejectedValueOnce(httpError(422, 'PINNACLE_KEY_INVALID'))
      .mockRejectedValueOnce(httpError(422, 'PINNACLE_NUMBER_NOT_ON_KEY'))
      .mockRejectedValueOnce(httpError(502, 'PINNACLE_WEBHOOK_NOT_SET'))
      .mockRejectedValueOnce(httpError(409, 'WHATSAPP_NUMBER_IN_USE'))
      .mockResolvedValueOnce({
        channel: fakeChannel({
          provider: 'pinnacle',
          managed: true,
          status: 'action_needed',
          statusReason: {
            code: 'partner_credit_line_pending',
            message: 'Billing for this number is being activated at the partner.',
            step: null,
          },
        }),
        outcome: 'action_needed',
        reconnected: false,
      });
    renderWithProviders({ routes: routes(<WhatsAppCard detail={detail([])} />) });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add managed number (Pinnacle)' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Add managed number' });
    expect(within(dialog).getByText(/Manage API Keys/)).toBeInTheDocument();
    const submit = within(dialog).getByRole('button', { name: 'Add number' });
    await userEvent.click(submit);
    expect(within(dialog).getByText('Enter a label')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Digits only')).toHaveLength(2);
    expect(admin.addManagedNumber).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText('Label'), 'Managed line');
    await userEvent.type(within(dialog).getByLabelText('WABA ID'), '922498337028205');
    await userEvent.type(within(dialog).getByLabelText('Phone number ID'), '1374543377278274');
    const key = within(dialog).getByLabelText('API key');
    expect(key).toHaveAttribute('type', 'password');
    expect(key).toHaveAttribute('autocomplete', 'off');
    await userEvent.type(key, KEY);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Show API key' }));
    expect(key).toHaveAttribute('type', 'text');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hide API key' }));

    for (const message of [
      'The API key was rejected by the partner.',
      "This API key doesn't include that phone number ID / WABA ID.",
      "The partner didn't accept our webhook — try again or contact the partner.",
      'This number is already connected to another account.',
    ]) {
      await userEvent.click(submit);
      expect(await within(dialog).findByText(message)).toBeInTheDocument();
    }
    await userEvent.click(submit);
    expect(await screen.findByText(/Managed number added — Billing/)).toBeInTheDocument();
    expect(admin.addManagedNumber).toHaveBeenLastCalledWith('acc1', {
      label: 'Managed line',
      wabaId: '922498337028205',
      phoneNumberId: '1374543377278274',
      apiKey: KEY,
      creditLine: 'partner_pending',
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add managed number' })).not.toBeInTheDocument(),
    );
    expect(document.body.innerHTML).not.toContain(KEY);
  });

  it('credit line Active is sent when chosen; managed off on the server → message', async () => {
    pinnacleOn();
    admin.addManagedNumber.mockRejectedValueOnce(httpError(503, 'WA_PROVIDER_NOT_CONFIGURED'));
    renderWithProviders({ routes: routes(<WhatsAppCard detail={detail([])} />) });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add managed number (Pinnacle)' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Add managed number' });
    await userEvent.type(within(dialog).getByLabelText('Label'), 'L');
    await userEvent.type(within(dialog).getByLabelText('WABA ID'), '1');
    await userEvent.type(within(dialog).getByLabelText('Phone number ID'), '2');
    await userEvent.type(within(dialog).getByLabelText('API key'), KEY);
    await userEvent.click(within(dialog).getByLabelText(/Active \(approved/));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add number' }));
    expect(
      await within(dialog).findByText('Managed numbers are turned off on this server.'),
    ).toBeInTheDocument();
    expect(admin.addManagedNumber.mock.calls[0]?.[1]).toMatchObject({
      creditLine: 'partner_active',
    });
  });
});

describe('managed number row (superadmin)', () => {
  it('badge, key last 4, webhook time, balance warning and partner credit line', async () => {
    pinnacleOn();
    renderWithProviders({ routes: routes(<WhatsAppCard detail={detail([managedRow])} />) });
    const table = await screen.findByRole('table', { name: 'WhatsApp numbers' });
    expect(within(table).getByText('Managed')).toBeInTheDocument();
    expect(within(table).getByText(/Key ••••3456/)).toBeInTheDocument();
    expect(within(table).getByText(/Partner balance low/)).toBeInTheDocument();
    expect(within(table).getByText('Partner credit line (requested)')).toBeInTheDocument();
  });

  it('replace key, reset webhook, credit line (Active needs a confirm)', async () => {
    pinnacleOn();
    admin.replaceManagedKey
      .mockRejectedValueOnce(httpError(422, 'PINNACLE_KEY_INVALID'))
      .mockResolvedValueOnce(fakeChannel());
    admin.resetManagedWebhook.mockResolvedValueOnce(fakeChannel());
    admin.setManagedCreditLine.mockResolvedValue(fakeChannel());
    renderWithProviders({ routes: routes(<WhatsAppCard detail={detail([managedRow])} />) });
    const table = await screen.findByRole('table', { name: 'WhatsApp numbers' });

    await userEvent.click(within(table).getByRole('button', { name: 'Replace API key' }));
    const dialog = await screen.findByRole('dialog', { name: 'Replace API key — Managed line' });
    const go = within(dialog).getByRole('button', { name: 'Replace key' });
    expect(go).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('New API key'), 'pin_new_key_987654');
    await userEvent.click(go);
    expect(
      await within(dialog).findByText('The API key was rejected by the partner.'),
    ).toBeInTheDocument();
    await userEvent.click(go);
    expect(await screen.findByText('API key replaced')).toBeInTheDocument();
    expect(admin.replaceManagedKey).toHaveBeenLastCalledWith('wa9', 'pin_new_key_987654');

    await userEvent.click(within(table).getByRole('button', { name: 'Reset webhook' }));
    expect(await screen.findByText('Webhook set again at the partner')).toBeInTheDocument();
    expect(admin.resetManagedWebhook).toHaveBeenCalledWith('wa9');

    await userEvent.click(
      within(table).getByRole('button', { name: 'Credit line: set to Active' }),
    );
    const confirm = await screen.findByRole('dialog', { name: 'Credit line active?' });
    expect(
      within(confirm).getByText(/Only switch to Active after the partner approved/),
    ).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole('button', { name: 'It is active' }));
    await waitFor(() =>
      expect(admin.setManagedCreditLine).toHaveBeenCalledWith('wa9', 'partner_active'),
    );
  });

  it('Meta numbers show no managed controls', async () => {
    pinnacleOn();
    renderWithProviders({ routes: routes(<WhatsAppCard detail={detail()} />) });
    const table = await screen.findByRole('table', { name: 'WhatsApp numbers' });
    expect(within(table).queryByText('Managed')).not.toBeInTheDocument();
    expect(
      within(table).queryByRole('button', { name: 'Replace API key' }),
    ).not.toBeInTheDocument();
  });
});
