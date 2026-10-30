import { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { contactImportsApi } from '@/services/api/contact-imports';
import { contactListsApi } from '@/services/api/contact-lists';
import { customFieldsApi } from '@/services/api/custom-fields';
import { ApiError } from '@/services/api/errors';
import type { CustomField, ImportJob } from '@/services/api/types';
import { signInAs } from '@/test/auth';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))) },
}));
vi.mock('@/services/api/contact-imports', () => ({
  contactImportsApi: {
    upload: vi.fn(),
    get: vi.fn(),
    setMapping: vi.fn(),
    validate: vi.fn(),
    start: vi.fn(),
    cancel: vi.fn(),
    errorReport: vi.fn(),
    template: vi.fn(),
    list: vi.fn(),
  },
}));
vi.mock('@/services/api/custom-fields', () => ({ customFieldsApi: { list: vi.fn() } }));
vi.mock('@/services/api/contact-lists', () => ({ contactListsApi: { list: vi.fn() } }));
vi.mock('@/services/api/contacts', () => ({
  contactsApi: { tags: vi.fn(() => Promise.resolve([])) },
}));

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
];
const totals = {
  rows: 100,
  created: 87,
  updated: 2,
  unchanged: 0,
  invalid: 8,
  duplicates: 3,
  dnd: 2,
};
const job = (extra: Partial<ImportJob> = {}): ImportJob => ({
  id: 'j1',
  kind: 'contacts',
  fileName: 'march.csv',
  fileType: 'csv',
  fileSize: 100,
  sheet: null,
  sheets: [],
  columns: [
    { index: 0, header: 'Name', samples: ['Asha'] },
    { index: 1, header: 'Mobile No', samples: ['9876543210'] },
    { index: 2, header: 'Loan Amount', samples: ['5000'] },
    { index: 3, header: 'Due Date', samples: ['05/10/2026'] },
  ],
  rowCount: 100,
  mapping: null,
  options: null,
  suggestedMapping: [
    { index: 0, target: 'name' },
    { index: 1, target: 'phone' },
    { index: 2, target: 'field', key: 'loan_amount' },
    {
      index: 3,
      target: 'new_field',
      key: 'due_date',
      label: 'Due Date',
      type: 'date',
      dateFormat: 'DMY',
    },
  ],
  status: 'uploaded',
  progress: { processed: 0, total: 100 },
  totals: { rows: 0, created: 0, updated: 0, unchanged: 0, invalid: 0, duplicates: 0, dnd: 0 },
  problemRows: [],
  hasErrorReport: false,
  listId: null,
  warnings: [],
  errorMessage: null,
  createdBy: 'u1',
  startedAt: null,
  completedAt: null,
  failedAt: null,
  canceledAt: null,
  createdAt: '2026-10-09T00:00:00Z',
  updatedAt: '2026-10-09T00:00:00Z',
  ...extra,
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
        contactCount: 0,
        createdAt: 'x',
        updatedAt: 'x',
      },
    ],
    meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

const fileInput = () => screen.getByTestId('file-input');

describe('upload step', () => {
  it('checks the file on the client, uploads and continues to mapping', async () => {
    vi.mocked(contactImportsApi.upload).mockImplementation((_f, _k, onProgress) => {
      onProgress?.(60);
      return Promise.resolve(job());
    });
    vi.mocked(contactImportsApi.get).mockResolvedValue(job());
    signInAs('manager');
    renderWithProviders({ route: '/contacts/import' });
    await userEvent.upload(fileInput(), new File(['x'], 'old.xls'), { applyAccept: false });
    expect(screen.getByText(/save it as .xlsx/)).toBeInTheDocument();
    const big = new File(['x'], 'big.csv');
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    await userEvent.upload(fileInput(), big);
    expect(screen.getByText(/larger than 10 MB/)).toBeInTheDocument();
    await userEvent.upload(fileInput(), new File(['a'], 'notes.txt'), { applyAccept: false });
    expect(screen.getByText('Choose a .csv or .xlsx file.')).toBeInTheDocument();
    await userEvent.upload(fileInput(), new File(['phone'], 'march.csv', { type: 'text/csv' }));
    expect(contactImportsApi.upload).toHaveBeenCalledWith(
      expect.any(File),
      'contacts',
      expect.any(Function),
    );
    expect(await screen.findByRole('table', { name: 'Column mapping' })).toBeInTheDocument();
    expect(screen.getByLabelText('Use "Mobile No" as')).toHaveTextContent('Phone');
  });

  it('drag and drop, keyboard open, server errors and the sample sheet', async () => {
    vi.mocked(contactImportsApi.upload).mockRejectedValue(
      new ApiError({
        status: 422,
        code: 'IMPORT_FILE_INVALID',
        kind: 'http',
        message: 'The sheet has a header row but no data rows.',
      }),
    );
    vi.mocked(contactImportsApi.template).mockResolvedValue(new Blob(['a']));
    const createUrl = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revoke });
    signInAs('owner');
    renderWithProviders({ route: '/contacts/import' });
    const zone = screen.getByRole('button', { name: 'Choose a file to upload' });
    fireEvent.dragOver(zone);
    fireEvent.dragLeave(zone);
    fireEvent.drop(zone, { dataTransfer: { files: [new File(['a'], 'march.csv')] } });
    expect(
      await screen.findByText('The sheet has a header row but no data rows.'),
    ).toBeInTheDocument();
    zone.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Download a sample sheet' }));
    await waitFor(() => expect(createUrl).toHaveBeenCalled());
    expect(revoke).toHaveBeenCalledWith('blob:x');
  });

  it('DND uploads skip the options step', () => {
    signInAs('owner');
    renderWithProviders({ route: '/contacts/import?kind=dnd' });
    expect(
      screen.getByRole('heading', { level: 1, name: 'Upload do-not-call numbers' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Options')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Download a sample sheet' }),
    ).not.toBeInTheDocument();
  });
});

