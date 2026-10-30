import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { contactListsApi } from '@/services/api/contact-lists';
import { contactsApi } from '@/services/api/contacts';
import { customFieldsApi } from '@/services/api/custom-fields';
import { ApiError } from '@/services/api/errors';
import { segmentsApi } from '@/services/api/segments';
import type { Contact, CustomField } from '@/services/api/types';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))) },
}));
vi.mock('@/services/api/contacts', () => ({
  contactsApi: { list: vi.fn(), tags: vi.fn(), bulk: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock('@/services/api/custom-fields', () => ({ customFieldsApi: { list: vi.fn() } }));
vi.mock('@/services/api/contact-lists', () => ({ contactListsApi: { list: vi.fn() } }));
vi.mock('@/services/api/segments', () => ({ segmentsApi: { list: vi.fn() } }));

const FIELDS: CustomField[] = [
  {
    id: 'f1',
    key: 'loan_amount',
    label: 'Loan amount',
    type: 'currency',
    required: true,
    defaultValue: null,
    order: 1,
    createdAt: 'x',
    updatedAt: 'x',
  },
  {
    id: 'f2',
    key: 'due_date',
    label: 'Due date',
    type: 'date',
    required: false,
    defaultValue: null,
    order: 2,
    createdAt: 'x',
    updatedAt: 'x',
  },
];
const contact = (i: number, extra: Partial<Contact> = {}): Contact => ({
  id: `c${i}`,
  phoneE164: `+91987654321${i}`,
  name: `Borrower ${i}`,
  email: null,
  externalId: null,
  variables: { loan_amount: 12_500_100_000, due_date: '2026-10-05' },
  tags: [],
  listIds: [],
  dnd: false,
  optedOutAt: null,
  consent: null,
  source: { type: 'manual', importJobId: null },
  lastCalledAt: null,
  callCount: 0,
  lastDisposition: null,
  whatsapp: null,
  createdAt: '2026-10-08T00:00:00Z',
  updatedAt: '2026-10-08T00:00:00Z',
  ...extra,
});
const page = (rows: Contact[], total = rows.length) => ({
  success: true as const,
  data: rows,
  meta: { page: 1, limit: 20, total, totalPages: Math.ceil(total / 20) },
});

beforeEach(() => {
  vi.mocked(customFieldsApi.list).mockResolvedValue(FIELDS);
  vi.mocked(contactListsApi.list).mockResolvedValue({
    success: true,
    data: [
      {
        id: 'l1',
        name: 'March',
        description: null,
        source: { type: 'manual', fileName: null },
        contactCount: 2,
        createdAt: 'x',
        updatedAt: 'x',
      },
    ],
    meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
  });
  vi.mocked(segmentsApi.list).mockResolvedValue([
    {
      id: 's1',
      name: 'Overdue',
      filter: { dnd: false },
      invalidConditions: [],
      createdBy: 'u',
      createdAt: 'x',
      updatedAt: 'x',
    },
  ]);
  vi.mocked(contactsApi.tags).mockResolvedValue([{ tag: 'vip', count: 2 }]);
  vi.mocked(contactsApi.list).mockResolvedValue(
    page(
      [
        contact(1, { tags: ['a', 'b', 'c', 'd'], dnd: true, optedOutAt: '2026-10-08T00:00:00Z' }),
        contact(2, { name: null }),
      ],
      45,
    ),
  );
});
afterEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

const lastQuery = () => vi.mocked(contactsApi.list).mock.calls.at(-1)?.[0];

describe('contacts table', () => {
  it('shows contacts with formatted phone, tag chips and status', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/contacts/all' });
    expect(await screen.findByRole('link', { name: 'Borrower 1' })).toHaveAttribute(
      'href',
      '/contacts/c/c1',
    );
    expect(screen.getByRole('link', { name: '+91 98765 43212' })).toBeInTheDocument(); // no name → phone
    expect(screen.getByText('+1')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Contacts' });
    expect(within(table).getByText('Opted out')).toBeInTheDocument();
    expect(within(table).getByText('Do not call')).toBeInTheDocument();
    expect(lastQuery()).toEqual({ page: 1, limit: 20, sort: '-createdAt' });
  });

  it('adds field columns from the picker and remembers them per user', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/contacts/all' });
    await userEvent.click(await screen.findByRole('button', { name: 'Columns' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Loan amount/ }));
    await userEvent.keyboard('{Escape}');
    expect(await screen.findAllByText('₹12,500.10')).toHaveLength(2);
    expect(window.localStorage.getItem('cav.contacts.columns.u1')).toBe('["loan_amount"]');
    await userEvent.click(screen.getByRole('button', { name: 'Columns' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Loan amount/ }));
    expect(window.localStorage.getItem('cav.contacts.columns.u1')).toBe('[]');
  });

  it('survives blocked storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    signInAs('owner');
    renderWithProviders({ route: '/contacts/all' });
    await userEvent.click(await screen.findByRole('button', { name: 'Columns' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Due date/ }));
    await userEvent.keyboard('{Escape}');
    expect(await screen.findAllByText('05 Oct 2026')).toHaveLength(2);
    vi.restoreAllMocks();
  });

  it('filters, searches (debounced), sorts and pages through the URL', async () => {
    signInAs('agent');
    renderWithProviders({ route: '/contacts/all' });
    await screen.findByRole('link', { name: 'Borrower 1' });
    await userEvent.type(screen.getByLabelText('Search name, phone, e-mail, id'), ' asha ');
    await waitFor(() => expect(lastQuery()).toMatchObject({ q: 'asha', page: 1 }));
    await userEvent.click(screen.getByLabelText('List'));
    await userEvent.click(screen.getByRole('option', { name: 'March' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ listId: 'l1' }));
    await userEvent.click(screen.getByLabelText('Do-not-call'));
    await userEvent.click(screen.getByRole('option', { name: 'On the list' }));
    await userEvent.click(screen.getByLabelText('Opted out'));
    await userEvent.click(screen.getByRole('option', { name: 'Not opted out' }));
    await userEvent.click(screen.getByLabelText('Segment'));
    await userEvent.click(screen.getByRole('option', { name: 'Overdue' }));
    await userEvent.click(screen.getByLabelText('Tags (any)'));
    await userEvent.click(await screen.findByRole('option', { name: 'vip' }));
    await waitFor(() =>
      expect(lastQuery()).toMatchObject({
        dnd: 'true',
        optedOut: 'false',
        segmentId: 's1',
        tag: 'vip',
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Name' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ sort: 'name' }));
    await userEvent.click(screen.getByRole('button', { name: 'Name' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ sort: '-name' }));
    await userEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 2 }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(lastQuery()).toEqual({ page: 1, limit: 20, sort: '-createdAt' }));
    // agents can't change contacts
    expect(screen.queryByRole('button', { name: 'Add contact' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select Borrower 1' })).not.toBeInTheDocument();
  });

  it('explains empty results', async () => {
    vi.mocked(contactsApi.list).mockResolvedValue(page([]));
    signInAs('owner');
    renderWithProviders({ route: '/contacts/all' });
    expect(await screen.findByText('No contacts yet')).toBeInTheDocument();
    renderWithProviders({ route: '/contacts/all?dnd=true' });
    expect(await screen.findByText('No contacts match')).toBeInTheDocument();
  });
});

describe('bulk actions', () => {
  it('tags the selected contacts', async () => {
    vi.mocked(contactsApi.bulk).mockResolvedValue({ count: 1 });
    signInAs('manager');
    renderWithProviders({ route: '/contacts/all' });
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Borrower 1' }));
    expect(screen.getByText(/1 selected/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add tags' }));
    const dialog = screen.getByRole('dialog', { name: 'Add tags' });
    const apply = within(dialog).getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Tags'), 'Hot{Enter}');
    await userEvent.click(apply);
    await waitFor(() =>
      expect(contactsApi.bulk).toHaveBeenCalledWith({
        action: 'add_tags',
        payload: { tags: ['hot'] },
        ids: ['c1'],
      }),
    );
    expect(await screen.findByText('Done — 1 contacts changed')).toBeInTheDocument();
  });

  it('selects all matching and deletes them in the background after confirming', async () => {
    vi.mocked(contactsApi.bulk).mockResolvedValue({ count: 45, jobQueued: true });
    signInAs('owner');
    renderWithProviders({ route: '/contacts/all?dnd=false' });
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select all on this page' }));
    await userEvent.click(screen.getByRole('button', { name: 'Select all 45 matching' }));
    expect(screen.getByText(/All 45 matching contacts selected/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Delete 45 contacts?' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    await waitFor(() =>
      expect(contactsApi.bulk).toHaveBeenCalledWith({
        action: 'delete',
        payload: {},
        filter: { dnd: false },
      }),
    );
    expect(
      await screen.findByText('Working on 45 contacts in the background…'),
    ).toBeInTheDocument();
  });

  it('adds to DND, moves between lists, reports errors, clears', async () => {
    vi.mocked(contactsApi.bulk)
      .mockResolvedValueOnce({ count: 2 })
      .mockRejectedValueOnce(
        new ApiError({
          status: 409,
          code: 'CONFLICT_INVALID_STATE',
          kind: 'http',
          message: 'Another bulk action is running',
        }),
      );
    signInAs('owner');
    renderWithProviders({ route: '/contacts/all' });
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select all on this page' }));
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add to do-not-call' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Add to do-not-call' }),
    );
    await waitFor(() =>
      expect(contactsApi.bulk).toHaveBeenCalledWith({
        action: 'add_to_dnd',
        payload: {},
        ids: ['c1', 'c2'],
      }),
    );

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Borrower 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from a list' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove from a list' });
    await userEvent.click(within(dialog).getByLabelText('List'));
    await userEvent.click(screen.getByRole('option', { name: 'March' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('Another bulk action is running')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });
});

describe('contact form', () => {
  const open = async () => {
    signInAs('owner');
    renderWithProviders({ route: '/contacts/all' });
    await userEvent.click(await screen.findByRole('button', { name: 'Add contact' }));
    return screen.getByRole('dialog', { name: 'Add a contact' });
  };

  it('validates phone, required and typed fields before sending', async () => {
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText(/^Phone/), '12345');
    await userEvent.type(within(dialog).getByLabelText(/E-mail/), 'nope');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add contact' }));
    expect(await within(dialog).findByText('Not a valid phone number')).toBeInTheDocument();
    expect(within(dialog).getByText('Required')).toBeInTheDocument();
    expect(within(dialog).getByText('Not a valid e-mail address')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/Loan amount/), 'lots');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add contact' }));
    expect(await within(dialog).findByText('Amount in rupees, e.g. 12500.50')).toBeInTheDocument();
    expect(contactsApi.create).not.toHaveBeenCalled();
  });

  it('creates a contact with typed values, tags, lists and consent', async () => {
    vi.mocked(contactsApi.create).mockResolvedValue(contact(9));
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText(/^Phone/), '098765 43210');
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Asha');
    await userEvent.type(within(dialog).getByLabelText(/Loan amount/), '12,500.50');
    await userEvent.type(within(dialog).getByLabelText('Due date'), '2026-10-05');
    await userEvent.type(within(dialog).getByLabelText('Tags'), 'VIP{Enter}');
    await userEvent.click(within(dialog).getByLabelText('Lists'));
    await userEvent.click(screen.getByRole('option', { name: 'March' }));
    await userEvent.type(within(dialog).getByLabelText('Consent / relationship'), 'Loan agreement');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add contact' }));
    await waitFor(() => expect(contactsApi.create).toHaveBeenCalled());
    expect(vi.mocked(contactsApi.create).mock.calls[0]?.[0]).toMatchObject({
      phone: '098765 43210',
      name: 'Asha',
      email: null,
      externalId: null,
      variables: { loan_amount: '12,500.50', due_date: '2026-10-05' },
      tags: ['vip'],
      listIds: ['l1'],
      consent: { source: 'Loan agreement' },
    });
    expect(await screen.findByText('Contact added')).toBeInTheDocument();
  });

  it('links to the existing contact on a duplicate and shows server field errors', async () => {
    vi.mocked(contactsApi.create)
      .mockRejectedValueOnce(
        new ApiError({
          status: 409,
          code: 'CONFLICT_DUPLICATE',
          kind: 'http',
          message: 'A contact with this phone number already exists.',
          details: [{ path: 'phone', message: 'Already exists', existingId: 'c7' }],
        }),
      )
      .mockRejectedValueOnce(
        new ApiError({
          status: 422,
          code: 'VALIDATION_FAILED',
          kind: 'http',
          message: 'x',
          details: [{ path: 'body.variables.loan_amount', message: 'Not a valid currency' }],
        }),
      );
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText(/^Phone/), '9876543210');
    await userEvent.type(within(dialog).getByLabelText(/Loan amount/), '100');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add contact' }));
    expect(
      await within(dialog).findByRole('link', { name: 'Open existing contact' }),
    ).toHaveAttribute('href', '/contacts/c/c7');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add contact' }));
    expect(await within(dialog).findByText('Not a valid currency')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
