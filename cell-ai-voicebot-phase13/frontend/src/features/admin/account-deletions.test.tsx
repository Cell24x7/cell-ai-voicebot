import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { adminApi } from '@/services/api/admin';
import { ApiError } from '@/services/api/errors';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

import { AccountDeletionsCard } from './AccountDeletionsCard';

vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))) },
}));
vi.mock('@/services/api/admin', () => ({
  adminApi: { accountDeletions: vi.fn(), cancelDeletion: vi.fn(), runDeletion: vi.fn() },
}));

const api = vi.mocked(adminApi);
const row = (id: string, scheduledFor: string | null) => ({
  id,
  name: `Biz ${id}`,
  status: 'scheduled' as const,
  requestedAt: null,
  scheduledFor,
  balanceMicros: 5_000_000,
});
const show = () => {
  signInAs('superadmin');
  return renderWithProviders({ routes: [{ path: '/', element: <AccountDeletionsCard /> }] });
};

afterEach(() => vi.clearAllMocks());

describe('AccountDeletionsCard', () => {
  it('is empty without pending deletes', async () => {
    api.accountDeletions.mockResolvedValue([]);
    show();
    await waitFor(() => expect(api.accountDeletions).toHaveBeenCalled());
    expect(screen.queryByText(/waiting to be deleted/)).toBeNull();
  });

  it('cancels; deletes now only after the grace, and asks first', async () => {
    api.accountDeletions.mockResolvedValue([
      row('a', '2020-01-01T00:00:00.000Z'),
      row('b', '2999-01-01T00:00:00.000Z'),
      row('c', null),
    ]);
    api.cancelDeletion.mockResolvedValue({ canceled: true });
    api.runDeletion.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'CONFLICT_INVALID_STATE',
        message: 'Not yet.',
        kind: 'http',
      }),
    );
    show();
    expect(await screen.findByText(/Biz a · 2020-01-01/)).toBeInTheDocument();
    const now = screen.getAllByRole('button', { name: 'Delete now' });
    expect(now[1]).toBeDisabled();
    expect(now[2]).toBeDisabled();
    await userEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[1] as HTMLElement);
    expect(api.cancelDeletion).toHaveBeenCalledWith('b');
    await userEvent.click(now[0] as HTMLElement);
    await userEvent.click(
      (await screen.findAllByRole('button', { name: 'Delete now' })).at(-1) as HTMLElement,
    );
    await waitFor(() => expect(api.runDeletion).toHaveBeenCalledWith('a'));
    expect(await screen.findByText('Not yet.')).toBeInTheDocument();
  });
});
