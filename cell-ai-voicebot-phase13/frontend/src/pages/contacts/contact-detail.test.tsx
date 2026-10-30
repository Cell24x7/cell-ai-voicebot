import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { contactListsApi } from '@/services/api/contact-lists';
import { contactsApi } from '@/services/api/contacts';
import { customFieldsApi } from '@/services/api/custom-fields';
import { dndApi } from '@/services/api/dnd';
import { ApiError } from '@/services/api/errors';
import type { Contact, CustomField } from '@/services/api/types';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))) },
}));
vi.mock('@/services/api/contacts', () => ({
  contactsApi: {
    get: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    optOut: vi.fn(),
    undoOptOut: vi.fn(),
    tags: vi.fn(() => Promise.resolve([{ tag: 'vip', count: 1 }])),
    list: vi.fn(() => new Promise(() => undefined)),
  },
}));
vi.mock('@/services/api/custom-fields', () => ({ customFieldsApi: { list: vi.fn() } }));
vi.mock('@/services/api/contact-lists', () => ({ contactListsApi: { list: vi.fn() } }));
vi.mock('@/services/api/segments', () => ({
  segmentsApi: { list: vi.fn(() => Promise.resolve([])) },
}));
vi.mock('@/services/api/dnd', () => ({ dndApi: { add: vi.fn() } }));

const FIELDS: CustomField[] = [
  {
    id: 'f1',
    key: 'loan_amount',
    label: 'Loan amount',
    type: 'currency',
    required: false,
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
  {
    id: 'f3',
    key: 'alt_phone',
    label: 'Alternate phone',
    type: 'phone',
    required: false,
    defaultValue: null,
    order: 3,
    createdAt: 'x',
    updatedAt: 'x',
  },
  {
    id: 'f4',
    key: 'branch',
    label: 'Branch',
    type: 'text',
    required: false,
    defaultValue: null,
    order: 4,
    createdAt: 'x',
    updatedAt: 'x',
  },
];
const CONTACT: Contact = {
  id: 'c1',
  phoneE164: '+919876543210',
  name: 'Asha Verma',
  email: 'asha@example.com',
  externalId: 'LN-1',
  variables: { loan_amount: 12_500_000_000, due_date: '2026-10-05', alt_phone: '+919876543211' },
  tags: ['vip'],
  listIds: ['l1'],
  dnd: false,
  optedOutAt: null,
  consent: { source: 'Loan agreement', at: '2026-10-01T00:00:00Z' },
  source: { type: 'import', importJobId: 'imp1' },
  lastCalledAt: null,
  callCount: 0,
  lastDisposition: null,
  whatsapp: null,
  createdAt: '2026-10-08T06:30:00Z',
  updatedAt: '2026-10-08T06:30:00Z',
  lists: [{ id: 'l1', name: 'March' }],
};

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
        contactCount: 1,
        createdAt: 'x',
        updatedAt: 'x',
      },
      {
        id: 'l2',
        name: 'April',
        description: null,
        source: { type: 'manual', fileName: null },
        contactCount: 0,
        createdAt: 'x',
        updatedAt: 'x',
      },
    ],
    meta: { page: 1, limit: 100, total: 2, totalPages: 1 },
  });
  vi.mocked(contactsApi.get).mockResolvedValue(CONTACT);
});
afterEach(() => vi.clearAllMocks());

const open = async (role: 'owner' | 'manager' | 'agent' | 'viewer' = 'owner') => {
  signInAs(role);
  renderWithProviders({ route: '/contacts/c/c1' });
  return screen.findByRole('heading', { level: 1, name: 'Asha Verma' });
};

