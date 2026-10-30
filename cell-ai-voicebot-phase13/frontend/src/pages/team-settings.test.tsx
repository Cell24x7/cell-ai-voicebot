import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { memberActions } from '@/features/team/permissions';
import { accountApi } from '@/services/api/account';
import type * as ApiKeysModule from '@/services/api/api-keys';
import { apiKeysApi } from '@/services/api/api-keys';
import { auditApi } from '@/services/api/audit';
import { authApi } from '@/services/api/auth';
import { teamApi } from '@/services/api/team';
import type { TeamMember } from '@/services/api/types';
import { fakeSession, signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/team', () => ({
  teamApi: {
    list: vi.fn(),
    invite: vi.fn(),
    resendInvite: vi.fn(),
    revokeInvite: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    transferOwnership: vi.fn(),
  },
}));
vi.mock('@/services/api/account', () => ({
  accountApi: { get: vi.fn(), update: vi.fn(), updateProfile: vi.fn() },
}));
vi.mock('@/services/api/api-keys', async (orig) => ({
  ...(await orig<typeof ApiKeysModule>()),
  apiKeysApi: { list: vi.fn(), create: vi.fn(), revoke: vi.fn() },
}));
vi.mock('@/services/api/audit', () => ({ auditApi: { list: vi.fn() } }));
vi.mock('@/services/api/auth', () => ({
  authApi: {
    sessions: vi.fn(),
    revokeSession: vi.fn(),
    logoutAll: vi.fn(),
    changePassword: vi.fn(),
    me: vi.fn(),
    refresh: vi.fn(() => Promise.reject(new Error('x'))),
  },
}));

const member = (over: Partial<TeamMember>): TeamMember => ({
  id: 'm1',
  name: 'Member',
  email: 'm@example.com',
  phone: null,
  status: 'active',
  role: { key: 'agent', name: 'Agent' },
  isOwner: false,
  lastLoginAt: null,
  inviteExpiresAt: null,
  createdAt: '2026-10-08T00:00:00Z',
  ...over,
});
const ROWS: TeamMember[] = [
  member({
    id: 'u1',
    name: 'Asha Verma',
    email: 'asha@example.com',
    role: { key: 'owner', name: 'Owner' },
    isOwner: true,
  }),
  member({
    id: 'a2',
    name: 'Arun Admin',
    email: 'arun@example.com',
    role: { key: 'admin', name: 'Admin' },
  }),
  member({ id: 'g3', name: 'Gita Agent', email: 'gita@example.com' }),
  member({
    id: 'i4',
    name: 'Ivan Invited',
    email: 'ivan@example.com',
    status: 'invited',
    role: { key: 'viewer', name: 'Viewer' },
  }),
];

beforeEach(() => {
  vi.mocked(teamApi.list).mockResolvedValue({
    success: true,
    data: ROWS,
    meta: { page: 1, limit: 20, total: 4, totalPages: 1 },
  });
});
afterEach(() => vi.clearAllMocks());

describe('memberActions rules', () => {
  const owner = {
    canInvite: true,
    canUpdate: true,
    canRemove: true,
    callerIsOwner: true,
    callerId: 'u1',
  };
  const admin = { ...owner, callerIsOwner: false, callerId: 'a2' };
  it('protects owner, self and (for admins) other admins; invites only resend/revoke', () => {
    expect(memberActions(ROWS[0] as TeamMember, owner)).toEqual({
      invite: false,
      role: false,
      status: false,
      remove: false,
    });
    expect(memberActions(ROWS[1] as TeamMember, owner).role).toBe(true);
    expect(memberActions(ROWS[1] as TeamMember, admin).role).toBe(false);
    expect(memberActions(ROWS[2] as TeamMember, admin)).toEqual({
      invite: false,
      role: true,
      status: true,
      remove: true,
    });
    expect(memberActions(ROWS[3] as TeamMember, admin)).toEqual({
      invite: true,
      role: false,
      status: false,
      remove: false,
    });
  });
});

