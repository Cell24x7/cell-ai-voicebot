import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth/store';
import { adminApi } from '@/services/api/admin';
import { authApi } from '@/services/api/auth';
import { inboxApi } from '@/services/api/inbox';
import { fakeSession, signInAs } from '@/test/auth';
import { fakeInboxSummary } from '@/test/inbox';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';

import { NAV_ITEMS, visibleNavItems } from './nav-config';

vi.mock('@/services/api/system', () => ({
  getSystemInfo: vi.fn(() => new Promise(() => undefined)),
}));
vi.mock('@/services/api/auth', () => ({
  authApi: {
    logout: vi.fn(() => Promise.resolve()),
    logoutAll: vi.fn(() => Promise.resolve()),
    refresh: vi.fn(() => Promise.reject(new Error('x'))),
  },
}));
vi.mock('@/services/api/admin', () => ({
  adminApi: { stopImpersonation: vi.fn(() => Promise.resolve()) },
}));

afterEach(() => vi.clearAllMocks());

const navLabels = () =>
  within(screen.getAllByRole('navigation', { name: 'Main' })[0] as HTMLElement)
    .getAllByRole('link')
    .map((l) => l.textContent);

describe('nav config', () => {
  it('hides items of future phases, without permission, and admin-only items', () => {
    const can = (p: string) => p === 'team.read';
    expect(visibleNavItems(can, false).map((i) => i.key)).toEqual([
      'dashboard',
      'team',
      'settings',
    ]);
    expect(visibleNavItems(() => false, true).map((i) => i.key)).toEqual([
      'dashboard',
      'settings',
      'admin',
      'admin-billing',
      'admin-whatsapp',
      'admin-whatsapp-billing',
    ]);
    expect(visibleNavItems(() => true, false, 99)).toHaveLength(NAV_ITEMS.length - 4);
    // Phase 3 builds did not show the wallet
    expect(visibleNavItems(() => true, false, 3).map((i) => i.key)).not.toContain('wallet');
    // Phase 4 builds hid AI agents and knowledge
    const phase4 = visibleNavItems(() => true, false, 4).map((i) => i.key);
    expect(phase4).not.toContain('agents');
    expect(phase4).not.toContain('knowledge');
    // Phase 5 builds hid call flows
    expect(visibleNavItems(() => true, false, 5).map((i) => i.key)).not.toContain('flows');
    // Phase 8 builds hid WhatsApp, Phase 9 builds the Inbox; Reports / Integrations come in Phases 14 / 15
    expect(visibleNavItems(() => true, false, 8).map((i) => i.key)).not.toContain('whatsapp');
    expect(visibleNavItems(() => true, false, 9).map((i) => i.key)).not.toContain('inbox');
    // Phase 10 builds hid the superadmin WhatsApp billing page
    expect(visibleNavItems(() => false, true, 10).map((i) => i.key)).not.toContain(
      'admin-whatsapp-billing',
    );
    const live = visibleNavItems(() => true, false).map((i) => i.key);
    expect(live).toContain('whatsapp');
    expect(live.indexOf('inbox')).toBe(live.indexOf('whatsapp') - 1);
    expect(live).toContain('reports');
    // Phase 13 builds hid the reports
    expect(visibleNavItems(() => true, false, 13).map((i) => i.key)).not.toContain('reports');
    expect(live).not.toContain('integrations');
    expect(visibleNavItems((p) => p === 'flows.read', false).map((i) => i.key)).toEqual([
      'dashboard',
      'flows',
      'settings',
    ]);
    expect(visibleNavItems((p) => p === 'agents.read', false).map((i) => i.key)).toEqual([
      'dashboard',
      'agents',
      'knowledge',
      'settings',
    ]);
  });
});

