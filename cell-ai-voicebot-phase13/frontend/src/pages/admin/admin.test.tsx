import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth/store';
import { adminApi } from '@/services/api/admin';
import { ApiError } from '@/services/api/errors';
import type { AdminAccountDetail, AdminAccountRow } from '@/services/api/types';
import { fakeSession, signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';
import { fakeRetention } from '@/test/retention';

vi.mock('@/services/api/admin', () => ({
  adminApi: {
    accounts: vi.fn(),
    createAccount: vi.fn(),
    setOwnerPassword: vi.fn(),
    setApiLimits: vi.fn(),
    setVoiceLine: vi.fn(),
    setSipSettings: vi.fn(),
    account: vi.fn(),
    suspend: vi.fn(),
    enable: vi.fn(),
    impersonate: vi.fn(),
    stopImpersonation: vi.fn(),
    setLimits: vi.fn(),
    setRetentionCap: vi.fn(),
    pauseCampaigns: vi.fn(),
    resumeCampaign: vi.fn(),
    signupSettings: vi.fn(() => new Promise(() => undefined)),
    setSignupSettings: vi.fn(),
    setReseller: vi.fn(),
    approveReseller: vi.fn(),
    suspendCustomers: vi.fn(),
  },
}));
vi.mock('@/services/api/phone-numbers', async (original) => ({
  ...(await original<object>()),
  phoneNumbersApi: { list: vi.fn(() => Promise.resolve([])) },
}));
vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))), me: vi.fn() },
}));

const api = vi.mocked(adminApi);
afterEach(() => vi.clearAllMocks());

const ROW: AdminAccountRow = {
  id: 'acc1',
  name: 'Demo Finance',
  slug: 'demo-finance',
  status: 'active',
  ownerEmail: 'asha@example.com',
  usersCount: 3,
  kind: 'business',
  parent: null,
  customersCount: null,
  resellerStatus: null,
  createdAt: '2026-10-01T00:00:00Z',
};

const base = fakeSession('owner');
const detail = (overrides: Partial<AdminAccountDetail['account']> = {}): AdminAccountDetail => ({
  account: { ...base.account, id: 'acc1', ...overrides },
  owner: base.user as AdminAccountDetail['owner'],
  usersCount: 3,
  retention: fakeRetention(),
  apiLimits: null,
  voiceLine: 'dryrun',
  sipSettings: { pulseSec: null, spendMinutesPerHour: null },
  usersByStatus: { active: 2, invited: 1, disabled: 0 },
  limits: { maxConcurrentCalls: 10, dialsPerMinute: 60 },
  activeCampaigns: 1,
  adminPausedCampaigns: [],
  whatsappBilling: {
    metaPayer: 'platform',
    markupBps: null,
    fixedPrices: null,
    platformFeeMicros: null,
  },
  whatsappChannels: [],
  recentAudit: [
    {
      id: 'e1',
      action: 'team.invited',
      actor: { type: 'user', id: 'u1', name: 'Asha', impersonatorId: null, platform: false },
      target: null,
      meta: { email: 'new@example.com' },
      ip: null,
      at: '2026-10-08T00:00:00Z',
    },
  ],
});

