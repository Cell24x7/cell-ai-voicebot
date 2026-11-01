import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { customFieldsApi } from '@/services/api/custom-fields';
import { ApiError } from '@/services/api/errors';
import { sheetImportsApi } from '@/services/api/sheet-imports';
import type { CustomField } from '@/services/api/types';
import { signInAs } from '@/test/auth';
import { pick } from '@/test/inspector';
import { fakeSheet, fakeSheetPreview } from '@/test/integrations';
import { renderWithProviders } from '@/test/render';

import { SheetsTab } from './SheetsTab';

vi.mock('@/services/api/sheet-imports', () => ({
  sheetImportsApi: {
    list: vi.fn(),
    preview: vi.fn(),
    create: vi.fn(),
    run: vi.fn(),
    remove: vi.fn(),
  },
}));
vi.mock('@/services/api/custom-fields', () => ({ customFieldsApi: { list: vi.fn() } }));

const api = vi.mocked(sheetImportsApi);
const httpError = (message: string) =>
  new ApiError({ status: 400, code: 'SHEET_URL_INVALID', message, kind: 'http' });
const CITY: CustomField = {
  id: 'f1',
  key: 'city',
  label: 'City',
  type: 'text',
  required: false,
  defaultValue: null,
  order: 0,
  createdAt: '2026-10-30T05:00:00.000Z',
  updatedAt: '2026-10-30T05:00:00.000Z',
};
const URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-x/pub?output=csv';
const show = () => renderWithProviders({ routes: [{ path: '/', element: <SheetsTab /> }] });
const row = (text: string) => screen.getByRole('row', { name: new RegExp(`^${text}`) });

beforeEach(() => {
  vi.clearAllMocks();
  signInAs('owner');
  api.list.mockResolvedValue([fakeSheet()]);
  vi.mocked(customFieldsApi.list).mockResolvedValue([CITY]);
});

