import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WhatsAppCard } from '@/features/admin/WhatsAppCard';
import { NotificationsBell } from '@/features/notifications/NotificationsBell';
import { AccountWhatsAppBillingCard } from '@/features/whatsapp-billing/AccountWhatsAppBillingCard';
import { adminWhatsappApi } from '@/services/api/admin-whatsapp';
import { callsApi } from '@/services/api/calls';
import { ApiError } from '@/services/api/errors';
import { notificationsApi } from '@/services/api/notifications';
import type { AdminAccountDetail, WhatsAppChannel } from '@/services/api/types';
import { whatsappApi } from '@/services/api/whatsapp';
import { fakeSession, signInAs } from '@/test/auth';
import { fakeWaCall } from '@/test/calls-wa';
import { renderWithProviders } from '@/test/render';
import { fakeAdminWhatsAppStatus, fakeChannel, fakeWhatsAppConfig } from '@/test/whatsapp';

import { WhatsAppDashboardCard } from './WhatsAppDashboardCard';

vi.mock('@/services/api/admin-whatsapp', () => ({
  adminWhatsappApi: {
    status: vi.fn(),
    events: vi.fn(),
    replay: vi.fn(),
    disconnect: vi.fn(),
    setBilling: vi.fn(),
    manualConnect: vi.fn(),
  },
}));
vi.mock('@/services/api/whatsapp', () => ({
  SIMULATOR_KINDS: [],
  whatsappApi: { config: vi.fn(), channels: vi.fn() },
}));
vi.mock('@/services/api/calls', () => ({ callsApi: { list: vi.fn() } }));
vi.mock('@/services/api/notifications', () => ({
  notificationsApi: {
    unreadCount: vi.fn(),
    list: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

const admin = vi.mocked(adminWhatsappApi);
const wa = vi.mocked(whatsappApi);
const routes = (element: ReactNode) => [
  { path: '/', element },
  { path: '/whatsapp/numbers', element: <div>numbers page</div> },
];
const httpError = (status: number, code: string, message = 'Server said no') =>
  new ApiError({ status, code, message, kind: 'http' });

const base = fakeSession('owner');
const detail = (over: Partial<AdminAccountDetail> = {}): AdminAccountDetail => ({
  account: { ...base.account, id: 'acc1' },
  owner: base.user as AdminAccountDetail['owner'],
  usersCount: 1,
  usersByStatus: { active: 1, invited: 0, disabled: 0 },
  limits: { maxConcurrentCalls: 10, dialsPerMinute: 60 },
  activeCampaigns: 0,
  adminPausedCampaigns: [],
  whatsappBilling: {
    metaPayer: 'platform',
    markupBps: null,
    fixedPrices: null,
    platformFeeMicros: null,
  },
  whatsappChannels: [
    {
      id: 'wa1',
      label: 'Support line',
      status: 'connected',
      mode: 'cloud_api',
      displayPhoneNumber: '+91 90000 12345',
      verifiedName: 'Test Business',
      qualityRating: 'GREEN',
      messagingLimitTier: 'TIER_1K',
      metaPayer: 'platform',
      creditLineStatus: 'attached',
      connectedAt: '2026-10-22T08:00:00.000Z',
    },
    {
      id: 'wa2',
      label: 'Old line',
      status: 'disconnected',
      mode: 'cloud_api',
      displayPhoneNumber: null,
      verifiedName: null,
      qualityRating: 'UNKNOWN',
      messagingLimitTier: null,
      metaPayer: 'customer',
      creditLineStatus: 'not_needed',
      connectedAt: null,
    },
  ],
  recentAudit: [],
  ...over,
});

beforeEach(() => {
  for (const fn of Object.values(admin)) fn.mockReset();
  wa.config.mockReset().mockResolvedValue(fakeWhatsAppConfig());
  wa.channels.mockReset();
});

describe('superadmin WhatsApp card', () => {
  it('lists numbers; force disconnect needs a reason', async () => {
    signInAs('superadmin');
    admin.disconnect
      .mockRejectedValueOnce(httpError(404, 'RESOURCE_NOT_FOUND', 'Gone'))
      .mockResolvedValueOnce(fakeChannel());
    renderWithProviders({ routes: routes(<WhatsAppCard detail={detail()} />) });
    const table = await screen.findByRole('table', { name: 'WhatsApp numbers' });
    expect(within(table).getByText('Support line · +91 90000 12345')).toBeInTheDocument();
    expect(within(table).getByText('Old line · —')).toBeInTheDocument();
    expect(within(table).getByText('Platform credit line (attached)')).toBeInTheDocument();
    expect(within(table).getAllByRole('button', { name: 'Force disconnect' })).toHaveLength(1);
    await userEvent.click(within(table).getByRole('button', { name: 'Force disconnect' }));
    const dialog = await screen.findByRole('dialog', { name: 'Force disconnect Support line' });
    const go = within(dialog).getByRole('button', { name: 'Disconnect' });
    expect(go).toBeDisabled();
    await userEvent.type(
      within(dialog).getByLabelText('Reason (sent to the account owners)'),
      'Spam complaints',
    );
    await userEvent.click(go);
    expect(await within(dialog).findByText('Gone')).toBeInTheDocument();
    await userEvent.click(go);
    expect(await screen.findByText(/the account owners were told why/)).toBeInTheDocument();
    expect(admin.disconnect).toHaveBeenLastCalledWith('wa1', 'Spam complaints');
  });

  it('force disconnect can be cancelled', async () => {
    signInAs('superadmin');
    renderWithProviders({ routes: routes(<WhatsAppCard detail={detail()} />) });
    await userEvent.click(await screen.findByRole('button', { name: 'Force disconnect' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('manual connect: fields, token never echoed, outcomes and errors', async () => {
    signInAs('superadmin');
    admin.manualConnect
      .mockRejectedValueOnce(
        httpError(422, 'WHATSAPP_SIGNUP_FAILED', 'No WhatsApp Business Account was shared.'),
      )
      .mockResolvedValueOnce({
        channel: fakeChannel({
          statusReason: { code: 'x', message: 'Add a number', step: 'phone' },
        }),
        outcome: 'action_needed',
        reconnected: false,
      })
      .mockResolvedValueOnce({ channel: fakeChannel(), outcome: 'connected', reconnected: false });
    renderWithProviders({
      routes: routes(<WhatsAppCard detail={detail({ whatsappChannels: [] })} />),
    });
    expect(await screen.findByText('No WhatsApp numbers')).toBeInTheDocument();
    const openDialog = async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Manual connect' }));
      return screen.findByRole('dialog', { name: 'Manual connect' });
    };
    let dialog = await openDialog();
    const connect = within(dialog).getByRole('button', { name: 'Connect' });
    expect(connect).toBeDisabled();
    await userEvent.type(
      within(dialog).getByLabelText('WhatsApp account id (WABA id)'),
      '102290129340398',
    );
    await userEvent.type(within(dialog).getByLabelText('Phone number id'), '106540352242922');
    const token = within(dialog).getByLabelText('Access token');
    expect(token).toHaveAttribute('type', 'password');
    await userEvent.type(token, 'EAAG-test-system-user-token');
    await userEvent.click(connect);
    expect(
      await within(dialog).findByText('No WhatsApp Business Account was shared.'),
    ).toBeInTheDocument();
    await userEvent.click(connect);
    expect(await screen.findByText('Saved — Add a number')).toBeInTheDocument();
    expect(admin.manualConnect).toHaveBeenCalledWith('acc1', {
      wabaId: '102290129340398',
      phoneNumberId: '106540352242922',
      accessToken: 'EAAG-test-system-user-token',
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Manual connect' })).not.toBeInTheDocument(),
    );
    dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText('WhatsApp account id (WABA id)'), '1');
    await userEvent.type(within(dialog).getByLabelText('Phone number id'), '2');
    await userEvent.type(within(dialog).getByLabelText('Access token'), 'x'.repeat(20));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('Number connected')).toBeInTheDocument();
    dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Manual connect' })).not.toBeInTheDocument(),
    );
  });

  it('Meta billing: confirm text, save, cancel, error', async () => {
    signInAs('superadmin');
    admin.setBilling
      .mockRejectedValueOnce(
        httpError(409, 'CONFLICT_INVALID_STATE', 'The platform account cannot be managed here.'),
      )
      .mockResolvedValueOnce({ metaPayer: 'customer' });
    // Phase 11: the control lives in the account's WhatsApp billing region
    renderWithProviders({ routes: routes(<AccountWhatsAppBillingCard detail={detail()} />) });
    const save = await screen.findByRole('button', { name: 'Save Meta billing' });
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: 'Customer pays Meta' }));
    await userEvent.click(save);
    let dialog = await screen.findByRole('dialog', { name: 'Switch to "Customer pays Meta"?' });
    expect(within(dialog).getByText(/a credit line can't be removed/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(admin.setBilling).not.toHaveBeenCalled();
    await userEvent.click(save);
    dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('The platform account cannot be managed here.'),
    ).toBeInTheDocument();
    await userEvent.click(save);
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save' }),
    );
    expect(await screen.findByText('Meta billing saved')).toBeInTheDocument();
    expect(admin.setBilling).toHaveBeenLastCalledWith('acc1', 'customer');
  });
});

describe('Admin WhatsApp status page', () => {
  it('flags, URLs, counts, failed events + replay', async () => {
    signInAs('superadmin');
    admin.status.mockResolvedValue(fakeAdminWhatsAppStatus());
    admin.events.mockResolvedValue([
      {
        id: 'e1',
        field: 'messages',
        status: 'failed',
        attempts: 5,
        error: 'schema: unexpected messages payload',
        wabaId: '1',
        phoneNumberId: '2',
        accountId: null,
        channelId: null,
        receivedAt: '2026-10-22T08:00:00.000Z',
        processedAt: null,
      },
    ]);
    admin.replay
      .mockResolvedValueOnce({ id: 'e1', status: 'received' })
      .mockRejectedValueOnce(httpError(409, 'CONFLICT_INVALID_STATE', 'Only failed events'));
    renderWithProviders({ route: '/admin/whatsapp' });
    expect(
      await screen.findByText('http://localhost:5100/api/v1/webhooks/meta'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Webhook URL' })).toBeInTheDocument();
    expect(screen.getByText(/✓ App secret set/)).toBeInTheDocument();
    expect(screen.getByText(/✗ Meta app id not set/)).toBeInTheDocument();
    expect(screen.getByText('Fake Meta (simulated)')).toBeInTheDocument();
    expect(screen.getByText('Connected: 2')).toBeInTheDocument();
    expect(screen.getByText(/processed 4 · deferred 10 · failed 1/)).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Failed events' });
    expect(
      await within(table).findByText('schema: unexpected messages payload'),
    ).toBeInTheDocument();
    await userEvent.click(within(table).getByRole('button', { name: 'Replay' }));
    expect(await screen.findByText('Event queued again')).toBeInTheDocument();
    await userEvent.click(within(table).getByRole('button', { name: 'Replay' }));
    expect(await screen.findByText('Only failed events')).toBeInTheDocument();
  });

  it('real provider, no numbers / events, WhatsApp off', async () => {
    signInAs('superadmin');
    admin.status.mockResolvedValueOnce(
      fakeAdminWhatsAppStatus({
        provider: 'meta',
        channelsByStatus: { weird: 1 },
        eventsByStatus24h: {},
        lastEventAt: null,
      }),
    );
    admin.events.mockResolvedValue([]);
    const a = renderWithProviders({ route: '/admin/whatsapp' });
    expect(await screen.findByText('Meta')).toBeInTheDocument();
    expect(screen.getByText(/Events \(24 h\): none/)).toBeInTheDocument();
    expect(screen.getByText('weird: 1')).toBeInTheDocument();
    expect(await screen.findByText('No failed events')).toBeInTheDocument();
    a.unmount();
    admin.status.mockResolvedValueOnce(fakeAdminWhatsAppStatus({ channelsByStatus: {} }));
    const b = renderWithProviders({ route: '/admin/whatsapp' });
    expect(await screen.findByText('No numbers connected yet.')).toBeInTheDocument();
    b.unmount();
    admin.status.mockRejectedValueOnce(httpError(503, 'WHATSAPP_NOT_CONFIGURED'));
    renderWithProviders({ route: '/admin/whatsapp' });
    expect(await screen.findByText("WhatsApp isn't set up on this server.")).toBeInTheDocument();
  });
});

describe('dashboard card', () => {
  const list = (items: WhatsAppChannel[]) => ({ items, counts: {}, limit: 10 });

  it('Connect WhatsApp for managers without numbers; counts otherwise', async () => {
    signInAs('owner');
    wa.channels.mockResolvedValueOnce(list([]));
    const a = renderWithProviders({ routes: routes(<WhatsAppDashboardCard />) });
    await userEvent.click(await screen.findByRole('link', { name: 'Connect WhatsApp' }));
    expect(await screen.findByText('numbers page')).toBeInTheDocument();
    a.unmount();
    wa.channels.mockResolvedValueOnce(
      list([
        fakeChannel(),
        fakeChannel({ id: 'b', status: 'needs_reconnect' }),
        fakeChannel({ id: 'c', status: 'action_needed' }),
      ]),
    );
    const b = renderWithProviders({ routes: routes(<WhatsAppDashboardCard />) });
    expect(await screen.findByText('1 connected · 2 need attention')).toBeInTheDocument();
    b.unmount();
    wa.channels.mockResolvedValueOnce(
      list([fakeChannel(), fakeChannel({ id: 'b', status: 'restricted' })]),
    );
    const c = renderWithProviders({ routes: routes(<WhatsAppDashboardCard />) });
    expect(await screen.findByText('1 connected · 1 needs attention')).toBeInTheDocument();
    c.unmount();
    wa.channels.mockResolvedValueOnce(list([fakeChannel()]));
    renderWithProviders({ routes: routes(<WhatsAppDashboardCard />) });
    expect(await screen.findByText('1 connected')).toBeInTheDocument();
  });

  it("calling on: today's WhatsApp calls and missed ones (calls.read)", async () => {
    signInAs('viewer');
    vi.mocked(callsApi.list).mockResolvedValue({
      success: true,
      data: [
        fakeWaCall('completed', 'human', 'inbound'),
        fakeWaCall('failed', 'human', 'inbound', {
          id: 'wc2',
          timestamps: { queuedAt: 'x', ringingAt: null, answeredAt: null, endedAt: 'x' },
        }),
        fakeWaCall('completed', 'ai', 'outbound', { id: 'wc3' }),
      ],
      meta: { hasMore: false, nextCursor: null },
    } as never);
    wa.channels.mockResolvedValueOnce(
      list([
        fakeChannel({ calling: { status: 'enabled', unavailableReason: null, restricted: false } }),
      ]),
    );
    renderWithProviders({ routes: routes(<WhatsAppDashboardCard />) });
    expect(await screen.findByText('Today: 3 WhatsApp calls · 1 missed')).toBeInTheDocument();
    expect(callsApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'whatsapp', limit: 100 }),
    );
  });

  it('hidden for read-only roles without numbers and when WhatsApp is off', async () => {
    signInAs('viewer');
    wa.channels.mockResolvedValueOnce(list([]));
    const a = renderWithProviders({ routes: routes(<WhatsAppDashboardCard />) });
    await waitFor(() => expect(wa.channels).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'WhatsApp' })).not.toBeInTheDocument();
    a.unmount();
    wa.config.mockRejectedValueOnce(httpError(503, 'WHATSAPP_NOT_CONFIGURED'));
    renderWithProviders({ routes: routes(<WhatsAppDashboardCard />) });
    await waitFor(() => expect(wa.config).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('region', { name: 'WhatsApp' })).not.toBeInTheDocument();
  });

  it('the dashboard shows it to roles with whatsapp.read', async () => {
    signInAs('owner');
    wa.channels.mockResolvedValue(list([fakeChannel()]));
    renderWithProviders({ route: '/' });
    expect(await screen.findByRole('region', { name: 'WhatsApp' })).toBeInTheDocument();
  });
});

describe('WhatsApp notifications', () => {
  it('get an icon per type', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    const types = [
      ['whatsapp.channel_needs_reconnect', 'Reconnect WhatsApp'],
      ['whatsapp.channel_restricted', 'WhatsApp restricted'],
      ['whatsapp.quality_low', 'WhatsApp quality low'],
      ['whatsapp.name_approved', 'Display name approved'],
      ['whatsapp.name_rejected', 'Display name rejected'],
      ['whatsapp.channel_disconnected_by_admin', 'WhatsApp disconnected'],
      // Phase 12
      ['call.whatsapp_missed', 'Missed WhatsApp call'],
      ['whatsapp.call_permission_granted', 'Customer allowed calls'],
      ['whatsapp.call_permission_declined', 'Customer declined calls'],
      ['whatsapp.call_permission_revoked', 'Call permission revoked'],
      ['whatsapp.calling_restricted', 'WhatsApp paused calling'],
    ] as const;
    vi.mocked(notificationsApi.unreadCount).mockResolvedValue(11);
    vi.mocked(notificationsApi.list).mockResolvedValue({
      success: true,
      data: types.map(([type], i) => ({
        id: `n${String(i)}`,
        type,
        title: `Title ${String(i)}`,
        body: 'x',
        link: '/whatsapp/numbers',
        readAt: null,
        createdAt: '2026-10-22T06:00:00.000Z',
      })),
      meta: {},
    } as never);
    vi.mocked(notificationsApi.markRead).mockResolvedValue(undefined as never);
    renderWithProviders({ routes: routes(<NotificationsBell />) });
    await user.click(await screen.findByRole('button', { name: 'Notifications, 11 unread' }));
    const menu = await screen.findByRole('menu');
    await within(menu).findByText('Title 10');
    for (const [, label] of types) expect(within(menu).getByTitle(label)).toBeInTheDocument();
    await user.click(within(menu).getAllByRole('menuitem')[0] as HTMLElement);
    expect(await screen.findByText('numbers page')).toBeInTheDocument();
  });
});
