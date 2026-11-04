import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { phoneNumbersApi } from '@/services/api/phone-numbers';
import type { PhoneNumber } from '@/services/api/types';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/phone-numbers', async (original) => ({
  ...(await original<object>()),
  phoneNumbersApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    assign: vi.fn(),
    release: vi.fn(),
    line: vi.fn(),
    mine: vi.fn(),
  },
}));
vi.mock('@/services/api/admin', () => ({
  adminApi: { accounts: vi.fn(() => Promise.resolve({ data: [{ id: 'acc1', name: 'Acme' }] })) },
}));
vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))), me: vi.fn() },
}));

const api = vi.mocked(phoneNumbersApi);
afterEach(() => vi.clearAllMocks());

const number = (over: Partial<PhoneNumber> = {}): PhoneNumber => ({
  id: 'n1',
  number: '+911600123456',
  kind: '1600',
  accountId: null,
  accountName: null,
  purpose: 'outbound',
  label: 'Main',
  dltPrincipalEntityId: null,
  status: 'active',
  warnings: [],
  createdAt: '2026-11-03T00:00:00Z',
  ...over,
});

const open = () => {
  signInAs('superadmin');
  renderWithProviders({ route: '/admin/phone-numbers' });
};

describe('Admin → Phone numbers (Phase 18)', () => {
  it('lists numbers with their account and adds one', async () => {
    api.list.mockResolvedValue([
      number(),
      number({
        id: 'n2',
        number: '+912240001234',
        accountId: 'acc1',
        accountName: 'Acme',
        warnings: ['not_1600_series'],
      }),
    ]);
    api.create.mockResolvedValue(number({ id: 'n3', number: '+911600999999' }));
    open();
    expect(await screen.findByText('+911600123456')).toBeInTheDocument();
    expect(screen.getByText('In the pool')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Not 1600')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add number' }));
    const dialog = await screen.findByRole('dialog');
    const add = within(dialog).getByRole('button', { name: 'Add' });
    expect(add).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Number'), '+911600999999');
    await user.click(add);
    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({ number: '+911600999999', kind: '1600', label: '' }),
    );
  });

  it('gives a number to an account, takes one back and turns one off', async () => {
    api.list.mockResolvedValue([
      number(),
      number({ id: 'n2', number: '+911600222222', accountId: 'acc1', accountName: 'Acme' }),
    ]);
    api.assign.mockResolvedValue(number({ accountId: 'acc1', accountName: 'Acme' }));
    api.release.mockResolvedValue(number());
    api.update.mockResolvedValue(number({ status: 'disabled' }));
    open();
    await screen.findByText('+911600123456');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Give' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Account'));
    await user.click(await screen.findByRole('option', { name: 'Acme' }));
    await user.click(within(dialog).getByRole('button', { name: 'Give' }));
    await waitFor(() => expect(api.assign).toHaveBeenCalledWith('n1', 'acc1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(await screen.findByRole('button', { name: 'Take back' }));
    await waitFor(() => expect(api.release).toHaveBeenCalledWith('n2'));
    await user.click(screen.getAllByRole('button', { name: 'Turn off' })[0]!);
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('n1', { status: 'disabled' }));
  });

  it('says what to do when there are no numbers', async () => {
    api.list.mockResolvedValue([]);
    open();
    expect(await screen.findByText(/No numbers yet/)).toBeInTheDocument();
  });
});
