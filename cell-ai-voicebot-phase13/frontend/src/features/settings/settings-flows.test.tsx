import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth/store';
import { accountApi } from '@/services/api/account';
import { apiKeysApi } from '@/services/api/api-keys';
import type * as ApiKeysModule from '@/services/api/api-keys';
import { auditApi } from '@/services/api/audit';
import { authApi } from '@/services/api/auth';
import { ApiError } from '@/services/api/errors';
import { fakeSession, signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

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

beforeEach(() => {
  vi.mocked(accountApi.get).mockResolvedValue({
    ...fakeSession('owner').account,
    callingWindowWarning: null,
  });
});
afterEach(() => vi.clearAllMocks());

const KEY = {
  id: 'k1',
  name: 'CRM sync',
  prefix: 'cav_test_ABCD',
  scopes: ['calls:read'],
  lastUsedAt: null,
  revokedAt: null,
  createdBy: 'u1',
  createdAt: '2026-10-08T00:00:00Z',
};

describe('API keys tab', () => {
  it('revokes a key after confirming; revoked keys have no action', async () => {
    signInAs('owner');
    vi.mocked(apiKeysApi.list).mockResolvedValue([
      KEY,
      { ...KEY, id: 'k2', name: 'Old', revokedAt: '2026-10-08T00:00:00Z' },
    ]);
    vi.mocked(apiKeysApi.revoke).mockResolvedValue(undefined);
    renderWithProviders({ route: '/settings/api-keys' });
    expect(await screen.findAllByText('cav_test_ABCD…', { exact: false })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Revoke "CRM sync"?' })).getByRole('button', {
        name: 'Revoke',
      }),
    );
    await waitFor(() => expect(apiKeysApi.revoke).toHaveBeenCalledWith('k1'));
    expect(await screen.findByText('API key revoked')).toBeInTheDocument();
  });

  it('hides create / revoke while impersonating and shows errors', async () => {
    signInAs('owner', {
      impersonation: { impersonatorId: 'sa', expiresAt: '2026-10-08T01:00:00Z' },
    });
    vi.mocked(apiKeysApi.list).mockRejectedValue(
      new ApiError({ status: 0, code: 'NETWORK_ERROR', kind: 'network', message: 'x' }),
    );
    renderWithProviders({ route: '/settings/api-keys' });
    expect(
      await screen.findByText("Can't reach the server. Check your connection."),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create API key' })).not.toBeInTheDocument();
  });

  it('cancels the create dialog and shows server errors', async () => {
    signInAs('admin');
    vi.mocked(apiKeysApi.list).mockResolvedValue([]);
    vi.mocked(apiKeysApi.create).mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'CONFLICT_INVALID_STATE',
        kind: 'http',
        message: 'At most 20 keys.',
      }),
    );
    renderWithProviders({ route: '/settings/api-keys' });
    expect(await screen.findByText('No API keys yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create API key' }));
    await userEvent.type(screen.getByLabelText('Name'), 'X');
    await userEvent.click(screen.getByRole('checkbox', { name: /webhooks:manage/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /webhooks:manage/ }));
    expect(screen.getByRole('button', { name: 'Create key' })).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: /calls:write/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Create key' }));
    expect(await screen.findByText('At most 20 keys.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('Account tab', () => {
  it('discards changes', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/settings/account' });
    const name = await screen.findByLabelText('Business name');
    await userEvent.type(name, ' X');
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(name).toHaveValue('Demo Finance');
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument();
  });

  it('edits language, country, switches; shows save errors', async () => {
    signInAs('admin');
    vi.mocked(accountApi.update).mockRejectedValue(
      new ApiError({ status: 500, code: 'INTERNAL_ERROR', kind: 'http', message: 'Server broke' }),
    );
    renderWithProviders({ route: '/settings/account' });
    const country = await screen.findByLabelText('Country (ISO code)');
    await userEvent.clear(country);
    await userEvent.type(country, 'ae');
    expect(country).toHaveValue('AE');
    await userEvent.click(
      screen.getByLabelText('Tell callers they are speaking with an AI assistant'),
    );
    await userEvent.click(screen.getByLabelText('Default call language'));
    await userEvent.click(screen.getByRole('option', { name: 'English' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Server broke')).toBeInTheDocument();
    expect(accountApi.update).toHaveBeenCalledWith(
      expect.objectContaining({ country: 'AE', defaultLanguage: 'en' }) as unknown,
    );
  });

  it('is read-only for suspended accounts', async () => {
    const base = fakeSession('owner');
    signInAs('owner', { account: { ...base.account, status: 'suspended' } });
    renderWithProviders({ route: '/settings/account' });
    expect(await screen.findByLabelText('Business name')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });
});

describe('Calls tab', () => {
  it('owners switch recording and edit the notice; empty notices are refused; errors show', async () => {
    signInAs('owner');
    vi.mocked(accountApi.update)
      .mockRejectedValueOnce(
        new ApiError({
          status: 500,
          code: 'INTERNAL_ERROR',
          kind: 'http',
          message: 'Server broke',
        }),
      )
      .mockResolvedValueOnce({} as never);
    renderWithProviders({ route: '/settings/calls' });
    const notice = await screen.findByLabelText('Recording notice');
    expect(notice).toHaveValue('Yeh call quality ke liye record ki ja rahi hai.');
    await userEvent.clear(notice);
    expect(screen.getByText('Required, at most 200 characters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await userEvent.type(notice, '  Yeh call record ho rahi hai.  ');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Server broke')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Call settings saved')).toBeInTheDocument();
    expect(accountApi.update).toHaveBeenLastCalledWith({
      settings: {
        callingWindow: { start: '09:00', end: '19:00', days: [1, 2, 3, 4, 5, 6] },
        callCaps: { perDay: 3, perWeek: 10, minGapMinutes: 30 },
        recordingEnabled: true,
        recordingNotice: 'Yeh call record ho rahi hai.',
      },
    });
    await userEvent.click(screen.getByLabelText('Record calls'));
    expect(notice).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByLabelText('Record calls')).toBeChecked();
  });

  it('read-only for agents, impersonators and suspended accounts', async () => {
    signInAs('agent');
    const first = renderWithProviders({ route: '/settings/calls' });
    expect(
      await screen.findByText('Only the owner and admins can change call settings.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Record calls')).toBeDisabled();
    first.unmount();
    signInAs('owner', {
      impersonation: { impersonatorId: 'sa', expiresAt: '2026-10-08T01:00:00Z' },
    });
    const second = renderWithProviders({ route: '/settings/calls' });
    expect(
      await screen.findByText('Only the owner and admins can change call settings.'),
    ).toBeInTheDocument();
    second.unmount();
    const base = fakeSession('owner');
    signInAs('owner', { account: { ...base.account, status: 'suspended' } });
    renderWithProviders({ route: '/settings/calls' });
    expect(await screen.findByLabelText('Recording notice')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });
});

describe('Calls tab: window and call caps', () => {
  it('owners edit the window and the caps; bad values block saving; the saved warning shows', async () => {
    signInAs('owner');
    vi.mocked(accountApi.get).mockResolvedValue({
      ...fakeSession('owner').account,
      callingWindowWarning: 'outside_rbi_recovery',
    });
    vi.mocked(accountApi.update).mockResolvedValue({
      ...fakeSession('owner').account,
      callingWindowWarning: null,
    });
    renderWithProviders({ route: '/settings/calls' });
    expect(
      await screen.findByText(
        /outside 08:00–19:00\. Live recovery calls never go out then \(RBI\)/,
      ),
    ).toBeInTheDocument();
    const from = screen.getByLabelText('From');
    await userEvent.clear(from);
    await userEvent.type(from, '20:00');
    expect(screen.getByText('Must be after the start')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    const perDay = screen.getByLabelText('Calls per day');
    await userEvent.clear(perDay);
    await userEvent.type(perDay, '20');
    expect(screen.getByText('Use whole numbers between 1 and 10.')).toBeInTheDocument();
    await userEvent.clear(perDay);
    await userEvent.type(perDay, '5');
    const perWeek = screen.getByLabelText('Calls per week');
    await userEvent.clear(perWeek);
    await userEvent.type(perWeek, '4');
    expect(
      screen.getByText('Calls per week must be at least the calls per day.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await userEvent.clear(perWeek);
    await userEvent.type(perWeek, '12');
    await userEvent.click(screen.getByRole('button', { name: 'Sun' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(accountApi.update).toHaveBeenCalledWith({
        settings: {
          callingWindow: { start: '09:00', end: '19:00', days: [0, 1, 2, 3, 4, 5, 6] },
          callCaps: { perDay: 5, perWeek: 12, minGapMinutes: 30 },
          recordingEnabled: true,
          recordingNotice: 'Yeh call quality ke liye record ki ja rahi hai.',
        },
      }),
    );
  });

  it('TRAI warning; caps are read-only for roles below admin', async () => {
    signInAs('manager', {
      permissions: [...fakeSession('manager').permissions, 'account.update'],
    });
    vi.mocked(accountApi.get).mockResolvedValue({
      ...fakeSession('owner').account,
      callingWindowWarning: 'outside_trai',
    });
    vi.mocked(accountApi.update).mockResolvedValue({
      ...fakeSession('owner').account,
      callingWindowWarning: null,
    });
    renderWithProviders({ route: '/settings/calls' });
    expect(await screen.findByText(/outside 09:00–21:00/)).toBeInTheDocument();
    expect(screen.getByLabelText('Calls per day')).toBeDisabled();
    expect(
      screen.getByText(/Only the owner and admins can change these limits/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sun' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    // no callCaps for a manager (the server refuses them)
    await waitFor(() =>
      expect(accountApi.update).toHaveBeenCalledWith({
        settings: {
          callingWindow: { start: '09:00', end: '19:00', days: [0, 1, 2, 3, 4, 5, 6] },
          recordingEnabled: true,
          recordingNotice: 'Yeh call quality ke liye record ki ja rahi hai.',
        },
      }),
    );
  });
});

describe('Security tab', () => {
  it('validates the new password and shows server errors', async () => {
    signInAs('agent');
    vi.mocked(authApi.sessions).mockResolvedValue([]);
    vi.mocked(authApi.changePassword).mockRejectedValue(
      new ApiError({
        status: 401,
        code: 'AUTH_INVALID_CREDENTIALS',
        kind: 'http',
        message: 'Invalid email or password.',
      }),
    );
    renderWithProviders({ route: '/settings/security' });
    await userEvent.type(await screen.findByLabelText('Current password'), 'wrong-password-1');
    await userEvent.type(screen.getByLabelText('New password'), 'green-falcon-lake-77');
    await userEvent.type(screen.getByLabelText('Repeat new password'), 'green-falcon-lake-7');
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Repeat new password'), '7');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
  });

  it('signs out everywhere after confirming; revoking this session signs out', async () => {
    signInAs('agent');
    vi.mocked(authApi.sessions).mockResolvedValue([
      {
        id: 's1',
        userAgent: null,
        ip: null,
        createdAt: '2026-10-08T00:00:00Z',
        lastUsedAt: '2026-10-08T00:00:00Z',
        current: true,
      },
    ]);
    vi.mocked(authApi.revokeSession).mockResolvedValue(undefined);
    renderWithProviders({ route: '/settings/security' });
    expect(await screen.findByText('Unknown device')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe('anonymous');
  });

  it('sign out everywhere', async () => {
    signInAs('agent');
    vi.mocked(authApi.sessions).mockResolvedValue([]);
    vi.mocked(authApi.logoutAll).mockResolvedValue(undefined);
    renderWithProviders({ route: '/settings/security' });
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out everywhere' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign out everywhere' }),
    );
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(authApi.logoutAll).toHaveBeenCalled();
  });

  it('explains that password changes are off while impersonating', async () => {
    signInAs('owner', { impersonation: { impersonatorId: 'sa', expiresAt: 'x' } });
    renderWithProviders({ route: '/settings/security' });
    expect(
      await screen.findByText('Password changes are not available while viewing as another user.'),
    ).toBeInTheDocument();
    expect(authApi.sessions).not.toHaveBeenCalled();
  });
});

describe('Profile + audit tabs', () => {
  it('shows server field errors and clears the phone', async () => {
    signInAs('agent', { user: { ...fakeSession('agent').user, phone: '+919876543210' } });
    vi.mocked(accountApi.updateProfile)
      .mockRejectedValueOnce(
        new ApiError({
          status: 422,
          code: 'VALIDATION_FAILED',
          kind: 'http',
          message: 'x',
          details: [{ path: 'body.name', message: 'Too long' }],
        }),
      )
      .mockResolvedValueOnce({ ...fakeSession('agent'), accessToken: undefined } as never);
    renderWithProviders({ route: '/settings/profile' });
    await userEvent.click(await screen.findByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText('Too long')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Phone'));
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() =>
      expect(accountApi.updateProfile).toHaveBeenLastCalledWith({
        name: 'Asha Verma',
        phone: null,
      }),
    );
  });

  it('filters the audit log by group and shows actor types', async () => {
    signInAs('owner');
    vi.mocked(auditApi.list).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'e1',
          action: 'apikey.created',
          actor: { type: 'api_key', id: 'k', name: null, impersonatorId: null, platform: false },
          target: null,
          meta: null,
          ip: '1.2.3.4',
          at: '2026-10-08T00:00:00Z',
        },
        {
          id: 'e2',
          action: 'account.suspended',
          actor: { type: 'user', id: 'sa', name: null, impersonatorId: null, platform: true },
          target: null,
          meta: { reason: 'x', fields: ['a', 'b'] },
          ip: null,
          at: '2026-10-08T00:00:00Z',
        },
        {
          id: 'e3',
          action: 'team.invited',
          actor: { type: 'user', id: 'u', name: 'Asha', impersonatorId: 'sa', platform: false },
          target: null,
          meta: null,
          ip: null,
          at: '2026-10-08T00:00:00Z',
        },
        {
          id: 'e4',
          action: 'auth.login',
          actor: { type: 'system', id: null, name: null, impersonatorId: null, platform: false },
          target: null,
          meta: null,
          ip: null,
          at: '2026-10-08T00:00:00Z',
        },
      ],
      meta: { hasMore: false, nextCursor: null },
    });
    renderWithProviders({ route: '/settings/audit' });
    expect(await screen.findByText('API key')).toBeInTheDocument();
    expect(screen.getByText('Platform admin')).toBeInTheDocument();
    expect(screen.getByText('Asha (via support)')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('reason: x · fields: a, b')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Show'));
    await userEvent.click(screen.getByRole('option', { name: 'Team' }));
    await waitFor(() =>
      expect(auditApi.list).toHaveBeenLastCalledWith({ action: 'team.*', limit: 50 }),
    );
  });
});