describe('mapping → options → check → import', () => {
  it('enforces mapping rules and shows date formats / new field inputs', async () => {
    vi.mocked(contactImportsApi.get).mockResolvedValue(job({ warnings: ['encoding_fallback'] }));
    signInAs('owner');
    renderWithProviders({ route: '/contacts/import/j1' });
    expect(await screen.findByText(/read as Windows-1252/)).toBeInTheDocument();
    expect(screen.getByLabelText('Date format')).toHaveTextContent('DD/MM/YYYY');
    expect(screen.getByLabelText('Key')).toHaveValue('due_date');
    await userEvent.clear(screen.getByLabelText('Field name'));
    await userEvent.type(screen.getByLabelText('Field name'), 'Due On');
    expect(screen.getByLabelText('Key')).toHaveValue('due_on');
    await userEvent.clear(screen.getByLabelText('Key'));
    await userEvent.type(screen.getByLabelText('Key'), 'phone');
    expect(screen.getByText(/not a reserved word/)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Key'));
    await userEvent.type(screen.getByLabelText('Key'), 'loan_amount');
    expect(screen.getByText(/A field with this key exists/)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Field name'));
    expect(screen.getByText('Enter a name for the new field')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Use "Name" as'));
    await userEvent.click(screen.getByRole('option', { name: 'Phone' }));
    expect(screen.getByText('Already used by another column')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Use "Mobile No" as'));
    await userEvent.click(screen.getByRole('option', { name: "Don't import" }));
    await userEvent.click(screen.getByLabelText('Use "Name" as'));
    await userEvent.click(screen.getByRole('option', { name: 'Name' }));
    expect(screen.getByText('Choose which column has the phone numbers')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('switches xlsx sheets', async () => {
    vi.mocked(contactImportsApi.get).mockResolvedValue(
      job({ fileType: 'xlsx', sheets: ['March', 'April'], sheet: 'March' }),
    );
    vi.mocked(contactImportsApi.setMapping).mockResolvedValue(
      job({ fileType: 'xlsx', sheets: ['March', 'April'], sheet: 'April', rowCount: 5 }),
    );
    signInAs('owner');
    renderWithProviders({ route: '/contacts/import/j1' });
    await userEvent.click(await screen.findByLabelText('Sheet'));
    await userEvent.click(screen.getByRole('option', { name: 'April' }));
    await waitFor(() =>
      expect(contactImportsApi.setMapping).toHaveBeenCalledWith('j1', {
        sheet: 'April',
        columns: [],
      }),
    );
    expect(await screen.findByText(/5 rows/)).toBeInTheDocument();
  });

  it('runs the whole flow with live progress', async () => {
    const rt = fakeRealtime('open');
    vi.mocked(contactImportsApi.get).mockResolvedValue(job());
    vi.mocked(contactImportsApi.setMapping).mockResolvedValue(job({ status: 'mapped' }));
    vi.mocked(contactImportsApi.validate).mockResolvedValue(
      job({ status: 'validating', progress: { processed: 0, total: 100 } }),
    );
    signInAs('owner');
    renderWithProviders({ route: '/contacts/import/j1', realtime: rt.client });
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
    // options
    expect(screen.getByLabelText<HTMLInputElement>('List name').value).toMatch(
      /^march \d{4}-\d{2}-\d{2}$/,
    );
    await userEvent.click(screen.getByLabelText('An existing list'));
    await userEvent.click(screen.getByLabelText('List'));
    await userEvent.click(screen.getByRole('option', { name: 'March' }));
    await userEvent.click(
      screen.getByRole('switch', { name: /Update contacts that already exist/ }),
    );
    await userEvent.type(screen.getByLabelText('Tags for every imported contact'), 'March{Enter}');
    await userEvent.type(screen.getByLabelText('Consent / relationship'), 'Loan agreement');
    await userEvent.click(screen.getByRole('button', { name: 'Check the file' }));
    await waitFor(() =>
      expect(contactImportsApi.setMapping).toHaveBeenCalledWith('j1', {
        columns: [
          { index: 0, target: 'name' },
          { index: 1, target: 'phone' },
          { index: 2, target: 'field', key: 'loan_amount' },
          {
            index: 3,
            target: 'new_field',
            key: 'due_date',
            label: 'Due Date',
            type: 'date',
            dateFormat: 'DMY',
          },
        ],
        options: {
          list: { mode: 'existing', listId: 'l1' },
          updateExisting: false,
          tags: ['march'],
          consentSource: 'Loan agreement',
        },
      }),
    );
    expect(await screen.findByText(/Checking the file… 0 of 100 rows/)).toBeInTheDocument();
    rt.emit('import.progress', {
      importJobId: 'j1',
      processed: 50,
      total: 100,
      status: 'validating',
    });
    expect(await screen.findByText(/50 of 100 rows/)).toBeInTheDocument();
    rt.emit('import.progress', {
      importJobId: 'other',
      processed: 99,
      total: 100,
      status: 'validating',
    });

    vi.mocked(contactImportsApi.get).mockResolvedValue(
      job({
        status: 'validated',
        totals,
        problemRows: [
          { row: 92, reasons: ['phone_lost_digits'] },
          { row: 99, reasons: ['duplicate_of_row:2', 'type_invalid:due_date'] },
        ],
        hasErrorReport: true,
      }),
    );
    rt.emit('import.progress', {
      importJobId: 'j1',
      processed: 100,
      total: 100,
      status: 'validated',
    });
    expect(await screen.findByText('Will create')).toBeInTheDocument();
    expect(screen.getByText('87')).toBeInTheDocument();
    expect(screen.getByText(/format the column as Text/)).toBeInTheDocument();
    expect(screen.getByText('Same phone as row 2; due_date: wrong format')).toBeInTheDocument();

    vi.mocked(contactImportsApi.errorReport).mockResolvedValue({
      url: 'http://files/report.csv',
      expiresInSec: 900,
    });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await userEvent.click(screen.getByRole('button', { name: 'Download error report' }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith('http://files/report.csv', '_blank', 'noopener'),
    );

    vi.mocked(contactImportsApi.start).mockResolvedValue(
      job({ status: 'importing', progress: { processed: 0, total: 100 } }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Import 89 contacts' }));
    expect(await screen.findByText(/Importing… 0 of 100 rows/)).toBeInTheDocument();
    vi.mocked(contactImportsApi.get).mockResolvedValue(
      job({ status: 'completed', totals, listId: 'l1' }),
    );
    rt.emit('import.progress', {
      importJobId: 'j1',
      processed: 100,
      total: 100,
      status: 'completed',
    });
    expect(await screen.findByText('Import finished.')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View contacts' })).toHaveAttribute(
      'href',
      '/contacts/all?listId=l1',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Import another file' }));
    expect(
      await screen.findByRole('button', { name: 'Choose a file to upload' }),
    ).toBeInTheDocument();
  });

  it('polls while the live connection is down', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(contactImportsApi.get)
      .mockResolvedValueOnce(job({ status: 'importing', progress: { processed: 10, total: 100 } }))
      .mockResolvedValue(job({ status: 'importing', progress: { processed: 60, total: 100 } }));
    signInAs('owner');
    renderWithProviders({ route: '/contacts/import/j1' });
    expect(await screen.findByText(/10 of 100 rows/)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(await screen.findByText(/60 of 100 rows/)).toBeInTheDocument();
  });

  it('goes back from the review, stops an import, explains failures', async () => {
    vi.mocked(contactImportsApi.get).mockResolvedValue(
      job({ status: 'validated', totals, mapping: { columns: [{ index: 1, target: 'phone' }] } }),
    );
    signInAs('owner');
    renderWithProviders({ route: '/contacts/import/j1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Back to mapping' }));
    expect(screen.getByLabelText('Use "Mobile No" as')).toHaveTextContent('Phone');
    expect(screen.getByLabelText('Use "Name" as')).toHaveTextContent("Don't import");
    vi.mocked(contactImportsApi.cancel).mockResolvedValue(job({ status: 'canceled' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel import' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Cancel this import?' })).getByRole('button', {
        name: 'Cancel import',
      }),
    );
    expect(
      await screen.findByText(/Canceled. Rows imported before stopping are kept./),
    ).toBeInTheDocument();
  });

  it('stops a running import and shows failed / not-found states', async () => {
    vi.mocked(contactImportsApi.get).mockResolvedValue(
      job({ status: 'importing', progress: { processed: 500, total: 1000 } }),
    );
    vi.mocked(contactImportsApi.cancel).mockResolvedValue(job({ status: 'importing' }));
    signInAs('owner');
    renderWithProviders({ route: '/contacts/import/j1', realtime: fakeRealtime('open').client });
    await userEvent.click(await screen.findByRole('button', { name: 'Stop import' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Stop the import?' })).getByRole('button', {
        name: 'Stop import',
      }),
    );
    await waitFor(() => expect(contactImportsApi.cancel).toHaveBeenCalledWith('j1'));

    vi.mocked(contactImportsApi.get).mockResolvedValue(
      job({ status: 'failed', errorMessage: 'The import stopped after 500 rows.' }),
    );
    renderWithProviders({ route: '/contacts/import/j2' });
    expect(await screen.findByText('The import stopped after 500 rows.')).toBeInTheDocument();

    vi.mocked(contactImportsApi.get).mockRejectedValue(
      new ApiError({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        kind: 'http',
        message: 'Import not found',
      }),
    );
    renderWithProviders({ route: '/contacts/import/j3' });
    expect(await screen.findByText('It may belong to another account.')).toBeInTheDocument();
    vi.mocked(contactImportsApi.get).mockRejectedValue(
      new ApiError({ status: 500, code: 'INTERNAL_ERROR', kind: 'http', message: 'Server broke' }),
    );
    renderWithProviders({ route: '/contacts/import/j4' });
    expect(await screen.findByText('Server broke')).toBeInTheDocument();
  });

  it('DND jobs check right after mapping and link to the DND list', async () => {
    const dndJob = job({
      kind: 'dnd',
      columns: [{ index: 0, header: 'Mobile', samples: ['98765'] }],
      suggestedMapping: [{ index: 0, target: 'phone' }],
    });
    vi.mocked(contactImportsApi.get).mockResolvedValue(dndJob);
    vi.mocked(contactImportsApi.setMapping).mockResolvedValue({ ...dndJob, status: 'mapped' });
    vi.mocked(contactImportsApi.validate).mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'CONFLICT_INVALID_STATE',
        kind: 'http',
        message: 'Another import is being checked',
      }),
    );
    signInAs('owner');
    renderWithProviders({ route: '/contacts/import/j1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(contactImportsApi.setMapping).toHaveBeenCalledWith('j1', {
        columns: [{ index: 0, target: 'phone' }],
      }),
    );
    expect(await screen.findByText('Another import is being checked')).toBeInTheDocument();
    vi.mocked(contactImportsApi.get).mockResolvedValue({
      ...dndJob,
      status: 'completed',
      totals: { ...totals, created: 2 },
    });
    renderWithProviders({ route: '/contacts/import/j9' });
    expect(await screen.findByText('Numbers added to the do-not-call list.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View do-not-call list' })).toHaveAttribute(
      'href',
      '/contacts/dnd',
    );
    expect(screen.getByText('Added')).toBeInTheDocument();
  });

  it('refreshes fields, lists, contacts and DND once the import runs (also without WS)', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    vi.mocked(contactImportsApi.get).mockResolvedValue(job({ status: 'completed', totals }));
    signInAs('owner');
    renderWithProviders({ route: '/contacts/import/j1', queryClient });
    expect(await screen.findByText('Import finished.')).toBeInTheDocument();
    const keys = invalidate.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    for (const key of ['["contacts"]', '["custom-fields"]', '["contact-lists"]', '["dnd"]']) {
      expect(keys).toContain(key);
    }
  });

  it('needs contacts.import', async () => {
    signInAs('agent');
    renderWithProviders({ route: '/contacts/import' });
    expect(await screen.findByRole('heading', { level: 1, name: '403' })).toBeInTheDocument();
  });
});
