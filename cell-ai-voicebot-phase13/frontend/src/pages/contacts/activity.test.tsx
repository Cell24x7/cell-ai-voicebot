import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { contactExportsApi } from '@/services/api/contact-exports';
import { contactImportsApi } from '@/services/api/contact-imports';
import { ApiError } from '@/services/api/errors';
import type { ExportJob, ImportJob } from '@/services/api/types';
import { signInAs } from '@/test/auth';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))) },
}));
vi.mock('@/services/api/contact-imports', () => ({
  contactImportsApi: { list: vi.fn(), cancel: vi.fn(), errorReport: vi.fn() },
}));
vi.mock('@/services/api/contact-exports', () => ({
  contactExportsApi: { list: vi.fn(), get: vi.fn() },
}));

const totals = {
  rows: 100,
  created: 87,
  updated: 2,
  unchanged: 0,
  invalid: 8,
  duplicates: 3,
  dnd: 2,
};
const imp = (id: string, extra: Partial<ImportJob>): ImportJob => ({
  id,
  kind: 'contacts',
  fileName: `${id}.csv`,
  fileType: 'csv',
  fileSize: 10,
  sheet: null,
  sheets: [],
  columns: [],
  rowCount: 100,
  mapping: null,
  options: null,
  status: 'uploaded',
  progress: { processed: 0, total: 100 },
  totals: { ...totals, created: 0, updated: 0, invalid: 0, duplicates: 0 },
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
const exp = (id: string, extra: Partial<ExportJob>): ExportJob => ({
  id,
  kind: 'contacts',
  campaignId: null,
  format: 'csv',
  scope: 'segment',
  columns: ['name'],
  status: 'ready',
  progress: { processed: 40, total: 40 },
  rowCount: 40,
  errorMessage: null,
  createdBy: 'u1',
  completedAt: null,
  expiresAt: null,
  createdAt: '2026-10-09T00:00:00Z',
  ...extra,
});
const page = <T,>(data: T[]) => ({
  success: true as const,
  data,
  meta: { page: 1, limit: 20, total: data.length, totalPages: 1 },
});

afterEach(() => vi.clearAllMocks());

describe('ActivityPage', () => {
  it('lists imports with open / error report / cancel and refreshes on progress', async () => {
    vi.mocked(contactImportsApi.list).mockResolvedValue(
      page([
        imp('done', { status: 'completed', totals, hasErrorReport: true, kind: 'dnd' }),
        imp('open', { status: 'mapped' }),
      ]),
    );
    vi.mocked(contactImportsApi.errorReport).mockResolvedValue({
      url: 'http://files/r.csv',
      expiresInSec: 900,
    });
    vi.mocked(contactImportsApi.cancel).mockResolvedValue(imp('open', { status: 'canceled' }));
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const rt = fakeRealtime('open');
    signInAs('manager');
    renderWithProviders({ route: '/contacts/activity', realtime: rt.client });
    const table = await screen.findByRole('table', { name: 'Imports' });
    const done = (await within(table).findByText('done.csv')).closest('tr') as HTMLElement;
    expect(within(done).getByText('89 of 100')).toBeInTheDocument();
    expect(within(done).getByText('11')).toBeInTheDocument();
    expect(within(done).getByText('Do-not-call')).toBeInTheDocument();
    expect(within(done).queryByRole('link', { name: 'Open' })).not.toBeInTheDocument();
    await userEvent.click(within(done).getByRole('button', { name: 'Error report' }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith('http://files/r.csv', '_blank', 'noopener'),
    );

    const pending = within(table).getByText('open.csv').closest('tr') as HTMLElement;
    expect(within(pending).getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      '/contacts/import/open',
    );
    await userEvent.click(within(pending).getByRole('button', { name: 'Cancel' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Cancel open.csv?' })).getByRole('button', {
        name: 'Cancel import',
      }),
    );
    await waitFor(() => expect(contactImportsApi.cancel).toHaveBeenCalledWith('open'));

    const calls = vi.mocked(contactImportsApi.list).mock.calls.length;
    rt.emit('import.progress', {
      importJobId: 'open',
      processed: 1,
      total: 100,
      status: 'importing',
    });
    await waitFor(() =>
      expect(vi.mocked(contactImportsApi.list).mock.calls.length).toBeGreaterThan(calls),
    );
  });

  it('shows errors from actions', async () => {
    vi.mocked(contactImportsApi.list).mockResolvedValue(
      page([imp('x', { status: 'validated', hasErrorReport: true })]),
    );
    vi.mocked(contactImportsApi.errorReport).mockRejectedValue(
      new ApiError({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        kind: 'http',
        message: 'The error report has expired',
      }),
    );
    signInAs('owner');
    renderWithProviders({ route: '/contacts/activity' });
    await userEvent.click(await screen.findByRole('button', { name: 'Error report' }));
    expect(await screen.findByText('The error report has expired')).toBeInTheDocument();
  });

  it('lists exports and downloads ready files', async () => {
    vi.mocked(contactImportsApi.list).mockResolvedValue(page([]));
    vi.mocked(contactExportsApi.list).mockResolvedValue(
      page([
        exp('e1', {}),
        exp('e2', {
          status: 'processing',
          scope: 'ids',
          progress: { processed: 1, total: 7 },
          rowCount: 0,
        }),
      ]),
    );
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const rt = fakeRealtime('open');
    signInAs('manager');
    renderWithProviders({ route: '/contacts/activity', realtime: rt.client });
    expect(await screen.findByText('No imports yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Import a file' })).toHaveAttribute(
      'href',
      '/contacts/import',
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Exports' }));
    const table = await screen.findByRole('table', { name: 'Exports' });
    expect(within(table).getByText('A segment')).toBeInTheDocument();
    expect(within(table).getByText('Selected contacts')).toBeInTheDocument();
    expect(within(table).getByText('7')).toBeInTheDocument();
    expect(within(table).getAllByRole('button', { name: 'Download' })).toHaveLength(1);

    vi.mocked(contactExportsApi.get).mockResolvedValueOnce(
      exp('e1', { downloadUrl: 'http://files/e1.csv' }),
    );
    await userEvent.click(within(table).getByRole('button', { name: 'Download' }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith('http://files/e1.csv', '_blank', 'noopener'),
    );
    vi.mocked(contactExportsApi.get).mockResolvedValueOnce(exp('e1', {}));
    await userEvent.click(within(table).getByRole('button', { name: 'Download' }));
    expect(
      await screen.findByText('This export has expired — make a new one.'),
    ).toBeInTheDocument();
    vi.mocked(contactExportsApi.get).mockRejectedValueOnce(
      new ApiError({ status: 500, code: 'INTERNAL_ERROR', kind: 'http', message: 'Boom' }),
    );
    await userEvent.click(within(table).getByRole('button', { name: 'Download' }));
    expect(await screen.findByText('Boom')).toBeInTheDocument();

    const calls = vi.mocked(contactExportsApi.list).mock.calls.length;
    rt.emit('export.progress', { exportJobId: 'e2', processed: 7, total: 7, status: 'ready' });
    await waitFor(() =>
      expect(vi.mocked(contactExportsApi.list).mock.calls.length).toBeGreaterThan(calls),
    );
  });

  it('read-only roles see history without actions or the exports tab', async () => {
    vi.mocked(contactImportsApi.list).mockResolvedValue(page([imp('v', { status: 'mapped' })]));
    signInAs('viewer');
    renderWithProviders({ route: '/contacts/activity' });
    expect(await screen.findByText('v.csv')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Exports' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Import a file' })).not.toBeInTheDocument();
  });
});
