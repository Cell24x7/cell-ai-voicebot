import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { contactExportsApi } from '@/services/api/contact-exports';
import { contactListsApi } from '@/services/api/contact-lists';
import { contactsApi } from '@/services/api/contacts';
import { customFieldsApi } from '@/services/api/custom-fields';
import { ApiError } from '@/services/api/errors';
import { segmentsApi } from '@/services/api/segments';
import type { Contact, CustomField, ExportJob, Segment } from '@/services/api/types';
import { signInAs } from '@/test/auth';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';

import { ExportDialog } from './ExportDialog';

vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))) },
}));
vi.mock('@/services/api/contacts', () => ({
  contactsApi: { list: vi.fn(), search: vi.fn(), tags: vi.fn(), bulk: vi.fn() },
}));
vi.mock('@/services/api/custom-fields', () => ({ customFieldsApi: { list: vi.fn() } }));
vi.mock('@/services/api/contact-lists', () => ({ contactListsApi: { list: vi.fn() } }));
vi.mock('@/services/api/segments', () => ({
  segmentsApi: { list: vi.fn(), preview: vi.fn(), create: vi.fn() },
}));
vi.mock('@/services/api/contact-exports', async (orig) => ({
  ...(await orig<object>()),
  contactExportsApi: { create: vi.fn(), get: vi.fn(), list: vi.fn() },
}));

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
    key: 'days_past_due',
    label: 'Days past due',
    type: 'number',
    required: false,
    defaultValue: null,
    order: 2,
    createdAt: 'x',
    updatedAt: 'x',
  },
];
const contact = (i: number): Contact => ({
  id: `c${i}`,
  phoneE164: `+91987654321${i}`,
  name: `Borrower ${i}`,
  email: null,
  externalId: null,
  variables: {},
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
});
const page = (rows: Contact[], total = rows.length) => ({
  success: true as const,
  data: rows,
  meta: { page: 1, limit: 20, total, totalPages: Math.ceil(total / 20) },
});
const job = (extra: Partial<ExportJob> = {}): ExportJob => ({
  id: 'e1',
  kind: 'contacts',
  campaignId: null,
  format: 'csv',
  scope: 'filter',
  columns: [],
  status: 'pending',
  progress: { processed: 0, total: 45 },
  rowCount: 0,
  errorMessage: null,
  createdBy: 'u1',
  completedAt: null,
  expiresAt: null,
  createdAt: '2026-10-09T00:00:00Z',
  ...extra,
});
const SEGMENT: Segment = {
  id: 's1',
  name: 'Overdue',
  filter: { dnd: false },
  invalidConditions: [],
  createdBy: 'u',
  createdAt: 'x',
  updatedAt: 'x',
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
        contactCount: 2,
        createdAt: 'x',
        updatedAt: 'x',
      },
    ],
    meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
  });
  vi.mocked(segmentsApi.list).mockResolvedValue([SEGMENT]);
  vi.mocked(segmentsApi.preview).mockResolvedValue({ count: 7, sample: [contact(1)] });
  vi.mocked(contactsApi.tags).mockResolvedValue([]);
  vi.mocked(contactsApi.list).mockResolvedValue(page([contact(1), contact(2)], 45));
  vi.mocked(contactsApi.search).mockResolvedValue(page([contact(3)], 7));
});
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe('export dialog', () => {
  it('exports all contacts with chosen columns, live progress and a fresh download link', async () => {
    const rt = fakeRealtime('open');
    vi.mocked(contactExportsApi.create).mockResolvedValue(job());
    signInAs('manager');
    renderWithProviders({ route: '/contacts/all', realtime: rt.client });
    await screen.findByRole('link', { name: 'Borrower 1' });
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    const dialog = screen.getByRole('dialog', { name: 'Export contacts' });
    expect(within(dialog).getByRole('radio', { name: 'All contacts (45)' })).toBeChecked();
    expect(await within(dialog).findByRole('checkbox', { name: 'Loan amount' })).toBeChecked();
    expect(within(dialog).getByText('Columns (13 of 13)')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'None' }));
    expect(within(dialog).getByText('Choose at least one column.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Export' })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'All' }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'E-mail' }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Loan amount' }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Loan amount' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Export' }));
    await waitFor(() =>
      expect(contactExportsApi.create).toHaveBeenCalledWith({
        scope: 'filter',
        filter: {},
        columns: [
          'name',
          'phone',
          'external_id',
          'tags',
          'lists',
          'dnd',
          'opted_out',
          'consent_source',
          'consent_at',
          'created_at',
          'loan_amount',
          'days_past_due',
        ],
      }),
    );
    expect(
      await within(dialog).findByText(/Preparing the file… 0 of 45 contacts/),
    ).toBeInTheDocument();
    rt.emit('export.progress', { exportJobId: 'e1', processed: 0, total: 45, status: 'pending' });
    expect(await within(dialog).findByText(/0 of 45/)).toBeInTheDocument();
    rt.emit('export.progress', { exportJobId: 'other', processed: 1, total: 1, status: 'ready' });
    vi.mocked(contactExportsApi.get).mockResolvedValue(
      job({ status: 'processing', progress: { processed: 20, total: 45 } }),
    );
    rt.emit('export.progress', {
      exportJobId: 'e1',
      processed: 20,
      total: 45,
      status: 'processing',
    });
    expect(await within(dialog).findByText(/20 of 45/)).toBeInTheDocument();
    rt.emit('export.progress', {
      exportJobId: 'e1',
      processed: 30,
      total: 45,
      status: 'processing',
    });
    expect(await within(dialog).findByText(/30 of 45/)).toBeInTheDocument();

    vi.mocked(contactExportsApi.get).mockResolvedValue(
      job({ status: 'ready', rowCount: 45, downloadUrl: 'http://files/e1.csv' }),
    );
    rt.emit('export.progress', { exportJobId: 'e1', processed: 45, total: 45, status: 'ready' });
    expect(await within(dialog).findByText(/45 contacts exported/)).toBeInTheDocument();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    vi.mocked(contactExportsApi.get).mockResolvedValueOnce(
      job({ status: 'ready', rowCount: 45, downloadUrl: 'http://files/fresh.csv' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Download' }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith('http://files/fresh.csv', '_blank', 'noopener'),
    );
    vi.mocked(contactExportsApi.get).mockRejectedValueOnce(
      new ApiError({ status: 410, code: 'GONE', kind: 'http', message: 'Export expired' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Download' }));
    expect(await within(dialog).findByText('Export expired')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  });

  it('exports the selection or a list; polls without a live connection; shows failures', async () => {
    vi.mocked(contactExportsApi.create)
      .mockRejectedValueOnce(
        new ApiError({
          status: 403,
          code: 'AUTH_FORBIDDEN',
          kind: 'http',
          message: 'Not while impersonating',
        }),
      )
      .mockResolvedValueOnce(
        job({ scope: 'list', status: 'processing', progress: { processed: 0, total: 0 } }),
      );
    vi.mocked(contactExportsApi.get)
      .mockResolvedValueOnce(job({ status: 'processing', progress: { processed: 1, total: 2 } }))
      .mockResolvedValue(job({ status: 'failed', errorMessage: 'Disk full' }));
    signInAs('owner');
    renderWithProviders({ route: '/contacts/all?dnd=true' });
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Borrower 1' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Export' })[0] as HTMLElement);
    const dialog = screen.getByRole('dialog', { name: 'Export contacts' });
    expect(within(dialog).getByRole('radio', { name: 'Selected contacts (1)' })).toBeChecked();
    expect(
      within(dialog).getByRole('radio', { name: 'Contacts matching the current filters (45)' }),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Export' }));
    expect(await within(dialog).findByText('Not while impersonating')).toBeInTheDocument();
    expect(contactExportsApi.create).toHaveBeenLastCalledWith({ scope: 'ids', ids: ['c1'] });

    await userEvent.click(within(dialog).getByRole('radio', { name: 'A segment' }));
    expect(within(dialog).getByRole('button', { name: 'Export' })).toBeDisabled();
    await userEvent.click(within(dialog).getByLabelText('Segment'));
    await userEvent.click(screen.getByRole('option', { name: 'Overdue' }));
    await userEvent.click(within(dialog).getByRole('radio', { name: 'A list' }));
    await userEvent.click(within(dialog).getByLabelText('List'));
    await userEvent.click(screen.getByRole('option', { name: 'March (2)' }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Export' }));
    await waitFor(() =>
      expect(contactExportsApi.create).toHaveBeenLastCalledWith({ scope: 'list', listId: 'l1' }),
    );
    expect(await within(dialog).findByLabelText('Export progress')).toBeInTheDocument();
    expect(await within(dialog).findByText(/1 of 2 contacts/)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(await within(dialog).findByText('Disk full')).toBeInTheDocument();
  });

  it('shows expired jobs and refuses while impersonating', async () => {
    vi.mocked(contactExportsApi.create).mockResolvedValue(job({ status: 'expired' }));
    vi.mocked(contactExportsApi.get).mockResolvedValue(job({ status: 'expired' }));
    signInAs('owner');
    const routes = [
      { path: '/', element: <ExportDialog open onClose={() => undefined} segmentId="s1" /> },
    ];
    const { unmount } = renderWithProviders({ routes });
    const dialog = screen.getByRole('dialog', { name: 'Export contacts' });
    expect(within(dialog).getByRole('radio', { name: 'A segment' })).toBeChecked();
    expect(
      within(dialog).queryByRole('radio', { name: /current filters/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Export' }));
    expect(await within(dialog).findByText('This export has expired.')).toBeInTheDocument();
    unmount();

    signInAs('owner', {
      impersonation: { impersonatorId: 'p1', expiresAt: '2026-10-09T01:00:00Z' },
    });
    renderWithProviders({
      routes: [
        { path: '/', element: <ExportDialog open onClose={() => undefined} filter={null} /> },
      ],
    });
    expect(
      screen.getByText(/not available while you are signed in as someone else/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
  });

  it('cannot use the current filters when they cannot be combined', () => {
    signInAs('owner');
    renderWithProviders({
      routes: [
        { path: '/', element: <ExportDialog open onClose={() => undefined} filter={null} /> },
      ],
    });
    expect(screen.getByRole('radio', { name: /not possible with this mix/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'A list' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
  });
});

describe('advanced filter on the Contacts tab', () => {
  it('starts from the simple filters, searches, saves as a segment', async () => {
    vi.mocked(segmentsApi.create).mockResolvedValue({ ...SEGMENT, id: 's9', name: 'Big DPD' });
    signInAs('owner');
    renderWithProviders({ route: '/contacts/all?dnd=false' });
    await screen.findByRole('link', { name: 'Borrower 1' });
    await userEvent.click(screen.getByRole('button', { name: 'Advanced filter' }));
    let dialog = screen.getByRole('dialog', { name: 'Advanced filter' });
    expect(within(dialog).getByLabelText('Do-not-call')).toHaveTextContent('Not on the list');
    expect(await within(dialog).findByText('7 contacts match')).toBeInTheDocument();
    expect(within(dialog).getByText('e.g. Borrower 1 …')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add condition' }));
    expect(within(dialog).getByRole('button', { name: 'Show contacts' })).toBeDisabled();
    await userEvent.click(within(dialog).getByLabelText('Field'));
    await userEvent.click(screen.getByRole('option', { name: 'Days past due (Number)' }));
    await userEvent.click(within(dialog).getByLabelText('Condition'));
    await userEvent.click(screen.getByRole('option', { name: 'more than' }));
    await userEvent.type(within(dialog).getByLabelText('Value'), '30');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Show contacts' }));

    const filter = { dnd: false, conditions: [{ key: 'days_past_due', op: 'gt', value: '30' }] };
    await waitFor(() =>
      expect(contactsApi.search).toHaveBeenLastCalledWith({
        filter,
        page: 1,
        limit: 20,
        sort: '-createdAt',
      }),
    );
    expect(await screen.findByRole('link', { name: 'Borrower 3' })).toBeInTheDocument();
    expect(
      screen.getByText(/Advanced filter: Days past due more than 30 · not on do-not-call/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Advanced filter (2)' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Search name, phone, e-mail, id')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    dialog = screen.getByRole('dialog', { name: 'Advanced filter' });
    expect(within(dialog).getByLabelText('Value')).toHaveValue('30');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Save as segment' }));
    dialog = screen.getByRole('dialog', { name: 'New segment' });
    await userEvent.type(within(dialog).getByLabelText('Segment name'), 'Big DPD');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create segment' }));
    await waitFor(() =>
      expect(segmentsApi.create).toHaveBeenCalledWith({ name: 'Big DPD', filter }),
    );
    await waitFor(() =>
      expect(vi.mocked(contactsApi.list).mock.calls.at(-1)?.[0]).toMatchObject({ segmentId: 's9' }),
    );
    expect(screen.queryByText(/Advanced filter:/)).not.toBeInTheDocument();
  });

  it('read-only users can filter but not save; clearing removes the filter', async () => {
    signInAs('viewer');
    const f = encodeURIComponent(JSON.stringify({ tags: { mode: 'all', values: ['vip'] } }));
    renderWithProviders({ route: `/contacts/all?f=${f}` });
    expect(await screen.findByText(/Advanced filter: tags all of vip/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save as segment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(screen.queryByText(/Advanced filter:/)).not.toBeInTheDocument());
    expect(contactsApi.list).toHaveBeenCalled();
  });
});