describe('Google Sheets tab', () => {
  it('lists imports with schedule, list, last run and next run; empty and error states', async () => {
    api.list.mockResolvedValueOnce([
      fakeSheet(),
      fakeSheet({
        id: 's2',
        name: 'Broken sheet',
        schedule: 'hourly',
        listName: null,
        lastStatus: 'failed',
        lastError: 'The sheet is not published',
        lastResult: null,
        nextRunAt: null,
      }),
      fakeSheet({ id: 's3', name: 'Busy sheet', schedule: 'once', lastStatus: 'busy' }),
      fakeSheet({ id: 's4', name: 'New sheet', lastStatus: null, lastResult: null }),
    ]);
    const first = show();
    expect(await screen.findByText('Leads sheet')).toBeInTheDocument();
    expect(within(row('Leads sheet')).getByText('Every day')).toBeInTheDocument();
    expect(within(row('Leads sheet')).getByText('Sheet: Leads sheet')).toBeInTheDocument();
    expect(within(row('Leads sheet')).getByText('Imported')).toBeInTheDocument();
    expect(
      within(row('Leads sheet')).getByText(/10 added · 1 updated ·\s*1 skipped/),
    ).toBeInTheDocument();
    expect(within(row('Broken sheet')).getByText('Every hour')).toBeInTheDocument();
    expect(within(row('Broken sheet')).getByText('Failed')).toBeInTheDocument();
    expect(within(row('Broken sheet')).getByText('The sheet is not published')).toBeInTheDocument();
    expect(within(row('Busy sheet')).getByText('Waiting for another import')).toBeInTheDocument();
    expect(within(row('Busy sheet')).getByText('Once')).toBeInTheDocument();
    first.unmount();

    api.list.mockResolvedValueOnce([]);
    const empty = show();
    expect(await screen.findByText('No Google Sheets yet')).toBeInTheDocument();
    empty.unmount();

    api.list.mockRejectedValueOnce(new Error('offline'));
    show();
    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('runs now (not while running) and stops an import', async () => {
    api.list.mockResolvedValue([
      fakeSheet(),
      fakeSheet({ id: 's2', name: 'Running sheet', lastStatus: 'running' }),
    ]);
    api.run.mockRejectedValueOnce(httpError('Already running')).mockResolvedValue(fakeSheet());
    api.remove.mockRejectedValueOnce(httpError('nope')).mockResolvedValue(undefined);
    show();
    await screen.findByText('Running sheet');
    expect(within(row('Running sheet')).getByText('Importing')).toBeInTheDocument();
    expect(within(row('Running sheet')).getByRole('button', { name: 'Run now' })).toBeDisabled();
    await userEvent.click(within(row('Leads sheet')).getByRole('button', { name: 'Run now' }));
    expect(api.run).toHaveBeenCalledWith('s1');
    expect(await screen.findByText('Already running')).toBeInTheDocument();
    await waitFor(() =>
      expect(within(row('Leads sheet')).getByRole('button', { name: 'Run now' })).toBeEnabled(),
    );
    await userEvent.click(within(row('Leads sheet')).getByRole('button', { name: 'Run now' }));
    await waitFor(() => expect(api.run).toHaveBeenCalledTimes(2));

    await userEvent.click(within(row('Leads sheet')).getByRole('button', { name: 'Remove' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Stop' }));
    expect(await screen.findByText('nope')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(within(row('Leads sheet')).getByRole('button', { name: 'Remove' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(within(row('Leads sheet')).getByRole('button', { name: 'Remove' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Stop' }));
    expect(await screen.findByText('Sheet import stopped')).toBeInTheDocument();
    expect(api.remove).toHaveBeenCalledTimes(2);
  });

  it('adds a sheet: check link, map columns, schedule, update existing', async () => {
    api.preview
      .mockRejectedValueOnce(httpError('Paste the "Publish to web" CSV link'))
      .mockResolvedValue(fakeSheetPreview());
    api.create.mockRejectedValueOnce(httpError('Too many sheets')).mockResolvedValue(fakeSheet());
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Add sheet' }));
    const dialog = screen.getByRole('dialog', { name: 'Import contacts from a Google Sheet' });
    const add = within(dialog).getByRole('button', { name: 'Add sheet' });
    const check = within(dialog).getByRole('button', { name: 'Check link' });
    expect(check).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Leads');
    await userEvent.type(within(dialog).getByLabelText('Published CSV link'), 'https://x.test');
    await userEvent.click(check);
    expect(await within(dialog).findByText(/Publish to web" CSV link/)).toBeInTheDocument();
    expect(add).toBeDisabled();

    await userEvent.clear(within(dialog).getByLabelText('Published CSV link'));
    await userEvent.type(within(dialog).getByLabelText('Published CSV link'), URL);
    await userEvent.click(check);
    expect(api.preview).toHaveBeenLastCalledWith(URL);
    const mapping = await within(dialog).findByLabelText('Column mapping');
    expect(
      within(mapping).getByText('2 rows found — choose what each column is'),
    ).toBeInTheDocument();
    expect(within(mapping).getByText('Asha, Ravi')).toBeInTheDocument();
    expect(add).toBeEnabled();

    // two columns as phone → error; phone dropped → global error; then fixed
    await pick('Import as', 'Phone', 0);
    expect(within(mapping).getAllByText('Already used by another column')).toHaveLength(1);
    expect(add).toBeDisabled();
    await pick('Import as', "Don't import", 0);
    await pick('Import as', "Don't import", 1);
    expect(
      within(mapping).getByText('Choose which column has the phone numbers'),
    ).toBeInTheDocument();
    await pick('Import as', 'Phone', 1);
    await pick('Import as', 'Name', 0);

    await pick('Import', 'Every hour');
    await userEvent.click(
      within(dialog).getByLabelText('Update contacts that already exist (same phone)'),
    );
    await userEvent.click(add);
    expect(await within(dialog).findByText('Too many sheets')).toBeInTheDocument();
    expect(api.create).toHaveBeenCalledWith({
      name: 'Leads',
      url: URL,
      schedule: 'hourly',
      updateExisting: false,
      mapping: [
        { index: 0, target: 'name' },
        { index: 1, target: 'phone' },
        { index: 2, target: 'field', key: 'city' },
      ],
    });
    await userEvent.click(add);
    expect(await screen.findByText(/Sheet added/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('changing the link drops the checked columns; columns without a header; cancel', async () => {
    api.preview.mockResolvedValue(
      fakeSheetPreview({
        columns: [
          { index: 0, header: '', samples: ['9876543210'] },
          { index: 1, header: 'Name', samples: [] },
        ],
        rowCount: 1,
        suggestedMapping: [{ index: 0, target: 'phone' }],
      }),
    );
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Add sheet' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Published CSV link'), URL);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Check link' }));
    expect(await within(dialog).findByText('Column 1')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Published CSV link'), 'x');
    expect(within(dialog).queryByLabelText('Column mapping')).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('people without contacts.import only see the list', async () => {
    signInAs('viewer');
    show();
    expect(await screen.findByText('Leads sheet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add sheet' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run now' })).not.toBeInTheDocument();
  });
});