describe('contact detail: calling', () => {
  it('Call now + Test in browser for calls.trigger; blocked for opted-out; hidden for viewers', async () => {
    const user = userEvent.setup();
    await open('agent');
    expect(screen.getByRole('link', { name: 'Test in browser' })).toHaveAttribute(
      'href',
      '/calls/test?contactId=c1',
    );
    await user.click(screen.getByRole('button', { name: 'Call now' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Simulated call/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // agents can't edit contacts, so no More menu either
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
  });

  it('viewers get no call buttons', async () => {
    await open('viewer');
    expect(screen.queryByRole('button', { name: 'Call now' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Test in browser' })).not.toBeInTheDocument();
  });
});

describe('contact detail', () => {
  it('shows details and typed variables in field order', async () => {
    await open();
    expect(screen.getAllByText('+91 98765 43210').length).toBeGreaterThan(0);
    expect(screen.getByText('₹12,500.00')).toBeInTheDocument();
    expect(screen.getByText('05 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText('+91 98765 43211')).toBeInTheDocument();
    expect(screen.getByText('—', { selector: 'div' })).toBeInTheDocument(); // empty branch
    expect(screen.getByRole('link', { name: 'Imported from a file' })).toHaveAttribute(
      'href',
      '/contacts/import/imp1',
    );
    expect(screen.getByText('Loan agreement · 01 Oct 2026, 05:30')).toBeInTheDocument();
    expect(screen.getByText('Never called.')).toBeInTheDocument();
    expect(screen.getAllByText('08 Oct 2026, 12:00', { selector: 'div' })).toHaveLength(2); // added + last changed
  });

  it('WhatsApp line: profile name, last message, blocked — or just "On WhatsApp"', async () => {
    vi.mocked(contactsApi.get).mockResolvedValueOnce({
      ...CONTACT,
      whatsapp: { profileName: 'Asha', lastInboundAt: '2026-10-08T06:30:00Z', blocked: true },
    });
    await open();
    expect(
      screen.getByText('~Asha · last message 08 Oct 2026, 12:00 · blocked'),
    ).toBeInTheDocument();
  });

  it('WhatsApp line without details', async () => {
    vi.mocked(contactsApi.get).mockResolvedValueOnce({
      ...CONTACT,
      whatsapp: { profileName: null, lastInboundAt: null, blocked: false },
    });
    await open();
    expect(screen.getByText('On WhatsApp')).toBeInTheDocument();
  });

  it('edits tags and lists inline (optimistic) and rolls back on error', async () => {
    vi.mocked(contactsApi.update)
      .mockResolvedValueOnce({ ...CONTACT, tags: ['vip', 'new'] })
      .mockRejectedValueOnce(
        new ApiError({
          status: 500,
          code: 'INTERNAL_ERROR',
          kind: 'http',
          message: 'Server broke',
        }),
      );
    await open();
    await userEvent.type(screen.getByLabelText('Tags'), 'NEW{Enter}');
    await waitFor(() =>
      expect(contactsApi.update).toHaveBeenCalledWith('c1', { tags: ['vip', 'new'] }),
    );
    await userEvent.click(screen.getByLabelText('Lists'));
    await userEvent.click(screen.getByRole('option', { name: 'April' }));
    await waitFor(() =>
      expect(contactsApi.update).toHaveBeenLastCalledWith('c1', { listIds: ['l1', 'l2'] }),
    );
    expect(await screen.findByText('Server broke')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'April' })).not.toBeInTheDocument(),
    );
  });

  it('opts out after confirming; owner can undo; adds to DND; deletes', async () => {
    // stateful fake: the detail refetch sees what the actions changed
    let current: Contact = CONTACT;
    vi.mocked(contactsApi.get).mockImplementation(() => Promise.resolve(current));
    vi.mocked(contactsApi.optOut).mockImplementation(() => {
      current = { ...CONTACT, optedOutAt: '2026-10-09T00:00:00Z', dnd: true };
      return Promise.resolve(current);
    });
    vi.mocked(contactsApi.undoOptOut).mockImplementation(() => {
      current = CONTACT;
      return Promise.resolve(current);
    });
    vi.mocked(dndApi.add).mockResolvedValue({ entry: {} as never, created: true });
    vi.mocked(contactsApi.remove).mockResolvedValue(undefined);
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Opt out' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Opt this contact out?' })).getByRole('button', {
        name: 'Opt out',
      }),
    );
    expect(
      await screen.findByText('Opted out — the number is on the do-not-call list'),
    ).toBeInTheDocument();
    expect(contactsApi.optOut).toHaveBeenCalledWith('c1');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Undo opt-out' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Undo opt-out' }),
    );
    expect(await screen.findByText('Opt-out removed')).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add to do-not-call' }));
    await waitFor(() => expect(dndApi.add).toHaveBeenCalledWith({ phone: '+919876543210' }));
    expect(await screen.findByText('Added to the do-not-call list')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Delete Asha Verma?' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    expect(await screen.findByText('Contact deleted')).toBeInTheDocument();
    expect(
      await screen.findByRole('tab', { name: 'Contacts', selected: true }),
    ).toBeInTheDocument();
  });

  it('managers cannot undo an opt-out; agents only read', async () => {
    vi.mocked(contactsApi.get).mockResolvedValue({
      ...CONTACT,
      optedOutAt: '2026-10-09T00:00:00Z',
      dnd: true,
      name: null,
    });
    signInAs('manager');
    renderWithProviders({ route: '/contacts/c/c1' });
    await screen.findByRole('heading', { level: 1, name: '+91 98765 43210' });
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('menuitem', { name: 'Undo opt-out' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Add to do-not-call' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    vi.mocked(contactsApi.get).mockResolvedValue(CONTACT);
    await open('agent');
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Tags').at(-1)).toBeDisabled();
  });

  it('opens the edit form', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit contact' });
    expect(within(dialog).getByLabelText(/Loan amount/)).toHaveValue('12500');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  });

  it('shows not found and other errors', async () => {
    vi.mocked(contactsApi.get).mockRejectedValueOnce(
      new ApiError({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        kind: 'http',
        message: 'Contact not found',
      }),
    );
    signInAs('owner');
    renderWithProviders({ route: '/contacts/c/zz' });
    expect(
      await screen.findByText('It may have been deleted, or it belongs to another account.'),
    ).toBeInTheDocument();
    vi.mocked(contactsApi.get)
      .mockRejectedValueOnce(
        new ApiError({
          status: 500,
          code: 'INTERNAL_ERROR',
          kind: 'http',
          message: 'Server broke',
        }),
      )
      .mockResolvedValueOnce({
        ...CONTACT,
        source: { type: 'manual', importJobId: null },
        consent: null,
        email: null,
      });
    renderWithProviders({ route: '/contacts/c/c9' });
    expect(await screen.findByText('Server broke')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Added by hand')).toBeInTheDocument();
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
  });
});
