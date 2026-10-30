import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { customFieldsApi } from '@/services/api/custom-fields';
import { ApiError } from '@/services/api/errors';
import { segmentsApi } from '@/services/api/segments';
import type { CustomField, Segment } from '@/services/api/types';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))) },
}));
vi.mock('@/services/api/segments', () => ({
  segmentsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    preview: vi.fn(),
  },
}));
vi.mock('@/services/api/custom-fields', () => ({ customFieldsApi: { list: vi.fn() } }));
vi.mock('@/services/api/contact-lists', () => ({
  contactListsApi: {
    list: vi.fn(() =>
      Promise.resolve({
        success: true,
        data: [
          {
            id: 'l1',
            name: 'March',
            description: null,
            source: { type: 'manual', fileName: null },
            contactCount: 4,
            createdAt: 'x',
            updatedAt: 'x',
          },
        ],
        meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
      }),
    ),
  },
}));
vi.mock('@/services/api/contacts', () => ({
  contactsApi: { tags: vi.fn(() => Promise.resolve([{ tag: 'march', count: 3 }])) },
}));
vi.mock('@/services/api/contact-exports', async (orig) => ({
  ...(await orig<object>()),
  contactExportsApi: { create: vi.fn(), get: vi.fn() },
}));

const f = (key: string, label: string, type: CustomField['type']): CustomField => ({
  id: key,
  key,
  label,
  type,
  required: false,
  defaultValue: null,
  order: 1,
  createdAt: 'x',
  updatedAt: 'x',
});
const FIELDS = [
  f('days_past_due', 'Days past due', 'number'),
  f('emi', 'EMI', 'currency'),
  f('due_date', 'Due date', 'date'),
  f('city', 'City', 'text'),
  f('alt_phone', 'Alt phone', 'phone'),
];
const SEGMENTS: Segment[] = [
  {
    id: 's1',
    name: 'Overdue > 30 days',
    filter: { conditions: [{ key: 'days_past_due', op: 'gt', value: 30 }] },
    invalidConditions: [],
    contactCount: 12,
    createdBy: 'u1',
    createdAt: 'x',
    updatedAt: '2026-10-09T00:00:00Z',
  },
  {
    id: 's2',
    name: 'Broken',
    filter: { conditions: [{ key: 'gone', op: 'eq', value: 'x' }] },
    invalidConditions: [0],
    contactCount: 0,
    createdBy: 'u1',
    createdAt: 'x',
    updatedAt: '2026-10-09T00:00:00Z',
  },
];

beforeEach(() => {
  vi.mocked(customFieldsApi.list).mockResolvedValue(FIELDS);
  vi.mocked(segmentsApi.list).mockResolvedValue(SEGMENTS);
  vi.mocked(segmentsApi.preview).mockResolvedValue({ count: 42, sample: [] });
});
afterEach(() => vi.clearAllMocks());

const choose = async (label: string, option: string, scope: HTMLElement = document.body) => {
  await userEvent.click(within(scope).getByLabelText(label));
  await userEvent.click(screen.getByRole('option', { name: option }));
};
const options = () => screen.getAllByRole('option').map((o) => o.textContent);

