import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationsTab } from '@/features/settings/NotificationsTab';
import {
  draftProblem,
  hourLabel,
  REPORT_EMAILS_MAX,
  tabsLabel,
} from '@/features/settings/report-emails';
import { ReportUnsubscribePage } from '@/pages/reports/ReportUnsubscribePage';
import { callsApi } from '@/services/api/calls';
import { campaignsApi } from '@/services/api/campaigns';
import { ApiError } from '@/services/api/errors';
import { recordExportsApi } from '@/services/api/record-exports';
import { reportSubscriptionsApi } from '@/services/api/report-subscriptions';
import { reportsApi } from '@/services/api/reports';
import type { RecordExport, Report, ReportSubscription } from '@/services/api/types';
import { ROLE_PERMISSIONS, signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/record-exports', () => ({
  recordExportsApi: {
    calls: vi.fn(),
    messages: vi.fn(),
    report: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
  },
}));
vi.mock('@/services/api/report-subscriptions', () => ({
  reportSubscriptionsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    unsubscribe: vi.fn(),
  },
}));
vi.mock('@/services/api/calls', () => ({ callsApi: { list: vi.fn() } }));
vi.mock('@/services/api/campaigns', () => ({ campaignsApi: { list: vi.fn() } }));
vi.mock('@/services/api/reports', () => ({ reportsApi: { get: vi.fn() } }));
vi.mock('@/services/api/insights', () => ({
  insightsApi: { dispositions: vi.fn(() => Promise.resolve({ dispositions: [] })) },
}));
vi.mock('./TrendChart', () => ({ default: () => <div data-testid="chart" /> }));

const exportsApi = vi.mocked(recordExportsApi);
const subsApi = vi.mocked(reportSubscriptionsApi);

const job = (over: Partial<RecordExport> = {}): RecordExport => ({
  id: 'e1',
  kind: 'calls',
  format: 'csv',
  status: 'pending',
  progress: { processed: 0, total: 3 },
  rowCount: 0,
  errorMessage: null,
  completedAt: null,
  expiresAt: null,
  createdAt: '2026-10-27T10:00:00.000Z',
  ...over,
});
const ready = (over: Partial<RecordExport> = {}) =>
  job({
    status: 'ready',
    rowCount: 3,
    progress: { processed: 3, total: 3 },
    downloadUrl: 'http://files.test/calls.csv?sig=1',
    ...over,
  });

const emptyReport = (tab: Report['tab']): Report => ({
  tab,
  range: { from: '2026-10-21', to: '2026-10-27', timezone: 'Asia/Kolkata' },
  compareRange: null,
  kpis: [],
  series: [],
  table: { columns: [], rows: [] },
  updatedAt: '2026-10-27T10:00:00.000Z',
});

const sub = (over: Partial<ReportSubscription> = {}): ReportSubscription => ({
  id: 's1',
  frequency: 'weekly',
  tabs: ['overview', 'calls'],
  hour: 9,
  active: true,
  lastSentPeriod: null,
  createdAt: '2026-10-27T10:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(callsApi.list).mockResolvedValue({
    success: true,
    data: [],
    meta: { hasMore: false, nextCursor: null },
  } as never);
  vi.mocked(campaignsApi.list).mockResolvedValue({
    success: true,
    data: [],
    meta: { hasMore: false, nextCursor: null },
  } as never);
  vi.mocked(reportsApi.get).mockImplementation((tab) => Promise.resolve(emptyReport(tab)));
  exportsApi.get.mockResolvedValue(ready());
  exportsApi.list.mockResolvedValue({
    success: true,
    data: [ready(), job({ id: 'e2', kind: 'messages', status: 'processing' })],
    meta: { page: 1, limit: 10, total: 2, totalPages: 1 },
  } as never);
});

