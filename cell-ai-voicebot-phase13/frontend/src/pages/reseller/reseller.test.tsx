import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth/store';
import { resellersApi } from '@/services/api/resellers';
import type { ResellerCustomer, ResellerCustomerDetail } from '@/services/api/types';
import { fakeSession, signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/resellers', () => ({
  resellersApi: {
    summary: vi.fn(),
    customers: vi.fn(),
    customer: vi.fn(),
    createCustomer: vi.fn(),
    updateCustomer: vi.fn(),
    setOwnerPassword: vi.fn(),
    loginAs: vi.fn(),
    credit: vi.fn(),
    statement: vi.fn(),
    statementCsv: vi.fn(),
    settings: vi.fn(),
    updateSettings: vi.fn(),
    walletProvider: vi.fn(),
  },
}));

const api = vi.mocked(resellersApi);
afterEach(() => vi.clearAllMocks());

const asReseller = (status: 'active' | 'pending_approval' = 'active') => {
  const s = fakeSession('owner');
  signInAs('owner', {
    account: { ...s.account, kind: 'reseller', reseller: { status, customersCanTopUp: false } },
    permissions: [...s.permissions, 'reseller.read', 'reseller.manage'],
  });
};
const CUSTOMER: ResellerCustomer = {
  id: 'c1',
  name: 'Shop One',
  status: 'active',
  owner: { name: 'Ravi', email: 'ravi@example.com' },
  wallet: { balanceMicros: 500_000_000, availableMicros: 500_000_000 },
  spend30dMicros: 20_000_000,
  lastActiveAt: null,
  createdAt: '2026-11-01T00:00:00Z',
};
const DETAIL: ResellerCustomerDetail = { ...CUSTOMER, timezone: 'Asia/Kolkata', transfers: [] };

describe('reseller panel (T19.8)', () => {
  it('only reseller accounts: the nav item and the page', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/reseller' });
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Reseller' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('link', { name: 'Reseller' })).not.toBeInTheDocument();
  });

  it('dashboard numbers, pending banner and the nav item', async () => {
    asReseller('pending_approval');
    api.summary.mockResolvedValue({
      customers: { active: 3, suspended: 1, total: 4 },
      creditGivenThisMonthMicros: 1_500_000_000,
      customersSpend30d: { calls: 0, whatsapp: 0, ai: 0, totalMicros: 250_000_000 },
      lowBalanceCustomers: [{ id: 'c1', name: 'Shop One', availableMicros: 10_000_000 }],
    });
    renderWithProviders({ route: '/reseller' });
    expect(await screen.findByText('Active customers')).toBeInTheDocument();
    expect(screen.getByText(/waiting for approval/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shop One' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Reseller' }).length).toBeGreaterThan(0);
  });

  it('customers list and Add customer (password, starting credit)', async () => {
    asReseller();
    api.customers.mockResolvedValue({
      success: true,
      data: [CUSTOMER],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    api.createCustomer.mockResolvedValue({ ...CUSTOMER, id: 'c2', name: 'New Co' });
    api.customer.mockResolvedValue({ ...DETAIL, id: 'c2', name: 'New Co' });
    renderWithProviders({ route: '/reseller/customers' });
    const table = await screen.findByRole('table', { name: 'Customers' });
    expect(await within(table).findByRole('link', { name: 'Shop One' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add customer' }));
    const d = screen.getByRole('dialog', { name: 'Add customer' });
    const add = within(d).getByRole('button', { name: 'Add customer' });
    expect(add).toBeDisabled();
    await userEvent.type(within(d).getByLabelText('Business name'), 'New Co');
    await userEvent.type(within(d).getByLabelText('Owner name'), 'Meera');
    await userEvent.type(within(d).getByLabelText('Owner email'), 'meera@example.com');
    await userEvent.click(within(d).getByRole('button', { name: 'Generate' }));
    await userEvent.type(within(d).getByLabelText(/Starting credit/), '250');
    await userEvent.click(add);
    await waitFor(() =>
      expect(api.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          businessName: 'New Co',
          ownerEmail: 'meera@example.com',
          startingCreditMicros: 250_000_000,
        }),
        expect.any(String),
      ),
    );
  });

  it('customer page: add credit, suspend, log in as', async () => {
    asReseller();
    api.customer.mockResolvedValue(DETAIL);
    api.credit.mockResolvedValue({
      transferId: 't1',
      amountMicros: 100_000_000,
      resellerBalanceMicros: 0,
      customerBalanceMicros: 600_000_000,
      replay: false,
    });
    api.updateCustomer.mockResolvedValue({ ...DETAIL, status: 'suspended' });
    api.loginAs.mockResolvedValue(fakeSession('owner'));
    renderWithProviders({ route: '/reseller/customers/c1' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Shop One' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add credit' }));
    const d = screen.getByRole('dialog', { name: 'Add credit to Shop One' });
    await userEvent.type(within(d).getByLabelText('Amount in ₹'), '100');
    await userEvent.click(within(d).getByRole('button', { name: 'Add credit' }));
    await waitFor(() =>
      expect(api.credit).toHaveBeenCalledWith(
        'c1',
        'give',
        { amountMicros: 100_000_000 },
        expect.any(String),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspend' }),
    );
    await waitFor(() =>
      expect(api.updateCustomer).toHaveBeenCalledWith('c1', { status: 'suspended' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Log in as' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Log in' }),
    );
    await waitFor(() => expect(api.loginAs).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(useAuthStore.getState().savedSession).not.toBeNull());
  });

  it('settings switch', async () => {
    asReseller();
    api.settings.mockResolvedValue({ customersCanTopUp: false });
    api.updateSettings.mockResolvedValue({ customersCanTopUp: true });
    renderWithProviders({ route: '/reseller/settings' });
    await userEvent.click(await screen.findByRole('switch'));
    await waitFor(() =>
      expect(api.updateSettings).toHaveBeenCalledWith({ customersCanTopUp: true }),
    );
  });
});
