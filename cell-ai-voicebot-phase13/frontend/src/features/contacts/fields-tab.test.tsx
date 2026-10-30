import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { customFieldsApi } from '@/services/api/custom-fields';
import { ApiError } from '@/services/api/errors';
import type { CustomField } from '@/services/api/types';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))) },
}));
vi.mock('@/services/api/custom-fields', () => ({
  customFieldsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    reorder: vi.fn(),
    remove: vi.fn(),
  },
}));

const field = (id: string, extra: Partial<CustomField>): CustomField => ({
  id,
  key: id,
  label: id,
  type: 'text',
  required: false,
  defaultValue: null,
  order: 1,
  usageCount: 0,
  createdAt: 'x',
  updatedAt: 'x',
  ...extra,
});
const FIELDS = [
  field('f1', {
    key: 'loan_amount',
    label: 'Loan amount',
    type: 'currency',
    required: true,
    defaultValue: 5_000_500_000,
    usageCount: 87,
  }),
  field('f2', { key: 'due_date', label: 'Due date', type: 'date', defaultValue: '2026-10-05' }),
  field('f3', { key: 'branch', label: 'Branch' }),
];

beforeEach(() => vi.mocked(customFieldsApi.list).mockResolvedValue(FIELDS));
afterEach(() => vi.clearAllMocks());

const rowOf = async (label: string) =>
  (await within(await screen.findByRole('table', { name: 'Fields' })).findByText(label)).closest(
    'tr',
  ) as HTMLElement;

