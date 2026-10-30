import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/services/api/errors';
import { notificationsApi } from '@/services/api/notifications';
import type { Notification, Wallet } from '@/services/api/types';
import { walletApi } from '@/services/api/wallet';
import { WS_EVENT_TYPES } from '@/services/realtime/events';
import { signInAs } from '@/test/auth';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/notifications', () => ({
  notificationsApi: {
    list: vi.fn(),
    unreadCount: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));
vi.mock('@/services/api/wallet', () => ({
  walletApi: { get: vi.fn(), rates: vi.fn(() => new Promise(() => undefined)) },
}));
vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))), me: vi.fn() },
}));

const notes = vi.mocked(notificationsApi);
const wallet = vi.mocked(walletApi);
const R = 1_000_000;

export const walletFixture = (overrides: Partial<Wallet> = {}): Wallet => ({
  currency: 'INR',
  balanceMicros: 1000 * R,
  holdMicros: 0,
  availableMicros: 1000 * R,
  creditLimitMicros: 0,
  status: 'ok',
  lowBalanceThresholdMicros: 500 * R,
  budgets: { monthlyCallMicros: 0, monthlyAiMicros: 0, monthlyWhatsappMicros: 0 },
  monthSpend: {
    month: '2026-10',
    callMicros: 0,
    aiMicros: 0,
    ttsMicros: 0,
    whatsappMicros: 0,
    totalMicros: 0,
  },
  updatedAt: '2026-10-09T00:00:00Z',
  ...overrides,
});

const NOTE = (overrides: Partial<Notification> = {}): Notification => ({
  id: 'n1',
  type: 'wallet.topup_paid',
  title: 'Money added to the wallet',
  body: '₹1,000.00 was added',
  link: '/wallet?tab=invoices',
  readAt: null,
  createdAt: new Date().toISOString(),
  ...overrides,
});

beforeEach(() => {
  notes.unreadCount.mockResolvedValue(0);
  notes.list.mockResolvedValue({
    success: true,
    data: [],
    meta: { hasMore: false, nextCursor: null },
  });
  wallet.get.mockResolvedValue(walletFixture());
});
afterEach(() => vi.clearAllMocks());

describe('notifications bell', () => {
  it('shows the unread badge, opens the latest, marks one read and follows its link', async () => {
    signInAs('owner');
    notes.unreadCount.mockResolvedValue(2);
    notes.list.mockResolvedValue({
      success: true,
      data: [
        NOTE(),
        NOTE({ id: 'n2', title: 'Old one', readAt: '2026-10-08T00:00:00Z', link: null }),
      ],
      meta: { hasMore: false, nextCursor: null },
    });
    notes.markRead.mockResolvedValue(NOTE({ readAt: 'x' }));
    renderWithProviders({ route: '/' });
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }));
    const menu = await screen.findByRole('menu');
    expect(notes.list).toHaveBeenCalledWith({ limit: 20 });
    expect(within(menu).getByText('(unread)')).toBeInTheDocument();
    expect(within(menu).getByText('Old one')).toBeInTheDocument();
    await userEvent.click(within(menu).getByText('Money added to the wallet'));
    await waitFor(() => expect(notes.markRead).toHaveBeenCalledWith('n1'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Wallet' })).toBeInTheDocument();
  });

  it('marks all read and counts new ones from the socket', async () => {
    signInAs('owner');
    notes.unreadCount.mockResolvedValue(1);
    notes.markAllRead.mockResolvedValue({ updated: 1 });
    const rt = fakeRealtime();
    renderWithProviders({ route: '/', realtime: rt.client });
    await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    rt.emit('notification.created', { notificationId: 'n9', title: 'Hi' });
    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' });
    await userEvent.click(bell);
    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
    notes.unreadCount.mockResolvedValue(0);
    await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(notes.markAllRead).toHaveBeenCalled());
    // the open menu hides the page from the accessibility tree
    expect(
      await screen.findByRole('button', { name: 'Notifications', hidden: true }),
    ).toBeInTheDocument();
  });

  it('shows an error with retry, and a failed mark-all as a snackbar', async () => {
    signInAs('owner');
    notes.unreadCount.mockResolvedValue(3);
    notes.list.mockRejectedValueOnce(
      new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Boom', kind: 'http' }),
    );
    notes.markAllRead.mockRejectedValue(
      new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Nope', kind: 'http' }),
    );
    renderWithProviders({ route: '/' });
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 3 unread' }));
    expect(await screen.findByText('Boom')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(await screen.findByText('Nope')).toBeInTheDocument();
  });

  it('works for users without wallet.read (own notifications only, no wallet calls)', async () => {
    signInAs('agent');
    notes.unreadCount.mockResolvedValue(1);
    renderWithProviders({ route: '/' });
    expect(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    ).toBeInTheDocument();
    expect(wallet.get).not.toHaveBeenCalled();
    expect(screen.queryByText(/wallet balance/i)).not.toBeInTheDocument();
  });
});