describe('TeamPage', () => {
  it('lists members and gives owners every action', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/team' });
    expect(await screen.findByText('Gita Agent')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite member' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Transfer ownership' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Actions for Asha Verma' }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Arun Admin' }));
    expect(screen.getByRole('menuitem', { name: 'Make Manager' })).toBeInTheDocument();
  });

  it('is read-only for managers (no invite, no actions)', async () => {
    signInAs('manager');
    renderWithProviders({ route: '/team' });
    expect(await screen.findByText('Gita Agent')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invite member' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
  });

  it('sends agents and viewers to the 403 page', async () => {
    signInAs('viewer');
    renderWithProviders({ route: '/team' });
    expect(await screen.findByRole('heading', { name: '403' })).toBeInTheDocument();
  });

  it('invites a member', async () => {
    signInAs('admin');
    vi.mocked(teamApi.invite).mockResolvedValue(
      member({ email: 'new@example.com', status: 'invited' }),
    );
    renderWithProviders({ route: '/team' });
    await userEvent.click(await screen.findByRole('button', { name: 'Invite member' }));
    const dialog = screen.getByRole('dialog', { name: 'Invite a team member' });
    await userEvent.type(within(dialog).getByLabelText('Email'), 'new@example.com');
    await userEvent.type(within(dialog).getByLabelText('Name'), 'New Person');
    await userEvent.click(within(dialog).getByLabelText('Role'));
    expect(screen.queryByRole('option', { name: 'Admin' })).not.toBeInTheDocument(); // admins can't invite admins
    await userEvent.click(screen.getByRole('option', { name: 'Manager' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send invitation' }));
    await waitFor(() =>
      expect(teamApi.invite).toHaveBeenCalledWith({
        email: 'new@example.com',
        name: 'New Person',
        roleKey: 'manager',
      }),
    );
    expect(await screen.findByText('Invitation sent to new@example.com')).toBeInTheDocument();
  });

  it('changes roles, disables, and removes after confirming', async () => {
    signInAs('owner');
    vi.mocked(teamApi.update).mockResolvedValue(member({}));
    vi.mocked(teamApi.remove).mockResolvedValue(undefined);
    renderWithProviders({ route: '/team' });
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Gita Agent' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Make Viewer' }));
    await waitFor(() => expect(teamApi.update).toHaveBeenCalledWith('g3', { roleKey: 'viewer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Gita Agent' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Disable' }));
    await waitFor(() => expect(teamApi.update).toHaveBeenCalledWith('g3', { status: 'disabled' }));
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Gita Agent' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Remove Gita Agent?' })).getByRole('button', {
        name: 'Remove',
      }),
    );
    await waitFor(() => expect(teamApi.remove).toHaveBeenCalledWith('g3'));
  });

  it('resends and revokes invitations', async () => {
    signInAs('owner');
    vi.mocked(teamApi.resendInvite).mockResolvedValue(undefined);
    vi.mocked(teamApi.revokeInvite).mockResolvedValue(undefined);
    renderWithProviders({ route: '/team' });
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Ivan Invited' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Resend invitation' }));
    await waitFor(() => expect(teamApi.resendInvite).toHaveBeenCalledWith('i4'));
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Ivan Invited' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Revoke invitation' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke' }),
    );
    await waitFor(() => expect(teamApi.revokeInvite).toHaveBeenCalledWith('i4'));
  });

  it('transfers ownership to an active admin with the password', async () => {
    signInAs('owner');
    vi.mocked(teamApi.transferOwnership).mockResolvedValue({ ownerId: 'a2' });
    vi.mocked(authApi.me).mockResolvedValue({
      ...fakeSession('admin'),
      accessToken: undefined,
    } as never);
    renderWithProviders({ route: '/team' });
    await userEvent.click(await screen.findByRole('button', { name: 'Transfer ownership' }));
    const dialog = screen.getByRole('dialog', { name: 'Transfer ownership' });
    await userEvent.click(within(dialog).getByLabelText('New owner'));
    await userEvent.click(screen.getByRole('option', { name: 'Arun Admin (arun@example.com)' }));
    await userEvent.type(within(dialog).getByLabelText('Your password'), 'blue-tiger-river-42');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Transfer' }));
    await waitFor(() =>
      expect(teamApi.transferOwnership).toHaveBeenCalledWith({
        userId: 'a2',
        password: 'blue-tiger-river-42',
      }),
    );
  });

  it('searches with a debounce and resets to page 1', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/team' });
    await screen.findByText('Gita Agent');
    await userEvent.type(screen.getByLabelText('Search name or email'), 'gita');
    await waitFor(() =>
      expect(teamApi.list).toHaveBeenLastCalledWith({ page: 1, limit: 20, search: 'gita' }),
    );
  });
});

