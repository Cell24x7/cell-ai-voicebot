import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { adminApi } from '@/services/api/admin';
import type { AdminAccountDetail, AdminAccountRow } from '@/services/api/types';
import { fakeSession, signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';
import { fakeRetention } from '@/test/retention';

vi.mock('@/services/api/admin', () => ({
  adminApi: {
    accounts: vi.fn(),
    account: vi.fn(),
    createAccount: vi.fn(),
    signupSettings: vi.fn(),
    setSignupSettings: vi.fn(),
    setReseller: vi.fn(),
    approveReseller: vi.fn(),
    suspendCustomers: vi.fn(),
    accountDeletions: vi.fn(() => Promise.resolve([])),
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

const row = (over: Partial<AdminAccountRow> = {}): AdminAccountRow => ({
  id: 'r1',
  name: 'Agency One',
  slug: 'agency-one',
  status: 'active',
  ownerEmail: 'r@example.com',
  usersCount: 1,
  kind: 'reseller',
  parent: null,
  customersCount: 4,
  resellerStatus: 'active',
  createdAt: '2026-10-01T00:00:00Z',
  ...over,
});
const page = (data: AdminAccountRow[]) => ({
  success: true as const,
  data,
  meta: { page: 1, limit: 20, total: data.length, totalPages: 1 },
});

describe('Admin: resellers (T19.4)', () => {
  it('list: type column, type filter, signup card saves', async () => {
    signInAs('superadmin');
    api.accounts.mockResolvedValue(
      page([
        row(),
        row({
          id: 'b1',
          name: 'Shop',
          kind: 'business',
          parent: { id: 'r1', name: 'Agency One' },
          customersCount: null,
          resellerStatus: null,
        }),
      ]),
    );
    api.signupSettings.mockResolvedValue({ open: true, resellerSignup: 'open' });
    api.setSignupSettings.mockResolvedValue({ open: true, resellerSignup: 'approval' });
    renderWithProviders({ route: '/admin/accounts' });
    const table = await screen.findByRole('table', { name: 'Accounts' });
    expect(await within(table).findByText('Reseller · 4 customers')).toBeInTheDocument();
    expect(within(table).getByText('Customer of Agency One')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Type'));
    await userEvent.click(await screen.findByRole('option', { name: 'Resellers' }));
    await waitFor(() =>
      expect(api.accounts).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'reseller' })),
    );
    const card = screen.getByRole('region', { name: 'Signup' });
    await userEvent.click(within(card).getByLabelText('Reseller signup'));
    await userEvent.click(await screen.findByRole('option', { name: 'Needs approval' }));
    await waitFor(() =>
      expect(api.setSignupSettings).toHaveBeenCalledWith({
        open: true,
        resellerSignup: 'approval',
      }),
    );
  });

  it('?reseller= shows one reseller’s customers', async () => {
    signInAs('superadmin');
    api.accounts.mockResolvedValue(page([]));
    api.signupSettings.mockResolvedValue({ open: true, resellerSignup: 'open' });
    renderWithProviders({ route: '/admin/accounts?reseller=r1' });
    expect(await screen.findByText(/customers of one reseller/)).toBeInTheDocument();
    expect(api.accounts).toHaveBeenCalledWith(expect.objectContaining({ parentAccountId: 'r1' }));
  });

  it('add account: a reseller, or a business under a reseller', async () => {
    signInAs('superadmin');
    api.accounts.mockResolvedValue(page([row()]));
    api.signupSettings.mockResolvedValue({ open: true, resellerSignup: 'open' });
    api.createAccount.mockResolvedValue({ ...fakeSession('owner').account, id: 'n1' });
    renderWithProviders({ route: '/admin/accounts' });
    await userEvent.click(await screen.findByRole('button', { name: 'Add account' }));
    const dialog = screen.getByRole('dialog', { name: 'Add account' });
    await userEvent.type(within(dialog).getByLabelText('Business name'), 'Shop');
    await userEvent.type(within(dialog).getByLabelText('Owner name'), 'Ravi');
    await userEvent.type(within(dialog).getByLabelText('Owner email'), 'ravi@example.com');
    await userEvent.type(within(dialog).getByLabelText('Owner password'), 'green-falcon-lake-77');
    await userEvent.click(within(dialog).getByLabelText('Reseller (optional)'));
    await userEvent.click(await screen.findByRole('option', { name: 'Agency One' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create account' }));
    await waitFor(() =>
      expect(api.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'business', parentAccountId: 'r1' }),
      ),
    );
  });

  it('account page: approve a pending reseller; move a business', async () => {
    signInAs('superadmin');
    const base = fakeSession('owner');
    const detail = (account: Partial<AdminAccountDetail['account']>) =>
      ({
        account: { ...base.account, id: 'acc1', ...account },
        owner: base.user,
        usersCount: 1,
        retention: fakeRetention(),
        apiLimits: null,
        voiceLine: 'dryrun',
        phoneLine: { server: 'dryrun', connected: false },
        sipSettings: { pulseSec: null, spendMinutesPerHour: null },
        usersByStatus: { invited: 0, active: 1, disabled: 0 },
        limits: { maxConcurrentCalls: 5, dialsPerMinute: 10 },
        activeCampaigns: 0,
        adminPausedCampaigns: [],
        whatsappBilling: {
          metaPayer: 'platform',
          markupBps: null,
          fixedPrices: null,
          platformFeeMicros: null,
        },
        whatsappChannels: [],
        recentAudit: [],
      }) as unknown as AdminAccountDetail;
    api.account.mockResolvedValue(
      detail({
        kind: 'reseller',
        reseller: { status: 'pending_approval', customersCanTopUp: false },
      }),
    );
    api.approveReseller.mockResolvedValue(base.account);
    const { unmount } = renderWithProviders({ route: '/admin/accounts/acc1' });
    const card = await screen.findByRole('region', { name: 'Reseller' });
    expect(within(card).getByText('Waiting for approval')).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(api.approveReseller).toHaveBeenCalledWith('acc1'));
    unmount();
    api.account.mockResolvedValue(detail({ kind: 'business', parentAccountId: null }));
    api.accounts.mockResolvedValue(page([row()]));
    api.setReseller.mockResolvedValue(base.account);
    renderWithProviders({ route: '/admin/accounts/acc1' });
    const link = await screen.findByRole('region', { name: 'Reseller' });
    expect(within(link).getByText('Direct customer')).toBeInTheDocument();
    await userEvent.click(within(link).getByRole('button', { name: 'Move to reseller' }));
    const dialog = screen.getByRole('dialog', { name: 'Move to reseller' });
    await userEvent.click(within(dialog).getByLabelText('Reseller'));
    await userEvent.click(await screen.findByRole('option', { name: 'Agency One' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(api.setReseller).toHaveBeenCalledWith('acc1', 'r1'));
  });
});