describe('Fields tab', () => {
  it('shows fields with type, default and usage', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/contacts/fields' });
    const loan = await rowOf('Loan amount');
    expect(within(loan).getByText('loan_amount')).toBeInTheDocument();
    expect(within(loan).getByText('Amount (₹)')).toBeInTheDocument();
    expect(within(loan).getByText('Yes')).toBeInTheDocument();
    expect(within(loan).getByText('₹5,000.50')).toBeInTheDocument();
    expect(within(loan).getByText('87')).toBeInTheDocument();
    expect(within(await rowOf('Due date')).getByText('05 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText(/3 of 50 fields/)).toBeInTheDocument();
    expect(customFieldsApi.list).toHaveBeenCalledWith(true);
  });

  it('creates a field with a slug key and checks the key', async () => {
    vi.mocked(customFieldsApi.create)
      .mockRejectedValueOnce(
        new ApiError({
          status: 422,
          code: 'VALIDATION_FAILED',
          kind: 'http',
          message: 'bad',
          details: [{ path: 'body.defaultValue', message: 'Not a valid number value' }],
        }),
      )
      .mockResolvedValueOnce(field('f4', {}));
    signInAs('manager');
    renderWithProviders({ route: '/contacts/fields' });
    await userEvent.click(await screen.findByRole('button', { name: 'New field' }));
    const dialog = screen.getByRole('dialog', { name: 'New field' });
    await userEvent.type(within(dialog).getByLabelText('Label'), 'Days Past Due');
    expect(within(dialog).getByLabelText('Key')).toHaveValue('days_past_due');
    await userEvent.clear(within(dialog).getByLabelText('Key'));
    await userEvent.type(within(dialog).getByLabelText('Key'), 'phone');
    expect(within(dialog).getByText('This key is reserved')).toBeInTheDocument();
    await userEvent.clear(within(dialog).getByLabelText('Key'));
    await userEvent.type(within(dialog).getByLabelText('Key'), 'branch');
    expect(within(dialog).getByText('A field with this key already exists')).toBeInTheDocument();
    await userEvent.clear(within(dialog).getByLabelText('Key'));
    await userEvent.type(within(dialog).getByLabelText('Key'), '9x');
    expect(within(dialog).getByText(/start with a letter/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add field' })).toBeDisabled();
    await userEvent.clear(within(dialog).getByLabelText('Key'));
    await userEvent.type(within(dialog).getByLabelText('Key'), 'dpd');
    // the label no longer drives the key once the key was edited
    await userEvent.type(within(dialog).getByLabelText('Label'), '!');
    expect(within(dialog).getByLabelText('Key')).toHaveValue('dpd');

    await userEvent.click(within(dialog).getByLabelText('Type'));
    await userEvent.click(screen.getByRole('option', { name: 'Number' }));
    await userEvent.click(within(dialog).getByRole('switch', { name: /Required/ }));
    await userEvent.type(within(dialog).getByLabelText('Default value (optional)'), 'abc');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add field' }));
    expect(await within(dialog).findByText('Not a valid number value')).toBeInTheDocument();
    await userEvent.clear(within(dialog).getByLabelText('Default value (optional)'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add field' }));
    await waitFor(() =>
      expect(customFieldsApi.create).toHaveBeenLastCalledWith({
        key: 'dpd',
        label: 'Days Past Due!',
        type: 'number',
        required: true,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('edits a field: key fixed, type locked while used', async () => {
    vi.mocked(customFieldsApi.update)
      .mockRejectedValueOnce(
        new ApiError({
          status: 409,
          code: 'CONFLICT_INVALID_STATE',
          kind: 'http',
          message: 'Type is locked',
        }),
      )
      .mockResolvedValue(FIELDS[0] as CustomField);
    signInAs('owner');
    renderWithProviders({ route: '/contacts/fields' });
    await userEvent.click(within(await rowOf('Loan amount')).getByRole('button', { name: 'Edit' }));
    let dialog = screen.getByRole('dialog', { name: 'Edit field' });
    expect(within(dialog).getByLabelText('Key')).toBeDisabled();
    expect(within(dialog).getByText(/The key can't change/)).toBeInTheDocument();
    expect(
      within(dialog).getByText("Used by 87 contacts — the type can't change."),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Default value (optional)')).toHaveValue('5000.50');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Type is locked')).toBeInTheDocument();
    await userEvent.clear(within(dialog).getByLabelText('Default value (optional)'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(customFieldsApi.update).toHaveBeenLastCalledWith('f1', {
        label: 'Loan amount',
        required: true,
        defaultValue: null,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // unused field: the type can change (and the default resets)
    await userEvent.click(within(await rowOf('Due date')).getByRole('button', { name: 'Edit' }));
    dialog = screen.getByRole('dialog', { name: 'Edit field' });
    expect(within(dialog).getByLabelText('Default value (optional)')).toHaveValue('2026-10-05');
    await userEvent.click(within(dialog).getByLabelText('Type'));
    await userEvent.click(screen.getByRole('option', { name: 'Text' }));
    expect(within(dialog).getByLabelText('Default value (optional)')).toHaveValue('');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(customFieldsApi.update).toHaveBeenLastCalledWith('f2', {
        label: 'Due date',
        required: false,
        defaultValue: null,
        type: 'text',
      }),
    );
  });

  it('reorders with up / down buttons (optimistic, rolled back on error)', async () => {
    vi.mocked(customFieldsApi.reorder)
      .mockRejectedValueOnce(
        new ApiError({
          status: 500,
          code: 'INTERNAL_ERROR',
          kind: 'http',
          message: 'Order failed',
        }),
      )
      .mockResolvedValue(FIELDS);
    signInAs('owner');
    renderWithProviders({ route: '/contacts/fields' });
    await rowOf('Loan amount');
    expect(screen.getByRole('button', { name: 'Move Loan amount up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Branch down' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Move Loan amount down' }));
    await waitFor(() => expect(customFieldsApi.reorder).toHaveBeenCalledWith(['f2', 'f1', 'f3']));
    expect(await screen.findByText('Order failed')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Move Branch up' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Move Branch up' }));
    await waitFor(() =>
      expect(customFieldsApi.reorder).toHaveBeenLastCalledWith(['f1', 'f3', 'f2']),
    );
  });

  it('deletes with the usage count in the warning', async () => {
    vi.mocked(customFieldsApi.remove)
      .mockRejectedValueOnce(
        new ApiError({
          status: 404,
          code: 'RESOURCE_NOT_FOUND',
          kind: 'http',
          message: 'Not found',
        }),
      )
      .mockResolvedValue(undefined);
    signInAs('owner');
    renderWithProviders({ route: '/contacts/fields' });
    await userEvent.click(
      within(await rowOf('Loan amount')).getByRole('button', { name: 'Delete' }),
    );
    let dialog = screen.getByRole('dialog', { name: 'Delete field "Loan amount"?' });
    expect(within(dialog).getByText(/87 contacts have a value/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete field' }));
    expect(await screen.findByText('Not found')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(within(await rowOf('Branch')).getByRole('button', { name: 'Delete' }));
    dialog = screen.getByRole('dialog', { name: 'Delete field "Branch"?' });
    expect(within(dialog).getByText('No contact has a value for it yet.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete field' }));
    await waitFor(() => expect(customFieldsApi.remove).toHaveBeenLastCalledWith('f3'));
    expect(await screen.findByText('Field deleted')).toBeInTheDocument();
  });

  it('read-only roles see no edit controls; empty state; limit', async () => {
    signInAs('viewer');
    const { unmount } = renderWithProviders({ route: '/contacts/fields' });
    await rowOf('Branch');
    expect(screen.queryByRole('button', { name: /Move/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New field' })).not.toBeInTheDocument();
    unmount();
    vi.mocked(customFieldsApi.list).mockResolvedValue([]);
    signInAs('owner');
    const second = renderWithProviders({ route: '/contacts/fields' });
    expect(await screen.findByText('No custom fields yet')).toBeInTheDocument();
    second.unmount();
    vi.mocked(customFieldsApi.list).mockResolvedValue(
      Array.from({ length: 50 }, (_v, i) => field(`x${i}`, {})),
    );
    renderWithProviders({ route: '/contacts/fields' });
    expect(await screen.findByText(/50 of 50 fields/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New field' })).toBeDisabled();
  });
});