describe('wallet banner', () => {
  it('warns on low balance with Add money for owners', async () => {
    signInAs('owner');
    wallet.get.mockResolvedValue(walletFixture({ status: 'low', availableMicros: 200 * R }));
    renderWithProviders({ route: '/' });
    expect(
      await screen.findByText(
        'Low wallet balance: ₹200.00 available. Calls and WhatsApp messages stop when it runs out.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add money' }));
    // lands on /wallet?add=1 with the Add money dialog open
    expect(await screen.findByRole('dialog', { name: 'Add money' })).toBeInTheDocument();
  });

  it('says exhausted; no Add money for managers or while impersonating', async () => {
    signInAs('manager');
    wallet.get.mockResolvedValue(walletFixture({ status: 'exhausted', availableMicros: 0 }));
    const view = renderWithProviders({ route: '/' });
    expect(await screen.findByText(/No money available in the wallet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add money' })).not.toBeInTheDocument();
    view.unmount();

    signInAs('owner', {
      impersonation: { impersonatorId: 'sa', expiresAt: '2026-10-09T01:00:00Z' },
    });
    renderWithProviders({ route: '/' });
    expect(await screen.findByText(/No money available in the wallet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add money' })).not.toBeInTheDocument();
  });

  it('shows nothing while the wallet is fine', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/' });
    await waitFor(() => expect(wallet.get).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('live wallet updates', () => {
  it('applies wallet.updated without refetching and shows crossing snackbars', async () => {
    signInAs('owner');
    wallet.get.mockResolvedValue(walletFixture({ status: 'low', availableMicros: 200 * R }));
    const rt = fakeRealtime();
    renderWithProviders({ route: '/', realtime: rt.client });
    await screen.findByText(
      'Low wallet balance: ₹200.00 available. Calls and WhatsApp messages stop when it runs out.',
    );
    rt.emit('wallet.updated', {
      balanceMicros: 0,
      holdMicros: 0,
      availableMicros: 0,
      currency: 'INR',
      status: 'exhausted',
    });
    expect(await screen.findByText(/No money available in the wallet/)).toBeInTheDocument();
    expect(wallet.get).toHaveBeenCalledTimes(1);
    rt.emit('wallet.low_balance', { availableMicros: 120 * R, thresholdMicros: 500 * R });
    expect(await screen.findByText('Low wallet balance: ₹120.00 available')).toBeInTheDocument();
    rt.emit('wallet.exhausted', { availableMicros: 0 });
    expect(await screen.findByText(/new calls are paused/)).toBeInTheDocument();
  });

  it('loads the wallet when an update arrives before the first fetch, and ignores events without wallet.read', async () => {
    signInAs('agent');
    const rt = fakeRealtime();
    renderWithProviders({ route: '/', realtime: rt.client });
    await screen.findByRole('button', { name: 'Notifications' });
    rt.emit('wallet.updated', {
      balanceMicros: 1,
      holdMicros: 0,
      availableMicros: 1,
      currency: 'INR',
      status: 'ok',
    });
    rt.emit('wallet.low_balance', { availableMicros: 1, thresholdMicros: 2 });
    rt.emit('wallet.exhausted', { availableMicros: 0 });
    expect(screen.queryByText(/Low wallet balance/)).not.toBeInTheDocument();
    expect(wallet.get).not.toHaveBeenCalled();
  });

  it('knows the wallet events', () => {
    expect(WS_EVENT_TYPES).toEqual(
      expect.arrayContaining(['wallet.updated', 'wallet.low_balance', 'wallet.exhausted']),
    );
  });
});

describe('the platform account', () => {
  it('has no wallet menu, banner, card or wallet page for superadmins', async () => {
    signInAs('superadmin');
    renderWithProviders({ route: '/' });
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0];
    expect(nav).toBeDefined();
    expect(
      within(nav as HTMLElement).queryByRole('link', { name: 'Wallet' }),
    ).not.toBeInTheDocument();
    expect(within(nav as HTMLElement).getByRole('link', { name: 'Billing' })).toBeInTheDocument();
    expect(wallet.get).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Open wallet' })).not.toBeInTheDocument();
  });

  it('explains instead of showing a wallet', async () => {
    signInAs('superadmin');
    renderWithProviders({ route: '/wallet' });
    expect(await screen.findByText('The platform account has no wallet')).toBeInTheDocument();
    expect(wallet.get).not.toHaveBeenCalled();
  });
});

describe('wallet routes', () => {
  it('agents get 403 on /wallet', async () => {
    signInAs('agent');
    renderWithProviders({ route: '/wallet' });
    expect(await screen.findByRole('heading', { level: 1, name: '403' })).toBeInTheDocument();
  });

  it('switches tabs through the URL', async () => {
    signInAs('viewer');
    renderWithProviders({ route: '/wallet?tab=usage' });
    expect(await screen.findByRole('tab', { name: 'Usage', selected: true })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Invoices' }));
    expect(screen.getByRole('tab', { name: 'Invoices', selected: true })).toBeInTheDocument();
  });

  it('admin billing is for platform admins only', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/admin/billing' });
    expect(await screen.findByRole('heading', { level: 1, name: '403' })).toBeInTheDocument();
  });
});