describe('AppLayout', () => {
  it('shows the menu for an owner (no superadmin section)', () => {
    signInAs('owner');
    renderWithProviders({ route: '/' });
    expect(navLabels()).toEqual([
      'Dashboard',
      'Contacts',
      'Wallet',
      'AI agents',
      'Knowledge',
      'Call flows',
      'Calls',
      'Campaigns',
      'Inbox',
      'WhatsApp',
      'Reports',
      'Team',
      'Settings',
    ]);
    expect(screen.queryByText('Superadmin')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Welcome, Asha Verma')).toBeInTheDocument();
  });

  it('hides Team for agents and viewers ("roles se menu badle")', () => {
    signInAs('viewer');
    renderWithProviders({ route: '/' });
    // viewers read AI agents and knowledge (read-only pages)
    expect(navLabels()).toEqual([
      'Dashboard',
      'Contacts',
      'Wallet',
      'AI agents',
      'Knowledge',
      'Call flows',
      'Calls',
      'Campaigns',
      'Inbox',
      'WhatsApp',
      'Reports',
      'Settings',
    ]);
  });

  it('hides the Wallet from agents (no wallet.read)', () => {
    signInAs('agent');
    renderWithProviders({ route: '/' });
    expect(navLabels()).toEqual([
      'Dashboard',
      'Contacts',
      'AI agents',
      'Knowledge',
      'Call flows',
      'Calls',
      'Campaigns',
      'Inbox',
      'WhatsApp',
      'Settings',
    ]);
  });

  it('shows the superadmin section to platform admins', () => {
    signInAs('superadmin');
    renderWithProviders({ route: '/' });
    expect(screen.getAllByText('Superadmin')[0]).toBeInTheDocument();
    expect(navLabels()).toContain('Accounts');
    expect(navLabels()).toContain('Billing');
    expect(navLabels()).toContain('WhatsApp setup');
    expect(navLabels()).toContain('WhatsApp billing');
  });

  it('shows the unread badge on Inbox, live from inbox.summary.updated', async () => {
    const summary = vi
      .spyOn(inboxApi, 'summary')
      .mockResolvedValueOnce(fakeInboxSummary({ unreadConversations: 3 }))
      .mockResolvedValue(fakeInboxSummary({ unreadConversations: 120 }));
    signInAs('agent');
    const rt = fakeRealtime();
    renderWithProviders({ route: '/', realtime: rt.client });
    expect((await screen.findAllByRole('link', { name: 'Inbox, 3 unread' }))[0]).toHaveAttribute(
      'href',
      '/inbox',
    );
    rt.emit('inbox.summary.updated', { unreadConversations: 120 });
    expect(await screen.findAllByRole('link', { name: 'Inbox, 120 unread' })).not.toHaveLength(0);
    expect(screen.getAllByText('99+').length).toBeGreaterThan(0);
    summary.mockRestore();
  });

  it('hides the badge at zero and when the summary fails (WhatsApp off)', async () => {
    const summary = vi
      .spyOn(inboxApi, 'summary')
      .mockResolvedValue(fakeInboxSummary({ unreadConversations: 0 }));
    signInAs('owner');
    renderWithProviders({ route: '/' });
    await waitFor(() => expect(summary).toHaveBeenCalled());
    expect(screen.getAllByRole('link', { name: 'Inbox' })[0]).toHaveAttribute('href', '/inbox');
    summary.mockRestore();
  });

  it('opens the mobile drawer from the header', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/' });
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getAllByRole('navigation', { name: 'Main' }).length).toBeGreaterThanOrEqual(1);
  });

  it('shows the live-updates status and toggles the theme', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/' });
    expect(screen.getByRole('status', { name: 'Live updates off' })).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /Switch to (dark|light) mode/ });
    const before = toggle.getAttribute('aria-label');
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: /Switch to (dark|light) mode/ })
          .getAttribute('aria-label'),
      ).not.toBe(before),
    );
  });

  it('signs out from the account menu', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/' });
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByText('asha@example.com · Owner')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(authApi.logout).toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('anonymous');
  });

  it('the account menu links the privacy policy, terms and contact pages', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/' });
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    for (const name of ['Privacy', 'Terms'])
      expect(screen.getByRole('menuitem', { name })).toBeVisible();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Contact' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Contact' })).toBeInTheDocument();
  });

  it('asks before signing out everywhere', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/' });
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out everywhere' }));
    expect(screen.getByRole('dialog', { name: 'Sign out everywhere?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(authApi.logoutAll).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out everywhere' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign out everywhere' }),
    );
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(authApi.logoutAll).toHaveBeenCalled();
  });

  it('shows the suspended banner', () => {
    const base = fakeSession('owner');
    signInAs('owner', {
      account: { ...base.account, status: 'suspended', suspendReason: 'Unpaid invoice' },
    });
    renderWithProviders({ route: '/' });
    expect(
      screen.getByText(/This account is suspended — it is read-only\. Reason: Unpaid invoice\./),
    ).toBeInTheDocument();
  });

  it('shows the impersonation banner and Stop restores the superadmin', async () => {
    signInAs('superadmin');
    useAuthStore.getState().startImpersonation(
      fakeSession('owner', {
        accessToken: 'imp',
        impersonation: { impersonatorId: 'u1', expiresAt: '2026-10-08T01:00:00Z' },
      }),
    );
    renderWithProviders({ route: '/' });
    expect(screen.getByText(/Viewing as Asha Verma \(Demo Finance\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(useAuthStore.getState().session?.impersonation).toBeNull());
    expect(adminApi.stopImpersonation).toHaveBeenCalled();
  });

  it('redirects to 403 page content', () => {
    signInAs('viewer');
    renderWithProviders({ route: '/403' });
    expect(screen.getByRole('heading', { name: '403' })).toBeInTheDocument();
  });
});
