import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { contactsApi } from '@/services/api/contacts';
import { ApiError } from '@/services/api/errors';
import { renderWithProviders } from '@/test/render';

import { EraseContactsDialog } from './EraseContactsDialog';

vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))) },
}));
vi.mock('@/services/api/contacts', () => ({
  contactsApi: { erase: vi.fn(), bulkErase: vi.fn(), eraseJob: vi.fn() },
}));

const job = (done: number, status: 'running' | 'done') => ({
  id: 'j1',
  status,
  total: 2,
  done,
  retried: 0,
  createdAt: 'x',
  updatedAt: 'x',
});

const show = (ids: string[], label: string) => {
  const onClose = vi.fn();
  const onDone = vi.fn();
  renderWithProviders({
    routes: [
      {
        path: '/',
        element: <EraseContactsDialog ids={ids} label={label} onClose={onClose} onDone={onDone} />,
      },
    ],
  });
  return { onClose, onDone };
};

afterEach(() => vi.clearAllMocks());

describe('EraseContactsDialog', () => {
  const button = () => screen.getByRole('button', { name: 'Erase permanently' });
  const word = () => screen.getByLabelText('Type ERASE to confirm');

  it('needs the exact word, then erases one contact', async () => {
    vi.mocked(contactsApi.erase).mockResolvedValue({ erased: true, counts: {} });
    const { onClose, onDone } = show(['c1'], 'Asha');
    expect(screen.getByText('Erase Asha permanently?')).toBeInTheDocument();
    expect(button()).toBeDisabled();
    await userEvent.type(word(), 'erase');
    expect(button()).toBeDisabled();
    await userEvent.clear(word());
    await userEvent.type(word(), 'ERASE');
    await userEvent.click(button());
    await waitFor(() => expect(contactsApi.erase).toHaveBeenCalledWith('c1'));
    expect(await screen.findByText('Asha erased')).toBeInTheDocument();
    expect(onDone).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows a refusal, such as a live call', async () => {
    vi.mocked(contactsApi.erase).mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'CONTACT_ERASE_BLOCKED',
        message: 'This contact is on a live call.',
        kind: 'http',
      }),
    );
    const { onDone } = show(['c1'], 'Asha');
    await userEvent.type(word(), 'ERASE');
    await userEvent.click(button());
    expect(await screen.findByText('This contact is on a live call.')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('runs several as a job with progress and finishes by itself', async () => {
    vi.mocked(contactsApi.bulkErase).mockResolvedValue(job(0, 'running'));
    vi.mocked(contactsApi.eraseJob)
      .mockResolvedValueOnce(job(1, 'running'))
      .mockResolvedValue(job(2, 'done'));
    const { onDone } = show(['c1', 'c2'], '2 contacts');
    await userEvent.type(word(), 'ERASE');
    await userEvent.click(button());
    expect(contactsApi.bulkErase).toHaveBeenCalledWith(['c1', 'c2']);
    expect(await screen.findByText(/1 of 2 erased/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Erase progress' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce(), { timeout: 4000 });
  });
});