describe('SettingsPage', () => {
  it('shows tabs by permission and guards hidden ones', async () => {
    signInAs('viewer');
    renderWithProviders({ route: '/settings/profile' });
    const tabs = within(await screen.findByRole('tablist', { name: 'Settings sections' }))
      .getAllByRole('tab')
      .map((t) => t.textContent);
    expect(tabs).toEqual([
      'Profile',
      'Security',
      'Account',
      'Calls',
      'Inbox',
      'AI & outcomes',
      'Data retention',
      'Notifications',
      'Billing details',
    ]);
  });

  it('hides Billing details from agents (no wallet.read)', async () => {
    signInAs('agent');
    renderWithProviders({ route: '/settings/profile' });
    const tabs = within(await screen.findByRole('tablist', { name: 'Settings sections' }))
      .getAllByRole('tab')
      .map((t) => t.textContent);
    expect(tabs).toEqual([
      'Profile',
      'Security',
      'Account',
      'Calls',
      'Inbox',
      'AI & outcomes',
      'Data retention',
    ]);
  });

  it('sends unknown tabs to profile and forbidden ones to 403', async () => {
    signInAs('viewer');
    renderWithProviders({ route: '/settings/api-keys' });
    expect(await screen.findByRole('heading', { name: '403' })).toBeInTheDocument();
  });

  it('account tab: read-only for viewers, editable + validated for owners', async () => {
    signInAs('viewer');
    const { unmount } = renderWithProviders({ route: '/settings/account' });
    expect(
      await screen.findByText('Only the owner and admins can change these settings.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Business name')).toBeDisabled();
    unmount();

    signInAs('owner');
    vi.mocked(accountApi.update).mockResolvedValue({
      ...fakeSession('owner').account,
      callingWindowWarning: null,
    });
    vi.mocked(authApi.me).mockResolvedValue({
      ...fakeSession('owner'),
      accessToken: undefined,
    } as never);
    renderWithProviders({ route: '/settings/account' });
    const name = await screen.findByLabelText('Business name');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, 'Renamed Finance');
    // the calling window moved to Settings → Calls
    expect(screen.queryByRole('button', { name: 'Sun' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(accountApi.update).toHaveBeenCalledWith({
        name: 'Renamed Finance',
        timezone: 'Asia/Kolkata',
        country: 'IN',
        defaultLanguage: 'hinglish',
        settings: { aiDisclosureEnabled: true },
      }),
    );
  });

  it('profile tab saves name and phone', async () => {
    signInAs('agent');
    vi.mocked(accountApi.updateProfile).mockResolvedValue({
      ...fakeSession('agent'),
      accessToken: undefined,
    } as never);
    renderWithProviders({ route: '/settings/profile' });
    await userEvent.type(await screen.findByLabelText('Phone'), '+919876543210');
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() =>
      expect(accountApi.updateProfile).toHaveBeenCalledWith({
        name: 'Asha Verma',
        phone: '+919876543210',
      }),
    );
  });

  it('security tab lists sessions and signs one out', async () => {
    signInAs('agent');
    vi.mocked(authApi.sessions).mockResolvedValue([
      {
        id: 's1',
        userAgent: 'Chrome',
        ip: '1.1.1.1',
        createdAt: '2026-10-08T00:00:00Z',
        lastUsedAt: '2026-10-08T00:00:00Z',
        current: true,
      },
      {
        id: 's2',
        userAgent: 'Firefox',
        ip: '2.2.2.2',
        createdAt: '2026-10-08T00:00:00Z',
        lastUsedAt: '2026-10-08T00:00:00Z',
        current: false,
      },
    ]);
    vi.mocked(authApi.revokeSession).mockResolvedValue(undefined);
    renderWithProviders({ route: '/settings/security' });
    expect(await screen.findByText('This session')).toBeInTheDocument();
    const row = screen.getByText('Firefox').closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(authApi.revokeSession).toHaveBeenCalledWith('s2'));
  });

  it('security tab changes the password', async () => {
    signInAs('agent');
    vi.mocked(authApi.sessions).mockResolvedValue([]);
    vi.mocked(authApi.changePassword).mockResolvedValue(
      fakeSession('agent', { accessToken: 'new' }),
    );
    renderWithProviders({ route: '/settings/security' });
    await userEvent.type(await screen.findByLabelText('Current password'), 'blue-tiger-river-42');
    await userEvent.type(screen.getByLabelText('New password'), 'green-falcon-lake-77');
    await userEvent.type(screen.getByLabelText('Repeat new password'), 'green-falcon-lake-77');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() =>
      expect(authApi.changePassword).toHaveBeenCalledWith({
        currentPassword: 'blue-tiger-river-42',
        newPassword: 'green-falcon-lake-77',
      }),
    );
  });

  it('API keys: shows the new key once and never caches it', async () => {
    signInAs('admin');
    vi.mocked(apiKeysApi.list).mockResolvedValue([]);
    vi.mocked(apiKeysApi.create).mockResolvedValue({
      key: 'cav_test_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456',
      apiKey: {
        id: 'k1',
        name: 'CRM',
        prefix: 'cav_test_ABCD',
        scopes: ['calls:read'],
        lastUsedAt: null,
        revokedAt: null,
        createdBy: 'u1',
        createdAt: '2026-10-08T00:00:00Z',
      },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderWithProviders({ route: '/settings/api-keys', queryClient });
    await userEvent.click(await screen.findByRole('button', { name: 'Create API key' }));
    await userEvent.type(screen.getByLabelText('Name'), 'CRM');
    await userEvent.click(screen.getByRole('checkbox', { name: /calls:read/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Create key' }));
    expect(await screen.findByLabelText('New API key')).toHaveValue(
      'cav_test_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456',
    );
    expect(
      JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain('ABCDEFGHIJKLMNOPQRSTUVWXYZ123456');
    await userEvent.click(screen.getByRole('button', { name: "I've copied it" }));
    await waitFor(() => expect(screen.queryByLabelText('New API key')).not.toBeInTheDocument());
  });

  it('audit tab loads more pages', async () => {
    signInAs('owner');
    const entry = (id: string) => ({
      id,
      action: 'team.invited' as const,
      actor: {
        type: 'user' as const,
        id: 'u1',
        name: 'Asha',
        impersonatorId: null,
        platform: false,
      },
      target: null,
      meta: { roleKey: 'manager' },
      ip: null,
      at: '2026-10-08T00:00:00Z',
    });
    vi.mocked(auditApi.list)
      .mockResolvedValueOnce({
        success: true,
        data: [entry('e1')],
        meta: { hasMore: true, nextCursor: 'c1' },
      })
      .mockResolvedValueOnce({
        success: true,
        data: [entry('e2')],
        meta: { hasMore: false, nextCursor: null },
      });
    renderWithProviders({ route: '/settings/audit' });
    expect(await screen.findByText('roleKey: manager')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getAllByText('roleKey: manager')).toHaveLength(2));
    expect(auditApi.list).toHaveBeenLastCalledWith({ limit: 50, cursor: 'c1' });
  });
});