describe('calls export', () => {
  it('exports with the page filters as days, phones and summaries on request', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    exportsApi.calls.mockResolvedValue(job());
    renderWithProviders({
      route: '/calls?from=2026-10-01&to=2026-10-02&disposition=callback&promise=1',
    });
    await user.click(await screen.findByRole('button', { name: 'Export' }));
    const dialog = await screen.findByRole('dialog', { name: 'Export calls' });
    await user.click(within(dialog).getByRole('switch', { name: 'Full phone numbers' }));
    await user.click(within(dialog).getByRole('switch', { name: 'AI summaries' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'File type' }));
    await user.click(await screen.findByRole('option', { name: 'Excel (XLSX)' }));
    await user.click(within(dialog).getByRole('button', { name: 'Start export' }));
    await waitFor(() =>
      expect(exportsApi.calls).toHaveBeenCalledWith({
        disposition: ['callback'],
        hasPromise: true,
        format: 'xlsx',
        from: '2026-10-01',
        to: '2026-10-02',
        includePhone: true,
        includeSummary: true,
      }),
    );
    const link = await within(dialog).findByRole('link', { name: 'Download (3 rows)' });
    expect(link).toHaveAttribute('href', 'http://files.test/calls.csv?sig=1');
    expect(exportsApi.get).toHaveBeenCalledWith('e1');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps full phones off without contacts.export and shows server errors', async () => {
    const user = userEvent.setup();
    signInAs('manager', {
      permissions: ROLE_PERMISSIONS.manager?.filter((p) => p !== 'contacts.export') ?? [],
    });
    exportsApi.calls.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'CONFLICT_INVALID_STATE',
        message: 'Another export is running — wait for it to finish.',
        kind: 'http',
        details: [],
      }),
    );
    renderWithProviders({ route: '/calls' });
    await user.click(await screen.findByRole('button', { name: 'Export' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('switch', { name: 'Full phone numbers' })).toBeDisabled();
    expect(within(dialog).getByText(/Numbers are shortened/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Start export' }));
    expect(await within(dialog).findByText(/Another export is running/)).toBeInTheDocument();
    expect(exportsApi.calls).toHaveBeenCalledWith(
      expect.objectContaining({ includePhone: false, includeSummary: false, format: 'csv' }),
    );
  });

  it('shows progress and failures', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    exportsApi.calls.mockResolvedValue(job());
    exportsApi.get
      .mockResolvedValueOnce(job({ status: 'processing', progress: { processed: 1, total: 3 } }))
      .mockResolvedValue(job({ status: 'failed', errorMessage: null }));
    renderWithProviders({ route: '/calls' });
    await user.click(await screen.findByRole('button', { name: 'Export' }));
    await user.click(await screen.findByRole('button', { name: 'Start export' }));
    expect(await screen.findByText(/Preparing the file… 1 \/ 3/)).toBeInTheDocument();
    expect(
      await screen.findByText('The export failed — please try again.', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it('is hidden without calls.export and while impersonating', async () => {
    signInAs('viewer');
    const { unmount } = renderWithProviders({ route: '/calls' });
    expect(await screen.findByRole('heading', { name: 'Calls' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
    unmount();
    signInAs('owner', {
      impersonation: { impersonatorId: 'sa1', impersonatorEmail: 'sa@example.com' } as never,
    });
    renderWithProviders({ route: '/calls' });
    expect(await screen.findByRole('heading', { name: 'Calls' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
  });
});

describe('report exports', () => {
  it('exports the tab with its filters, and WhatsApp messages without text', async () => {
    const user = userEvent.setup();
    signInAs('manager');
    exportsApi.report.mockResolvedValue(job({ kind: 'report' }));
    exportsApi.messages.mockResolvedValue(job({ kind: 'messages' }));
    renderWithProviders({ route: '/reports/whatsapp?range=custom&from=2026-10-01&to=2026-10-07' });
    await user.click(await screen.findByRole('button', { name: 'Export' }));
    let dialog = await screen.findByRole('dialog', { name: 'Export this report' });
    await user.click(within(dialog).getByRole('button', { name: 'Start export' }));
    await waitFor(() =>
      expect(exportsApi.report).toHaveBeenCalledWith(
        'csv',
        'whatsapp',
        expect.objectContaining({ from: '2026-10-01', to: '2026-10-07' }),
      ),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Export messages' }));
    dialog = await screen.findByRole('dialog', { name: 'Export WhatsApp messages' });
    expect(within(dialog).getByText(/never the message text/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Start export' }));
    await waitFor(() =>
      expect(exportsApi.messages).toHaveBeenCalledWith({
        format: 'csv',
        from: '2026-10-01',
        to: '2026-10-07',
      }),
    );
  });

  it('lists recent exports with a download', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    signInAs('owner');
    renderWithProviders({ route: '/reports' });
    await user.click(await screen.findByRole('button', { name: 'Recent exports' }));
    const table = await screen.findByRole('table', { name: 'Recent exports' });
    expect(within(table).getByText('Calls')).toBeInTheDocument();
    expect(within(table).getByText('WhatsApp messages')).toBeInTheDocument();
    await user.click(within(table).getByRole('button', { name: 'Download' }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith('http://files.test/calls.csv?sig=1', '_blank', 'noopener'),
    );
    exportsApi.get.mockResolvedValue(job({ status: 'expired' }));
    await user.click(within(table).getByRole('button', { name: 'Download' }));
    expect(await screen.findByText(/This export has expired/)).toBeInTheDocument();
    open.mockRestore();
  });

  it('viewers see the report without export buttons', async () => {
    signInAs('viewer');
    renderWithProviders({ route: '/reports/whatsapp' });
    expect(
      await screen.findByRole('tab', { name: 'WhatsApp', selected: true }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recent exports' })).not.toBeInTheDocument();
  });
});

describe('report e-mail helpers', () => {
  it('labels and checks drafts', () => {
    expect(hourLabel(7)).toBe('07:00');
    expect(tabsLabel(['team', 'overview'])).toBe('Overview, Team');
    expect(draftProblem({ frequency: 'daily', tabs: [], hour: 9 })).toBe(
      'Choose at least one section',
    );
    expect(draftProblem({ frequency: 'daily', tabs: ['calls'], hour: 24 })).toBe('Choose an hour');
    expect(draftProblem({ frequency: 'daily', tabs: ['calls'], hour: 0 })).toBeNull();
  });
});

describe('Settings → Notifications', () => {
  it('keeps report e-mail controls read-only while impersonating', async () => {
    signInAs('owner', {
      impersonation: { impersonatorId: 'sa1', impersonatorEmail: 'sa@example.com' } as never,
    });
    subsApi.list.mockResolvedValue([sub()]);
    renderWithProviders({ route: '/settings/notifications' });
    const table = await screen.findByRole('table', { name: 'Report e-mails' });
    expect(screen.getByRole('button', { name: 'Add report e-mail' })).toBeDisabled();
    expect(await within(table).findByRole('button', { name: 'Change' })).toBeDisabled();
    expect(within(table).getByRole('button', { name: 'Remove' })).toBeDisabled();
    expect(within(table).getByRole('switch', { name: 'Pause this e-mail' })).toBeDisabled();
  });

  it('lists, adds (with validation), changes, pauses and removes report e-mails', async () => {
    const user = userEvent.setup();
    signInAs('viewer');
    subsApi.list.mockResolvedValue([sub()]);
    subsApi.create.mockResolvedValue(sub({ id: 's2' }));
    subsApi.update.mockResolvedValue(sub());
    subsApi.remove.mockResolvedValue();
    renderWithProviders({ route: '/settings/notifications' });
    const table = await screen.findByRole('table', { name: 'Report e-mails' });
    expect(await within(table).findByText('Every Monday (last week)')).toBeInTheDocument();
    expect(within(table).getByText('09:00')).toBeInTheDocument();
    expect(within(table).getByText('Overview, Calls')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add report e-mail' }));
    let dialog = await screen.findByRole('dialog', { name: 'Add a report e-mail' });
    expect(within(dialog).getByText('Account time (Asia/Kolkata)')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox', { name: 'Overview' }));
    expect(within(dialog).getByText('Choose at least one section')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: 'WhatsApp' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'How often' }));
    await user.click(await screen.findByRole('option', { name: 'Every day (yesterday)' }));
    await user.click(within(dialog).getByRole('combobox', { name: /Send at/ }));
    await user.click(await screen.findByRole('option', { name: '18:00' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(subsApi.create).toHaveBeenCalledWith({
        frequency: 'daily',
        tabs: ['whatsapp'],
        hour: 18,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(within(table).getByRole('button', { name: 'Change' }));
    dialog = await screen.findByRole('dialog', { name: 'Change report e-mail' });
    await user.click(within(dialog).getByRole('checkbox', { name: 'Team' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(subsApi.update).toHaveBeenCalledWith('s1', {
        frequency: 'weekly',
        tabs: ['overview', 'calls', 'team'],
        hour: 9,
      }),
    );

    await user.click(within(table).getByRole('switch', { name: 'Pause this e-mail' }));
    await waitFor(() => expect(subsApi.update).toHaveBeenCalledWith('s1', { active: false }));

    await user.click(within(table).getByRole('button', { name: 'Remove' }));
    const confirm = await screen.findByRole('dialog', { name: 'Stop this report e-mail?' });
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(subsApi.remove).toHaveBeenCalledWith('s1'));
  });

  it('shows the limit and server errors', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    subsApi.list.mockResolvedValue(
      Array.from({ length: REPORT_EMAILS_MAX }, (_, i) => sub({ id: `s${String(i)}` })),
    );
    renderWithProviders({ route: '/settings/notifications' });
    expect(await screen.findByText(/most report e-mails allowed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add report e-mail' })).toBeDisabled();

    subsApi.list.mockResolvedValue([]);
    subsApi.create.mockRejectedValue(
      new ApiError({
        status: 422,
        code: 'REPORT_SUBSCRIPTION_LIMIT',
        message: 'You already get the most report e-mails allowed. Remove one first.',
        kind: 'http',
        details: [],
      }),
    );
    const { unmount } = renderWithProviders({ route: '/settings/notifications' });
    const buttons = await screen.findAllByRole('button', { name: 'Add report e-mail' });
    await user.click(buttons.at(-1) as HTMLElement);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText(/Remove one first/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    unmount();
  });

  it('explains when the role cannot see reports', () => {
    signInAs('agent');
    renderWithProviders({ routes: [{ path: '/', element: <NotificationsTab /> }] });
    expect(screen.getByText(/can't see reports/)).toBeInTheDocument();
    expect(subsApi.list).not.toHaveBeenCalled();
  });

  it('is a Settings tab only for people who can read reports', async () => {
    signInAs('agent');
    renderWithProviders({ route: '/settings/profile' });
    expect(await screen.findByRole('tab', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Notifications' })).not.toBeInTheDocument();
  });
});

describe('/report-emails/unsubscribe', () => {
  const render = (route: string) =>
    renderWithProviders({
      route,
      routes: [{ path: '/report-emails/unsubscribe', element: <ReportUnsubscribePage /> }],
    });

  it('stops the e-mail after a click', async () => {
    const user = userEvent.setup();
    subsApi.unsubscribe.mockResolvedValue({ stopped: true });
    render('/report-emails/unsubscribe?token=abc.123.def');
    expect(subsApi.unsubscribe).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Stop these e-mails' }));
    expect(await screen.findByText(/you won't get this report e-mail/)).toBeInTheDocument();
    expect(subsApi.unsubscribe).toHaveBeenCalledWith('abc.123.def');
    expect(screen.getByRole('link', { name: 'Manage report e-mails' })).toHaveAttribute(
      'href',
      '/settings/notifications',
    );
  });

  it('explains a missing, bad or old link and other errors', async () => {
    const user = userEvent.setup();
    const { unmount } = render('/report-emails/unsubscribe');
    expect(screen.getByText(/not valid any more/)).toBeInTheDocument();
    unmount();

    subsApi.unsubscribe.mockRejectedValueOnce(
      new ApiError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong.',
        kind: 'http',
        details: [],
      }),
    );
    subsApi.unsubscribe.mockRejectedValueOnce(
      new ApiError({
        status: 422,
        code: 'VALIDATION_FAILED',
        message: 'This link is not valid any more.',
        kind: 'http',
        details: [],
      }),
    );
    render('/report-emails/unsubscribe?token=abc.123.def');
    await user.click(screen.getByRole('button', { name: 'Stop these e-mails' }));
    expect(await screen.findByText('Something went wrong.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stop these e-mails' }));
    expect(await screen.findByText(/Sign in and change your report e-mails/)).toBeInTheDocument();
  });
});
