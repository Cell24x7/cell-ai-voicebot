import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reloadMe } from '@/features/auth/session';
import { useAuthStore } from '@/features/auth/store';
import { accountApi } from '@/services/api/account';
import { ApiError } from '@/services/api/errors';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

import { DataRightsSection } from './DataRightsSection';

vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))) },
}));
vi.mock('@/features/auth/session', async (original) => ({
  ...(await original<object>()),
  reloadMe: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/services/api/account', () => ({
  accountApi: {
    startExport: vi.fn(),
    exports: vi.fn(),
    exportDetail: vi.fn(),
    scheduleDelete: vi.fn(),
    cancelDelete: vi.fn(),
  },
}));

const api = vi.mocked(accountApi);
const row = (status: 'ready' | 'running' | 'failed') =>
  ({
    id: 'e1',
    status,
    includeRecordings: false,
    sizeBytes: 1,
    counts: {},
    expiresAt: null,
    createdAt: 'x',
  }) as never;
const show = () => renderWithProviders({ routes: [{ path: '/', element: <DataRightsSection /> }] });
const setDeletion = () => {
  const { session } = useAuthStore.getState();
  if (!session) throw new Error('not signed in');
  useAuthStore.setState({
    session: {
      ...session,
      account: {
        ...session.account,
        deletion: { status: 'scheduled', scheduledFor: '2026-11-08T00:00:00.000Z' },
      },
    },
  });
};
const refused = (message: string) =>
  new ApiError({ status: 422, code: 'REAUTH_FAILED', message, kind: 'http' });

beforeEach(() => api.exports.mockResolvedValue([]));
afterEach(() => vi.clearAllMocks());

describe('DataRightsSection', () => {
  it('shows nothing to someone without the permissions', () => {
    signInAs('admin');
    show();
    expect(screen.queryByText('Your data')).toBeNull();
  });

  it('starts an export after the password; a wrong password stays in the dialog', async () => {
    signInAs('owner');
    api.startExport
      .mockRejectedValueOnce(refused('That password is not correct.'))
      .mockResolvedValueOnce(row('running'));
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Export all data' }));
    const start = screen.getByRole('button', { name: 'Start export' });
    expect(start).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Your password/), 'secret-pass-1');
    await userEvent.click(screen.getByLabelText(/Include call recordings/));
    await userEvent.click(start);
    expect(await screen.findByText('That password is not correct.')).toBeInTheDocument();
    await userEvent.click(start);
    expect(api.startExport).toHaveBeenLastCalledWith({
      password: 'secret-pass-1',
      includeRecordings: true,
    });
    expect(await screen.findByText(/Export started/)).toBeInTheDocument();
  });

  it('shows a running export, a failure, and downloads a ready one', async () => {
    signInAs('owner');
    api.exports.mockResolvedValue([row('running')]);
    const first = show();
    expect(await screen.findByRole('button', { name: 'Export running…' })).toBeDisabled();
    first.unmount();
    api.exports.mockResolvedValue([row('failed')]);
    const second = show();
    expect(await screen.findByText(/could not be finished/)).toBeInTheDocument();
    second.unmount();
    api.exports.mockResolvedValue([row('ready')]);
    api.exportDetail.mockRejectedValueOnce(refused('Gone.'));
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Download latest export' }));
    expect(api.exportDetail).toHaveBeenCalledWith('e1');
    expect(await screen.findByText('Gone.')).toBeInTheDocument();
  });

  it('deletes only with the exact name and password', async () => {
    signInAs('owner');
    api.scheduleDelete.mockResolvedValue({ status: 'scheduled', scheduledFor: 'x' });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete account' }));
    const name = useAuthStore.getState().session?.account.name ?? '';
    const confirm = screen.getAllByRole('button', { name: 'Delete account' }).at(-1) as HTMLElement;
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/to confirm/), name);
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Your password/), 'secret-pass-1');
    await userEvent.click(confirm);
    await waitFor(() =>
      expect(api.scheduleDelete).toHaveBeenCalledWith({
        password: 'secret-pass-1',
        confirmName: name,
      }),
    );
    expect(reloadMe).toHaveBeenCalled();
  });

  it('shows the grace banner and cancels', async () => {
    signInAs('owner');
    setDeletion();
    api.cancelDelete.mockResolvedValue({ canceled: true });
    show();
    expect(await screen.findByText(/will be deleted on/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete account' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel deletion' }));
    expect(await screen.findByText('Deletion canceled')).toBeInTheDocument();
    expect(reloadMe).toHaveBeenCalled();
  });
});