describe('Add account (superadmin)', () => {
  const open = async () => {
    signInAs('superadmin');
    api.accounts.mockResolvedValue({
      success: true,
      data: [ROW],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    } as never);
    api.account.mockResolvedValue(detail());
    renderWithProviders({ route: '/admin/accounts' });
    await userEvent.click(await screen.findByRole('button', { name: 'Add account' }));
    return screen.getByRole('dialog', { name: 'Add account' });
  };

  it('creates the account with a password and opens it', async () => {
    api.createAccount.mockResolvedValue({ ...detail().account, name: 'New Biz' });
    const dialog = await open();
    const save = within(dialog).getByRole('button', { name: 'Create account' });
    expect(save).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Business name'), ' New Biz ');
    await userEvent.type(within(dialog).getByLabelText('Owner name'), 'Meera');
    await userEvent.type(within(dialog).getByLabelText('Owner email'), 'not-an-email');
    expect(save).toBeDisabled();
    await userEvent.clear(within(dialog).getByLabelText('Owner email'));
    await userEvent.type(within(dialog).getByLabelText('Owner email'), 'meera@example.com');
    await userEvent.type(within(dialog).getByLabelText(/Owner password/), 'short');
    expect(save).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Owner password/), '-enough-now');
    await userEvent.type(within(dialog).getByLabelText('Owner phone (optional)'), '+919876543210');
    await userEvent.click(save);
    expect(api.createAccount).toHaveBeenCalledWith({
      businessName: 'New Biz',
      ownerName: 'Meera',
      ownerEmail: 'meera@example.com',
      ownerPassword: 'short-enough-now',
      ownerPhone: '+919876543210',
      kind: 'business',
    });
    expect(await screen.findByText(/The owner can sign in now/)).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: /overview/i })).toBeInTheDocument();
  });

  it('shows server errors and leaves the phone out when empty; cancel closes', async () => {
    api.createAccount.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'CONFLICT_DUPLICATE',
        message: 'This e-mail already belongs to a user.',
        kind: 'http',
      }),
    );
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText('Business name'), 'New Biz');
    await userEvent.type(within(dialog).getByLabelText('Owner name'), 'Meera');
    await userEvent.type(within(dialog).getByLabelText('Owner email'), 'used@example.com');
    await userEvent.type(within(dialog).getByLabelText(/Owner password/), 'long-enough-pass');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create account' }));
    expect(await within(dialog).findByText(/already belongs/)).toBeInTheDocument();
    expect(api.createAccount).toHaveBeenCalledWith({
      businessName: 'New Biz',
      ownerName: 'Meera',
      ownerEmail: 'used@example.com',
      ownerPassword: 'long-enough-pass',
      kind: 'business',
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('changes the owner password; checks the repeat and shows a refusal', async () => {
    signInAs('superadmin');
    api.account.mockResolvedValue(detail());
    api.setOwnerPassword
      .mockRejectedValueOnce(
        new ApiError({
          status: 422,
          code: 'VALIDATION_FAILED',
          message: 'This password is too common.',
          kind: 'http',
        }),
      )
      .mockResolvedValueOnce(undefined);
    renderWithProviders({ route: '/admin/accounts/acc1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Change password' }));
    const dialog = screen.getByRole('dialog', { name: 'Change owner password' });
    const save = within(dialog).getByRole('button', { name: 'Change password' });
    expect(save).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/New password/), 'green-falcon-77');
    await userEvent.type(within(dialog).getByLabelText(/Repeat password/), 'different');
    expect(within(dialog).getByText("Passwords don't match.")).toBeInTheDocument();
    expect(save).toBeDisabled();
    await userEvent.clear(within(dialog).getByLabelText(/Repeat password/));
    await userEvent.type(within(dialog).getByLabelText(/Repeat password/), 'green-falcon-77');
    await userEvent.click(save);
    expect(await within(dialog).findByText('This password is too common.')).toBeInTheDocument();
    await userEvent.click(save);
    expect(api.setOwnerPassword).toHaveBeenLastCalledWith('acc1', 'green-falcon-77');
    expect(await screen.findByText('Password changed')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('says Set password for an owner invited earlier; Cancel closes', async () => {
    signInAs('superadmin');
    const invited = detail();
    api.account.mockResolvedValue({
      ...invited,
      owner: { ...invited.owner, status: 'invited' } as AdminAccountDetail['owner'],
    });
    renderWithProviders({ route: '/admin/accounts/acc1' });
    expect(await screen.findByText(/hasn't set a password yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('API key limits (superadmin)', () => {
  it('saves valid limits, clears them, and refuses out-of-range values', async () => {
    signInAs('superadmin');
    api.account.mockResolvedValue({
      ...detail(),
      apiLimits: { readsPerMinute: 700, writesPerMinute: 70 },
    });
    api.setApiLimits.mockResolvedValue({});
    renderWithProviders({ route: '/admin/accounts/acc1' });
    const reads = await screen.findByLabelText(/^Reads/);
    const writes = screen.getByLabelText(/^Writes/);
    expect(reads).toHaveValue('700');
    const save = screen.getByRole('button', { name: 'Save API limits' });
    await userEvent.clear(writes);
    await userEvent.type(writes, '601');
    expect(save).toBeDisabled();
    await userEvent.clear(writes);
    await userEvent.type(writes, '100');
    await userEvent.click(save);
    expect(api.setApiLimits).toHaveBeenLastCalledWith('acc1', {
      readsPerMinute: 700,
      writesPerMinute: 100,
    });
    expect(await screen.findByText(/API limits saved/)).toBeInTheDocument();
    await userEvent.clear(reads);
    await userEvent.clear(writes);
    await userEvent.click(save);
    expect(api.setApiLimits).toHaveBeenLastCalledWith('acc1', null);
  });
});

describe('Phone line (superadmin, Phase 18)', () => {
  it('moves the account to the phone line after a confirm and saves the SIP settings', async () => {
    signInAs('superadmin');
    api.account.mockResolvedValue(detail());
    api.setVoiceLine.mockResolvedValue({ voiceLine: 'sip' });
    api.setSipSettings.mockResolvedValue({});
    renderWithProviders({ route: '/admin/accounts/acc1' });
    expect(await screen.findByText(/Test line: calls are simulated/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Move to the phone line' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(api.setVoiceLine).toHaveBeenCalledWith('acc1', 'sip'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const pulse = screen.getByLabelText('Billing pulse (seconds)');
    await userEvent.type(pulse, '90');
    expect(screen.getByText('1 to 60')).toBeInTheDocument();
    await userEvent.clear(pulse);
    await userEvent.type(pulse, '30');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.setSipSettings).toHaveBeenCalledWith('acc1', {
        pulseSec: 30,
        spendMinutesPerHour: null,
      }),
    );
  });

  it('warns when an account on the phone line has no number', async () => {
    signInAs('superadmin');
    api.account.mockResolvedValue({ ...detail(), voiceLine: 'sip' });
    renderWithProviders({ route: '/admin/accounts/acc1' });
    expect(await screen.findByText(/No number given to this account/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move to the test line' })).toBeInTheDocument();
  });
});

describe('Admin accounts list', () => {
  it('is only for platform admins', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/admin/accounts' });
    expect(await screen.findByRole('heading', { level: 1, name: '403' })).toBeInTheDocument();
    expect(api.accounts).not.toHaveBeenCalled();
  });

  it('sends an impersonating admin to the customer dashboard', async () => {
    signInAs('superadmin', {
      impersonation: {
        impersonatorId: 'sa',
        expiresAt: '2026-10-08T00:30:00Z',
        mode: 'view',
        kind: 'superadmin',
        returnTo: '/admin/accounts/a1',
      },
    });
    renderWithProviders({ route: '/admin/accounts' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(api.accounts).not.toHaveBeenCalled();
  });

  it('lists accounts, searches (debounced) and filters by status', async () => {
    signInAs('superadmin');
    api.accounts.mockResolvedValue({
      success: true,
      data: [ROW],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    renderWithProviders({ route: '/admin' });
    expect(await screen.findByRole('link', { name: 'Demo Finance' })).toHaveAttribute(
      'href',
      '/admin/accounts/acc1',
    );
    expect(screen.getByText('asha@example.com')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search name, slug or owner email'), ' demo ');
    await waitFor(() =>
      expect(api.accounts).toHaveBeenLastCalledWith({ page: 1, limit: 20, search: 'demo' }),
    );
    await userEvent.click(screen.getByLabelText('Status'));
    await userEvent.click(screen.getByRole('option', { name: 'Suspended' }));
    await waitFor(() =>
      expect(api.accounts).toHaveBeenLastCalledWith({
        page: 1,
        limit: 20,
        status: 'suspended',
        search: 'demo',
      }),
    );
    await userEvent.click(screen.getByRole('combobox', { name: /rows per page/i }));
    await userEvent.click(screen.getByRole('option', { name: '50' }));
    await waitFor(() =>
      expect(api.accounts).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 50 })),
    );
  });

  it('shows an empty state and errors', async () => {
    signInAs('superadmin');
    api.accounts.mockRejectedValueOnce(
      new ApiError({ status: 500, code: 'INTERNAL_ERROR', kind: 'http', message: 'Boom' }),
    );
    api.accounts.mockResolvedValue({
      success: true,
      data: [{ ...ROW, ownerEmail: null }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    renderWithProviders({ route: '/admin/accounts' });
    expect(await screen.findByText('Boom')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('—')).toBeInTheDocument();
  });
});

describe('Admin account detail', () => {
  it('caps how long the account keeps data (empty = platform default)', async () => {
    const user = userEvent.setup();
    signInAs('superadmin');
    api.account.mockResolvedValue(detail());
    api.setRetentionCap.mockResolvedValue(fakeRetention());
    renderWithProviders({ route: '/admin/accounts/acc1' });
    const card = await screen.findByRole('region', { name: 'Data retention limit' });
    expect(
      within(card).getByText(/recordings 180 days, call records 180 days, WhatsApp chats 90 days/),
    ).toBeInTheDocument();
    const calls = within(card).getByLabelText('Call records at most (days)');
    await user.type(calls, '5');
    expect(within(card).getByText('Between 7 and 180 days')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Save limit' })).toBeDisabled();
    await user.clear(calls);
    await user.type(calls, '60');
    await user.click(within(card).getByRole('button', { name: 'Save limit' }));
    await waitFor(() =>
      expect(api.setRetentionCap).toHaveBeenCalledWith('acc1', { callsDays: 60, inboxDays: null }),
    );
    expect(await screen.findByText('Retention limit saved')).toBeInTheDocument();
  });

  it('shows a refused cap and chats kept forever', async () => {
    const user = userEvent.setup();
    signInAs('superadmin');
    api.account.mockResolvedValue({
      ...detail(),
      retention: fakeRetention({
        effective: { recordingsDays: 180, callsDays: 180, inboxDays: null },
        platform: { callsDays: 180, inboxDays: null },
      }),
    });
    api.setRetentionCap.mockRejectedValue(
      new ApiError({
        status: 422,
        code: 'RETENTION_OUT_OF_BOUNDS',
        message: 'Cap WhatsApp chats between 30 and 3650 days.',
        kind: 'http',
      }),
    );
    renderWithProviders({ route: '/admin/accounts/acc1' });
    const card = await screen.findByRole('region', { name: 'Data retention limit' });
    expect(within(card).getByText(/WhatsApp chats forever/)).toBeInTheDocument();
    await user.type(within(card).getByLabelText('WhatsApp chats at most (days)'), '400');
    await user.click(within(card).getByRole('button', { name: 'Save limit' }));
    expect(await within(card).findByText(/Cap WhatsApp chats between/)).toBeInTheDocument();
  });

  it('shows the overview, recent activity and the billing tabs', async () => {
    signInAs('superadmin');
    api.account.mockResolvedValue(detail());
    renderWithProviders({ route: '/admin/accounts/acc1' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Demo Finance' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Asha Verma · asha@example.com')).toBeInTheDocument();
    expect(screen.getByText('3 total · 2 active · 1 invited · 0 disabled')).toBeInTheDocument();
    expect(screen.getByText('Hinglish')).toBeInTheDocument();
    // Phase 11: the account's WhatsApp billing region (payer + price override)
    expect(await screen.findByRole('region', { name: 'WhatsApp billing' })).toBeInTheDocument();
    expect(screen.getByText('email: new@example.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Rates' }));
    // Rates / Wallet content is covered in features/admin-billing tests
    expect(screen.getByRole('tab', { name: 'Rates', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Wallet' })).toBeInTheDocument();
    expect(api.account).toHaveBeenCalledWith('acc1');
  });

  it('suspends with a reason', async () => {
    signInAs('superadmin');
    api.account.mockResolvedValue(detail());
    api.suspend
      .mockRejectedValueOnce(
        new ApiError({
          status: 409,
          code: 'CONFLICT_INVALID_STATE',
          kind: 'http',
          message: 'The account is already suspended.',
        }),
      )
      .mockResolvedValueOnce({ ...base.account, status: 'suspended' });
    renderWithProviders({ route: '/admin/accounts/acc1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Suspend' }));
    const dialog = screen.getByRole('dialog', { name: 'Suspend Demo Finance?' });
    const submit = within(dialog).getByRole('button', { name: 'Suspend account' });
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'no');
    expect(submit).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Reason'), 't paid');
    expect(within(dialog).getByText('8/200')).toBeInTheDocument();
    await userEvent.click(submit);
    expect(
      await within(dialog).findByText('The account is already suspended.'),
    ).toBeInTheDocument();
    await userEvent.click(submit);
    await waitFor(() => expect(api.suspend).toHaveBeenLastCalledWith('acc1', 'not paid'));
    expect(await screen.findByText('Demo Finance suspended')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('cancels suspending', async () => {
    signInAs('superadmin');
    api.account.mockResolvedValue(detail());
    renderWithProviders({ route: '/admin/accounts/acc1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Suspend' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.suspend).not.toHaveBeenCalled();
  });

  it('enables a suspended account after confirming', async () => {
    signInAs('superadmin');
    api.account.mockResolvedValue(detail({ status: 'suspended', suspendReason: 'Unpaid' }));
    api.enable.mockResolvedValue({ ...base.account, status: 'active' });
    renderWithProviders({ route: '/admin/accounts/acc1' });
    expect(await screen.findByText('Suspended: Unpaid')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Enable' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Enable Demo Finance?' })).getByRole('button', {
        name: 'Enable',
      }),
    );
    await waitFor(() => expect(api.enable).toHaveBeenCalledWith('acc1'));
    expect(await screen.findByText('Demo Finance enabled')).toBeInTheDocument();
  });

  it('impersonates the owner after confirming and keeps the admin session', async () => {
    const admin = signInAs('superadmin');
    api.account.mockResolvedValue(detail());
    api.impersonate.mockResolvedValue(
      fakeSession('owner', {
        expiresIn: 1800,
        impersonation: {
          impersonatorId: admin.user.id,
          expiresAt: '2026-10-08T00:30:00Z',
          mode: 'view',
          kind: 'superadmin',
          returnTo: '/admin/accounts/acc1',
        },
      }),
    );
    renderWithProviders({ route: '/admin/accounts/acc1' });
    await userEvent.click(await screen.findByRole('button', { name: 'View as' }));
    const dialog = screen.getByRole('dialog', { name: 'View as the owner of Demo Finance?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start viewing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    const state = useAuthStore.getState();
    expect(state.session?.impersonation?.impersonatorId).toBe(admin.user.id);
    expect(state.savedSession?.user.platformRole).toBe('superadmin');
    expect(api.impersonate).toHaveBeenCalledWith('acc1', 'view');
  });

  it('Log in as asks first and starts an act session (Phase 19)', async () => {
    signInAs('superadmin');
    api.account.mockResolvedValue(detail());
    api.impersonate.mockResolvedValue(fakeSession('owner'));
    renderWithProviders({ route: '/admin/accounts/acc1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Log in as' }));
    const dialog = screen.getByRole('dialog', { name: 'Log in as the owner of Demo Finance?' });
    expect(within(dialog).getByText(/payments, ownership/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(api.impersonate).toHaveBeenCalledWith('acc1', 'act'));
  });

  it('does nothing when impersonation is cancelled; shows impersonation errors', async () => {
    signInAs('superadmin');
    api.account.mockResolvedValue(detail());
    api.impersonate.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'CONFLICT_INVALID_STATE',
        kind: 'http',
        message: 'This account has no active owner to view as.',
      }),
    );
    renderWithProviders({ route: '/admin/accounts/acc1' });
    await userEvent.click(await screen.findByRole('button', { name: 'View as' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    );
    expect(api.impersonate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'View as' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Start viewing' }),
    );
    expect(
      await screen.findAllByText('This account has no active owner to view as.'),
    ).not.toHaveLength(0);
  });

  it('disables impersonation without an owner and shows load errors', async () => {
    signInAs('superadmin');
    api.account
      .mockRejectedValueOnce(
        new ApiError({ status: 404, code: 'NOT_FOUND', kind: 'http', message: 'Not found.' }),
      )
      .mockResolvedValue({ ...detail(), owner: null as unknown as AdminAccountDetail['owner'] });
    renderWithProviders({ route: '/admin/accounts/acc1' });
    expect(await screen.findByText('Not found.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'View as' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Log in as' })).toBeDisabled();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('calling limits: validated save, pause all (confirmed), resume an admin pause', async () => {
    const user = userEvent.setup();
    signInAs('superadmin');
    api.account.mockResolvedValue(detail());
    api.setLimits.mockResolvedValue({ maxConcurrentCalls: 25, dialsPerMinute: 60 });
    renderWithProviders({ route: '/admin/accounts/acc1' });
    const card = await screen.findByRole('region', { name: 'Calling limits' });
    expect(
      within(card).getByText(/Active campaigns \(scheduled, running or paused\): 1/),
    ).toBeInTheDocument();
    const save = within(card).getByRole('button', { name: 'Save limits' });
    expect(save).toBeDisabled();
    const max = within(card).getByLabelText('Max concurrent calls');
    await user.clear(max);
    await user.type(max, '500');
    expect(save).toBeDisabled();
    await user.clear(max);
    await user.type(max, '25');
    await user.click(save);
    await waitFor(() =>
      expect(api.setLimits).toHaveBeenCalledWith('acc1', {
        maxConcurrentCalls: 25,
        dialsPerMinute: 60,
      }),
    );
    expect(await screen.findByText('Limits saved')).toBeInTheDocument();

    api.pauseCampaigns.mockResolvedValue({ paused: 2 });
    api.account.mockResolvedValue({
      ...detail(),
      adminPausedCampaigns: [
        { id: 'cp1', name: 'October recovery' },
        { id: 'cp2', name: 'Daily reminders' },
      ],
    });
    await user.click(within(card).getByRole('button', { name: 'Pause all campaigns' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Only a superadmin can resume them/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Pause all' }));
    await waitFor(() => expect(api.pauseCampaigns).toHaveBeenCalledWith('acc1'));
    expect(await screen.findByText('2 campaigns paused')).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Paused by the platform team' });
    api.resumeCampaign.mockRejectedValueOnce(
      new ApiError({
        status: 409,
        code: 'CONFLICT_INVALID_STATE',
        kind: 'http',
        message: 'Only a campaign paused by the platform team is resumed here.',
      }),
    );
    await user.click(within(list).getByRole('button', { name: 'Resume Daily reminders' }));
    expect(
      await screen.findByText('Only a campaign paused by the platform team is resumed here.'),
    ).toBeInTheDocument();
    api.resumeCampaign.mockResolvedValue({ id: 'cp1', status: 'running' });
    await user.click(within(list).getByRole('button', { name: 'Resume October recovery' }));
    await waitFor(() => expect(api.resumeCampaign).toHaveBeenLastCalledWith('acc1', 'cp1'));
    expect(await screen.findByText('Campaign resumed')).toBeInTheDocument();
  });
});
