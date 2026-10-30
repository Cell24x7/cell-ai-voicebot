import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { contactListsApi } from '@/services/api/contact-lists';
import { dndApi } from '@/services/api/dnd';
import { ApiError } from '@/services/api/errors';
import type { ContactList, DndEntry } from '@/services/api/types';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))) },
}));
vi.mock('@/services/api/contact-lists', () => ({
  contactListsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));
vi.mock('@/services/api/dnd', () => ({ dndApi: { list: vi.fn(), add: vi.fn(), remove: vi.fn() } }));
vi.mock('@/services/api/custom-fields', () => ({
  customFieldsApi: { list: vi.fn(() => Promise.resolve([])) },
}));
vi.mock('@/services/api/segments', () => ({
  segmentsApi: { list: vi.fn(() => Promise.resolve([])) },
}));
vi.mock('@/services/api/contact-exports', async (orig) => ({
  ...(await orig<object>()),
  contactExportsApi: { create: vi.fn(), get: vi.fn() },
}));

const page = <T,>(data: T[], total = data.length) => ({
  success: true as const,
  data,
  meta: { page: 1, limit: 20, total, totalPages: Math.ceil(total / 20) },
});
const list = (id: string, extra: Partial<ContactList> = {}): ContactList => ({
  id,
  name: `List ${id}`,
  description: null,
  source: { type: 'manual', fileName: null },
  contactCount: 3,
  createdAt: '2026-10-09T00:00:00Z',
  updatedAt: '2026-10-09T00:00:00Z',
  ...extra,
});
const entry = (id: string, extra: Partial<DndEntry> = {}): DndEntry => ({
  id,
  phoneE164: '+919876543210',
  reason: null,
  source: 'manual',
  addedBy: 'u1',
  createdAt: '2026-10-09T00:00:00Z',
  ...extra,
});

afterEach(() => vi.clearAllMocks());

describe('Lists tab', () => {
  it('shows lists, searches, creates, renames and deletes', async () => {
    vi.mocked(contactListsApi.list).mockResolvedValue(
      page(
        [
          list('l1', {
            name: 'March',
            source: { type: 'upload', fileName: 'march.csv' },
            contactCount: 89,
            description: 'From the bank',
          }),
          list('l2'),
        ],
        25,
      ),
    );
    vi.mocked(contactListsApi.create)
      .mockRejectedValueOnce(
        new ApiError({ status: 409, code: 'CONFLICT_DUPLICATE', kind: 'http', message: 'dup' }),
      )
      .mockResolvedValueOnce(list('l3'));
    vi.mocked(contactListsApi.update)
      .mockRejectedValueOnce(
        new ApiError({
          status: 409,
          code: 'CONFLICT_INVALID_STATE',
          kind: 'http',
          message: 'Too many lists',
        }),
      )
      .mockResolvedValueOnce(list('l1'));
    vi.mocked(contactListsApi.remove).mockResolvedValue(undefined);
    signInAs('manager');
    renderWithProviders({ route: '/contacts/lists' });
    const table = await screen.findByRole('table', { name: 'Lists' });
    const row = (await within(table).findByRole('link', { name: 'March' })).closest(
      'tr',
    ) as HTMLElement;
    expect(within(row).getByRole('link', { name: 'March' })).toHaveAttribute(
      'href',
      '/contacts/all?listId=l1',
    );
    expect(within(row).getByText('Upload · march.csv')).toBeInTheDocument();
    expect(within(row).getByText('89')).toBeInTheDocument();
    expect(within(row).getByText('From the bank')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Search lists'), 'mar');
    await waitFor(() =>
      expect(contactListsApi.list).toHaveBeenLastCalledWith({ page: 1, limit: 20, q: 'mar' }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'New list' }));
    let dialog = screen.getByRole('dialog', { name: 'New list' });
    expect(within(dialog).getByRole('button', { name: 'Create list' })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('List name'), ' March ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create list' }));
    expect(
      await within(dialog).findByText('A list with this name already exists.'),
    ).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Description (optional)'), 'Bank');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create list' }));
    await waitFor(() =>
      expect(contactListsApi.create).toHaveBeenLastCalledWith({
        name: 'March',
        description: 'Bank',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await userEvent.click(within(row).getByRole('button', { name: 'Rename' }));
    dialog = screen.getByRole('dialog', { name: 'Rename list' });
    expect(within(dialog).getByLabelText('List name')).toHaveValue('March');
    await userEvent.clear(within(dialog).getByLabelText('Description (optional)'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Too many lists')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(contactListsApi.update).toHaveBeenLastCalledWith('l1', {
        name: 'March',
        description: null,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await userEvent.click(within(row).getByRole('button', { name: 'Delete' }));
    dialog = screen.getByRole('dialog', { name: 'Delete list "March"?' });
    expect(within(dialog).getByText(/The 89 contacts stay in your contacts/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete list' }));
    await waitFor(() => expect(contactListsApi.remove).toHaveBeenCalledWith('l1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await userEvent.click(within(row).getByRole('button', { name: 'Export' }));
    const exp = await screen.findByRole('dialog', { name: 'Export contacts' });
    expect(within(exp).getByRole('radio', { name: 'A list' })).toBeChecked();
    await userEvent.click(within(exp).getByRole('button', { name: 'Cancel' }));
  });

  it('explains empty states and failed deletes; read-only roles only browse', async () => {
    vi.mocked(contactListsApi.list).mockResolvedValue(page([]));
    signInAs('viewer');
    const { unmount } = renderWithProviders({ route: '/contacts/lists' });
    expect(await screen.findByText('No lists yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New list' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search lists'), 'zzz');
    expect(await screen.findByText('No lists match')).toBeInTheDocument();
    unmount();

    vi.mocked(contactListsApi.list).mockResolvedValue(page([list('l9')]));
    vi.mocked(contactListsApi.remove).mockRejectedValue(
      new ApiError({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        kind: 'http',
        message: 'List not found',
      }),
    );
    signInAs('owner');
    renderWithProviders({ route: '/contacts/lists' });
    expect(await screen.findByRole('link', { name: 'Create campaign' })).toHaveAttribute(
      'href',
      '/campaigns/new?listId=l9',
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete list' }),
    );
    expect(await screen.findByText('List not found')).toBeInTheDocument();
  });
});

describe('Do-not-call tab', () => {
  it('managers add numbers but cannot remove them', async () => {
    vi.mocked(dndApi.list).mockResolvedValue(
      page([entry('d1', { reason: 'Asked on call', source: 'keyword' })]),
    );
    vi.mocked(dndApi.add)
      .mockRejectedValueOnce(
        new ApiError({
          status: 422,
          code: 'VALIDATION_FAILED',
          kind: 'http',
          message: 'bad',
          details: [{ path: 'body.phone', message: 'Invalid phone' }],
        }),
      )
      .mockResolvedValueOnce({ entry: entry('d2'), created: true })
      .mockResolvedValueOnce({ entry: entry('d1'), created: false });
    signInAs('manager');
    renderWithProviders({ route: '/contacts/dnd' });
    const table = await screen.findByRole('table', { name: 'Do-not-call numbers' });
    expect(await within(table).findByText('+91 98765 43210')).toBeInTheDocument();
    expect(within(table).getByText('Said "stop" on a call')).toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Only an owner or admin can take numbers off this list.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upload a file' })).toHaveAttribute(
      'href',
      '/contacts/import?kind=dnd',
    );

    await userEvent.type(screen.getByLabelText('Search numbers'), '98765');
    await waitFor(() =>
      expect(dndApi.list).toHaveBeenLastCalledWith({ page: 1, limit: 20, q: '98765' }),
    );

    for (const expected of [
      'Invalid phone',
      'Number added to the do-not-call list',
      'That number is already on the list',
    ]) {
      await userEvent.click(screen.getByRole('button', { name: 'Add number' }));
      const dialog = screen.getByRole('dialog', { name: 'Add to do-not-call' });
      const phone = within(dialog).getByLabelText('Phone number');
      await userEvent.type(phone, '123');
      await userEvent.tab();
      expect(within(dialog).getByText('Enter a valid phone number')).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Add' })).toBeDisabled();
      await userEvent.clear(phone);
      await userEvent.type(phone, '98765 43211');
      await userEvent.type(within(dialog).getByLabelText('Reason (optional)'), 'Asked');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
      expect(await screen.findByText(expected)).toBeInTheDocument();
      if (expected === 'Invalid phone')
        await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }
    expect(dndApi.add).toHaveBeenLastCalledWith({ phone: '98765 43211', reason: 'Asked' });
  });

  it('owners remove numbers; agents only read', async () => {
    vi.mocked(dndApi.list).mockResolvedValue(page([entry('d1', { source: 'upload' })]));
    vi.mocked(dndApi.remove)
      .mockRejectedValueOnce(
        new ApiError({ status: 500, code: 'INTERNAL_ERROR', kind: 'http', message: 'Boom' }),
      )
      .mockResolvedValueOnce(undefined);
    signInAs('owner');
    const { unmount } = renderWithProviders({ route: '/contacts/dnd' });
    for (const _ of [1, 2]) {
      await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
      const dialog = screen.getByRole('dialog', {
        name: 'Remove +91 98765 43210 from do-not-call?',
      });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }
    expect(await screen.findByText('Boom')).toBeInTheDocument();
    expect(await screen.findByText('Number taken off the do-not-call list')).toBeInTheDocument();
    expect(dndApi.remove).toHaveBeenCalledWith('d1');
    expect(screen.queryByText(/Only an owner or admin/)).not.toBeInTheDocument();
    unmount();

    vi.mocked(dndApi.list).mockResolvedValue(page([]));
    signInAs('agent');
    renderWithProviders({ route: '/contacts/dnd' });
    expect(await screen.findByText('The do-not-call list is empty')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add number' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Upload a file' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search numbers'), '1');
    expect(await screen.findByText('No numbers match')).toBeInTheDocument();
  });
});