describe('Segments tab', () => {
  it('lists segments with counts, links and a warning for broken ones', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/contacts/segments' });
    const table = await screen.findByRole('table', { name: 'Segments' });
    expect(await within(table).findByRole('link', { name: 'Overdue > 30 days' })).toHaveAttribute(
      'href',
      '/contacts/all?segmentId=s1',
    );
    expect(within(table).getByText('12')).toBeInTheDocument();
    expect(within(table).getByText('Days past due more than 30')).toBeInTheDocument();
    expect(within(table).getByText('Needs fixing')).toBeInTheDocument();
    expect(segmentsApi.list).toHaveBeenCalledWith(true);
    expect(within(table).getAllByRole('link', { name: 'Create campaign' })[0]).toHaveAttribute(
      'href',
      '/campaigns/new?segmentId=s1',
    );
  });

  it('builds a segment with operators by type and a live count', async () => {
    vi.mocked(segmentsApi.create).mockResolvedValue(SEGMENTS[0] as Segment);
    signInAs('manager');
    renderWithProviders({ route: '/contacts/segments' });
    await userEvent.click(await screen.findByRole('button', { name: 'New segment' }));
    const dialog = screen.getByRole('dialog', { name: 'New segment' });
    expect(await within(dialog).findByText('42 contacts match')).toBeInTheDocument();
    expect(segmentsApi.preview).toHaveBeenLastCalledWith({});

    await userEvent.type(within(dialog).getByLabelText('Segment name'), 'Big overdue');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add condition' }));
    const c1 = within(dialog).getByRole('group', { name: 'Condition 1' });
    expect(within(c1).getByText('Choose a field')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create segment' })).toBeDisabled();

    // number: comparison operators
    await choose('Field', 'Days past due (Number)', c1);
    await userEvent.click(within(c1).getByLabelText('Condition'));
    expect(options()).toEqual([
      'is',
      'is not',
      'more than',
      'at least',
      'less than',
      'at most',
      'between',
      'has a value',
      'is empty',
    ]);
    await userEvent.click(screen.getByRole('option', { name: 'more than' }));
    expect(within(c1).getByText('Enter a value')).toBeInTheDocument();
    await userEvent.type(within(c1).getByLabelText('Value'), 'abc');
    expect(within(c1).getByText('Enter a number')).toBeInTheDocument();
    await userEvent.clear(within(c1).getByLabelText('Value'));
    await userEvent.type(within(c1).getByLabelText('Value'), '30');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Add condition' }));
    const c2 = within(dialog).getByRole('group', { name: 'Condition 2' });
    await choose('Field', 'Due date (Date)', c2);
    await choose('Condition', 'in the next … days', c2);
    await userEvent.type(within(c2).getByLabelText('Days'), '5');

    const expected = {
      conditions: [
        { key: 'days_past_due', op: 'gt', value: '30' },
        { key: 'due_date', op: 'within_next_days', value: 5 },
      ],
    };
    await waitFor(() => expect(segmentsApi.preview).toHaveBeenLastCalledWith(expected), {
      timeout: 2000,
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create segment' }));
    await waitFor(() =>
      expect(segmentsApi.create).toHaveBeenCalledWith({ name: 'Big overdue', filter: expected }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('filters by amount range, tags, lists and status', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/contacts/segments' });
    await userEvent.click(await screen.findByRole('button', { name: 'New segment' }));
    const dialog = screen.getByRole('dialog', { name: 'New segment' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add condition' }));
    const c = within(dialog).getByRole('group', { name: 'Condition 1' });
    await choose('Field', 'EMI (Amount (₹))', c);
    await choose('Condition', 'between', c);
    await userEvent.type(within(c).getByLabelText('From'), '1000.555');
    expect(within(c).getByText('Amount in rupees, up to 2 decimals')).toBeInTheDocument();
    await userEvent.clear(within(c).getByLabelText('From'));
    await userEvent.type(within(c).getByLabelText('From'), '1,000');
    await userEvent.type(within(c).getByLabelText('To'), '5000');
    await choose('Tags match', 'All of', dialog);
    await userEvent.type(within(dialog).getByLabelText('Tags'), 'March {Enter}');
    await userEvent.click(within(dialog).getByLabelText('In any of these lists'));
    await userEvent.click(await screen.findByRole('option', { name: 'March' }));
    await choose('Do-not-call', 'Not on the list', dialog);
    await choose('Opted out', 'Not opted out', dialog);
    await waitFor(
      () =>
        expect(segmentsApi.preview).toHaveBeenLastCalledWith({
          listIds: ['l1'],
          tags: { mode: 'all', values: ['march'] },
          dnd: false,
          optedOut: false,
          conditions: [{ key: 'emi', op: 'between', value: '1000', value2: '5000' }],
        }),
      { timeout: 2000 },
    );
  });

  it('offers operators by field type and resets values between kinds', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/contacts/segments' });
    await userEvent.click(await screen.findByRole('button', { name: 'New segment' }));
    const dialog = screen.getByRole('dialog', { name: 'New segment' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add condition' }));
    const c = within(dialog).getByRole('group', { name: 'Condition 1' });
    await choose('Field', 'City (Text)', c);
    await userEvent.click(within(c).getByLabelText('Condition'));
    expect(options()).toEqual(['is', 'is not', 'contains', 'has a value', 'is empty']);
    await userEvent.click(screen.getByRole('option', { name: 'has a value' }));
    expect(within(c).queryByLabelText('Value')).not.toBeInTheDocument();
    await choose('Field', 'Alt phone (Phone)', c);
    await userEvent.click(within(c).getByLabelText('Condition'));
    expect(options()).toEqual(['is', 'has a value', 'is empty']);
    await userEvent.keyboard('{Escape}');
    await choose('Field', 'Due date (Date)', c);
    await userEvent.click(within(c).getByLabelText('Condition'));
    expect(options()).toEqual([
      'on',
      'before',
      'after',
      'between',
      'in the next … days',
      'at least … days ago',
      'has a value',
      'is empty',
    ]);
    await userEvent.click(screen.getByRole('option', { name: 'at least … days ago' }));
    await userEvent.type(within(c).getByLabelText('Days'), '7');
    await choose('Condition', 'between', c);
    expect(within(c).getByLabelText('From')).toHaveValue('');
    expect(within(c).getByLabelText('From')).toHaveAttribute('type', 'date');
    expect(within(c).getByLabelText('To')).toHaveAttribute('type', 'date');
    await choose('Condition', 'in the next … days', c);
    expect(within(c).getByLabelText('Days')).toHaveValue('');
  });

  it('removes conditions, shows server problems and duplicate names', async () => {
    vi.mocked(segmentsApi.update)
      .mockRejectedValueOnce(
        new ApiError({ status: 409, code: 'CONFLICT_DUPLICATE', kind: 'http', message: 'dup' }),
      )
      .mockRejectedValueOnce(
        new ApiError({
          status: 422,
          code: 'VALIDATION_FAILED',
          kind: 'http',
          message: 'Invalid filter',
          details: [{ path: 'body.filter.conditions.0.value', message: 'Must be a number' }],
        }),
      )
      .mockRejectedValueOnce(
        new ApiError({
          status: 500,
          code: 'INTERNAL_ERROR',
          kind: 'http',
          message: 'Server broke',
        }),
      )
      .mockResolvedValueOnce(SEGMENTS[0] as Segment);
    vi.mocked(segmentsApi.preview).mockRejectedValue(
      new ApiError({
        status: 422,
        code: 'VALIDATION_FAILED',
        kind: 'http',
        message: 'This filter has a problem',
      }),
    );
    signInAs('owner');
    renderWithProviders({ route: '/contacts/segments' });
    const table = await screen.findByRole('table', { name: 'Segments' });
    await userEvent.click(
      (await within(table).findAllByRole('button', { name: 'Edit' }))[0] as HTMLElement,
    );
    const dialog = screen.getByRole('dialog', { name: 'Edit segment' });
    expect(within(dialog).getByLabelText('Segment name')).toHaveValue('Overdue > 30 days');
    expect(await within(dialog).findByText('This filter has a problem')).toBeInTheDocument();
    const save = within(dialog).getByRole('button', { name: 'Save' });
    await userEvent.click(save);
    expect(
      await within(dialog).findByText('A segment with this name already exists.'),
    ).toBeInTheDocument();
    await userEvent.click(save);
    expect(await within(dialog).findByText('Must be a number')).toBeInTheDocument();
    await userEvent.click(save);
    expect(await within(dialog).findByText('Server broke')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove condition 1' }));
    expect(within(dialog).getByText(/No conditions/)).toBeInTheDocument();
    await userEvent.click(save);
    await waitFor(() =>
      expect(segmentsApi.update).toHaveBeenLastCalledWith('s1', {
        name: 'Overdue > 30 days',
        filter: {},
      }),
    );
  });

  it('deletes after confirming, opens export, hides writes for read-only roles', async () => {
    vi.mocked(segmentsApi.remove).mockResolvedValue(undefined);
    signInAs('owner');
    renderWithProviders({ route: '/contacts/segments' });
    const table = await screen.findByRole('table', { name: 'Segments' });
    await userEvent.click(
      (await within(table).findAllByRole('button', { name: 'Delete' }))[1] as HTMLElement,
    );
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Delete segment "Broken"?' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    await waitFor(() => expect(segmentsApi.remove).toHaveBeenCalledWith('s2'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(
      within(table).getAllByRole('button', { name: 'Export' })[0] as HTMLElement,
    );
    const exp = await screen.findByRole('dialog', { name: 'Export contacts' });
    expect(within(exp).getByRole('radio', { name: 'A segment' })).toBeChecked();
  });

  it('read-only roles and impersonators see fewer actions', async () => {
    signInAs('viewer');
    const { unmount } = renderWithProviders({ route: '/contacts/segments' });
    await screen.findByText('Overdue > 30 days');
    expect(screen.queryByRole('button', { name: 'New segment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Create campaign' })).not.toBeInTheDocument();
    unmount();
    signInAs('owner', {
      impersonation: { impersonatorId: 'p1', expiresAt: '2026-10-09T01:00:00Z' },
    });
    renderWithProviders({ route: '/contacts/segments' });
    await screen.findByText('Overdue > 30 days');
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBeGreaterThan(0);
    // campaigns are not created while impersonating
    expect(screen.queryByRole('link', { name: 'Create campaign' })).not.toBeInTheDocument();
  });

  it('shows the empty state and the no-fields hint', async () => {
    vi.mocked(segmentsApi.list).mockResolvedValue([]);
    vi.mocked(customFieldsApi.list).mockResolvedValue([]);
    signInAs('owner');
    renderWithProviders({ route: '/contacts/segments' });
    expect(await screen.findByText('No segments yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'New segment' }));
    expect(
      screen.getByText('Add custom fields in the Fields tab to filter by them.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add condition' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  });
});
