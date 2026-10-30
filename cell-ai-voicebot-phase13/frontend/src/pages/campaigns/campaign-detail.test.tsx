import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { etaText } from '@/features/campaigns/eta';
import { callsApi } from '@/services/api/calls';
import { campaignsApi } from '@/services/api/campaigns';
import { contactExportsApi } from '@/services/api/contact-exports';
import { ApiError } from '@/services/api/errors';
import { flowsApi } from '@/services/api/flows';
import { signInAs } from '@/test/auth';
import { fakeCall } from '@/test/calls';
import {
  fakeCampaign,
  fakeCampaignContact,
  fakeCampaignListItem,
  fakeStats,
} from '@/test/campaigns';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/campaigns', () => ({
  campaignsApi: {
    get: vi.fn(),
    contacts: vi.fn(),
    runs: vi.fn(),
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    duplicate: vi.fn(),
    remove: vi.fn(),
    exportResults: vi.fn(),
    list: vi.fn(),
  },
}));
vi.mock('@/services/api/calls', () => ({ callsApi: { active: vi.fn() } }));
vi.mock('@/services/api/contact-exports', () => ({ contactExportsApi: { get: vi.fn() } }));
vi.mock('@/services/api/flows', () => ({ flowsApi: { list: vi.fn() } }));
vi.mock('@/services/api/contact-lists', () => ({
  contactListsApi: { list: vi.fn(() => Promise.resolve({ data: [], meta: {} })) },
}));
vi.mock('@/services/api/segments', () => ({
  segmentsApi: { list: vi.fn(() => Promise.resolve([])) },
}));
vi.mock('@mui/x-charts/BarChart', () => ({
  BarChart: (props: { series: { data: number[] }[] }) => (
    <div data-testid="outcomes-chart">{props.series[0]?.data.join(',')}</div>
  ),
}));

const api = vi.mocked(campaignsApi);
const page = <T,>(data: T[], nextCursor: string | null = null) => ({
  success: true as const,
  data,
  meta: { hasMore: Boolean(nextCursor), nextCursor },
});

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue(fakeCampaign());
  api.contacts.mockResolvedValue(
    page(
      [
        fakeCampaignContact(),
        fakeCampaignContact({
          id: 'cc2',
          contact: { id: 'k2', name: 'Ravi Kumar' },
          phoneLast4: '0000',
          status: 'callback_wait',
          disposition: 'callback_requested',
          callback: { date: '2026-10-22', time: '17:00' },
          promiseToPay: { date: '2026-10-25', amountMicros: 500_000_000 },
          nextAttemptAt: '2026-10-22T11:30:00.000Z',
          lastCallId: null,
        }),
        fakeCampaignContact({
          id: 'cc3',
          contact: { id: 'k3', name: 'Capped Kumar' },
          phoneLast4: '1111',
          status: 'pending',
          waitReason: 'daily_cap',
          nextAttemptAt: '2026-10-22T03:30:00.000Z',
          lastCallId: null,
        }),
      ],
      'n1',
    ),
  );
  api.runs.mockResolvedValue([]);
  vi.mocked(callsApi.active).mockResolvedValue([
    fakeCall({
      id: 'live1',
      status: 'in_progress',
      campaign: { id: 'cp1', name: 'October recovery', attempt: 1 },
    }),
    fakeCall({ id: 'other', status: 'in_progress', campaign: null }),
  ]);
  vi.mocked(flowsApi.list).mockResolvedValue({ data: [], meta: {} } as never);
});

describe('/campaigns/:id', () => {
  it('header, live counters (campaign.progress), outcomes, skips, would-have-cost, live calls, results', async () => {
    const rt = fakeRealtime();
    signInAs('viewer');
    renderWithProviders({ route: '/campaigns/cp1', realtime: rt.client });
    expect(await screen.findByRole('heading', { name: 'October recovery' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Loan recovery v2' })).toHaveAttribute(
      'href',
      '/flows/f1',
    );
    expect(screen.getByText('Dry run')).toBeInTheDocument();
    expect(rt.topics).toContain('campaign:cp1');
    const counters = screen.getByLabelText('Counters');
    expect(within(counters).getByLabelText('Completed')).toHaveTextContent('45');
    rt.emit('campaign.progress', { campaignId: 'cp1', stats: { completed: 46, calling: 2 } });
    await waitFor(() =>
      expect(within(counters).getByLabelText('Completed')).toHaveTextContent('46'),
    );
    expect(screen.getByText('Would have cost ₹125.50')).toBeInTheDocument();
    expect(screen.getByText('83 % answered · 60 calls')).toBeInTheDocument();
    expect(screen.getByTestId('outcomes-chart')).toHaveTextContent('20,15,5');
    expect(
      within(screen.getByLabelText('Skipped by reason')).getByText('On the do-not-call list'),
    ).toBeInTheDocument();
    const live = await screen.findByLabelText('Live calls');
    expect(await within(live).findByText('Asha Verma · In call')).toBeInTheDocument();
    expect(within(live).getByText('Live calls (1)')).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Campaign results' });
    expect(await within(table).findByText('••••3210')).toBeInTheDocument();
    // the status chip (the column header says Callback too)
    expect(within(table).getAllByText('Callback')).toHaveLength(2);
    expect(within(table).getByText('2026-10-22 17:00')).toBeInTheDocument();
    expect(within(table).getByText('Daily call limit reached')).toBeInTheDocument();
    expect(within(table).getByText('2026-10-25 · ₹500.00')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'Call' })).toHaveAttribute('href', '/calls/c1');
    expect(within(table).getByRole('link', { name: 'Asha Verma' })).toHaveAttribute(
      'href',
      '/contacts/c/k1',
    );
    // viewers: no controls, no export
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
  });

  it('results filters and Load more', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    renderWithProviders({ route: '/campaigns/cp1' });
    const table = await screen.findByRole('table', { name: 'Campaign results' });
    await within(table).findByText('••••3210');
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() =>
      expect(api.contacts).toHaveBeenLastCalledWith('cp1', { limit: 50, cursor: 'n1' }),
    );
    await user.click(screen.getByLabelText('Status'));
    await user.click(screen.getByRole('option', { name: 'Callback' }));
    await waitFor(() =>
      expect(api.contacts).toHaveBeenLastCalledWith('cp1', {
        limit: 50,
        status: ['callback_wait'],
      }),
    );
    await user.click(screen.getByLabelText('Last result'));
    await user.click(screen.getByRole('option', { name: 'Busy' }));
    await user.click(screen.getByLabelText('Outcome'));
    await user.click(screen.getByRole('option', { name: 'Paid' }));
    await user.click(screen.getByLabelText('Skip reason'));
    await user.click(screen.getByRole('option', { name: 'Opted out' }));
    await user.type(screen.getByLabelText('Name'), 'asha');
    await waitFor(() =>
      expect(api.contacts).toHaveBeenLastCalledWith('cp1', {
        limit: 50,
        status: ['callback_wait'],
        lastResult: 'busy',
        disposition: 'paid',
        skipReason: 'opted_out',
        q: 'asha',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(api.contacts).toHaveBeenLastCalledWith('cp1', { limit: 50 }));
  });

  it.each([
    ['wallet_empty', 'Paused — the wallet would run out (dry run)', 'Add money'],
    ['too_many_failures', 'Paused — too many calls failed in a row', null],
    ['admin', 'Paused — paused by the platform team', null],
    ['flow_not_runnable', /Paused — its flow can no longer run/, null],
    ['manual', 'Paused — paused by a team member', null],
  ] as const)('banner for a %s pause', async (reason, title, action) => {
    signInAs('owner');
    api.get.mockResolvedValue(fakeCampaign({ status: 'paused', pauseReason: reason }));
    renderWithProviders({ route: '/campaigns/cp1' });
    expect(await screen.findByText(title)).toBeInTheDocument();
    if (action)
      expect(screen.getByRole('link', { name: action })).toHaveAttribute('href', '/wallet');
    // only a superadmin lifts an admin pause
    expect(Boolean(screen.queryByRole('button', { name: 'Resume' }))).toBe(reason !== 'admin');
  });

  it('banners: waiting for the window, scheduled, completed summary, failed', async () => {
    signInAs('owner');
    api.get.mockResolvedValueOnce(fakeCampaign({ waitingUntil: '2026-10-24T03:30:00.000Z' }));
    let view = renderWithProviders({ route: '/campaigns/cp1' });
    expect(
      await screen.findByText('Waiting for the calling window — calls resume Sat 09:00'),
    ).toBeInTheDocument();
    view.unmount();
    api.get.mockResolvedValueOnce(
      fakeCampaign({
        status: 'scheduled',
        schedule: {
          startAt: '2026-10-25T04:30:00.000Z',
          endAt: null,
          timezone: 'Asia/Kolkata',
          recurrence: null,
        },
      }),
    );
    view = renderWithProviders({ route: '/campaigns/cp1' });
    expect(await screen.findByText('Scheduled — next Sun 25 Oct, 10:00.')).toBeInTheDocument();
    view.unmount();
    api.get.mockResolvedValueOnce(
      fakeCampaign({
        status: 'completed',
        completedAt: '2026-10-21T05:00:00.000Z',
        stats: fakeStats({ completed: 80, failed: 15, skipped: 5 }),
      }),
    );
    view = renderWithProviders({ route: '/campaigns/cp1' });
    expect(
      await screen.findByText(
        /Finished Wed 21 Oct, 10:30 — 80 completed, 15 not reached, 5 skipped/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    view.unmount();
    api.get.mockResolvedValueOnce(
      fakeCampaign({ status: 'failed', error: { code: 'CAMPAIGN_NOT_RUNNABLE' } }),
    );
    renderWithProviders({ route: '/campaigns/cp1' });
    expect(
      await screen.findByText(/could not start \(CAMPAIGN_NOT_RUNNABLE\)/),
    ).toBeInTheDocument();
  });

  it('controls: pause, a refused resume shows why, cancel with hang-up, duplicate', async () => {
    const user = userEvent.setup();
    signInAs('manager');
    api.pause.mockImplementation(() => {
      api.get.mockResolvedValue(fakeCampaign({ status: 'paused', pauseReason: 'manual' }));
      return Promise.resolve(fakeCampaign({ status: 'paused', pauseReason: 'manual' }));
    });
    renderWithProviders({ route: '/campaigns/cp1' });
    await user.click(await screen.findByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(api.pause).toHaveBeenCalledWith('cp1'));
    api.resume.mockRejectedValueOnce(
      new ApiError({
        status: 409,
        code: 'CONFLICT_INVALID_STATE',
        message: 'Add money to resume.',
        kind: 'http',
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Resume' }));
    expect(await screen.findByText('Add money to resume.')).toBeInTheDocument();
    api.cancel.mockResolvedValue(fakeCampaign({ status: 'canceled' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Also hang up calls in progress'));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel campaign' }));
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith('cp1', true));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    api.duplicate.mockResolvedValue(fakeCampaign({ id: 'copy', status: 'draft' }));
    await user.click(screen.getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(api.duplicate).toHaveBeenCalledWith('cp1'));
  });

  it('a draft starts with an Idempotency-Key; delete asks first and goes back to the list', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    api.get.mockResolvedValue(fakeCampaign({ status: 'draft' }));
    api.start.mockResolvedValue(fakeCampaign({ status: 'running' }));
    api.list.mockResolvedValue(page([fakeCampaignListItem()]));
    renderWithProviders({ route: '/campaigns/cp1' });
    await user.click(await screen.findByRole('button', { name: 'Start' }));
    await waitFor(() => expect(api.start).toHaveBeenCalledWith('cp1', expect.any(String)));
    api.remove.mockResolvedValue();
    api.get.mockResolvedValue(fakeCampaign({ status: 'draft' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'Delete', hidden: false }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('cp1'));
    expect(await screen.findByRole('heading', { name: 'Campaigns' })).toBeInTheDocument();
  });

  it('export: CSV → progress → download link; shortened phones without contacts.export', async () => {
    const user = userEvent.setup();
    signInAs('manager');
    api.exportResults.mockResolvedValue({ id: 'e1' } as never);
    vi.mocked(contactExportsApi.get)
      .mockResolvedValueOnce({
        id: 'e1',
        status: 'processing',
        progress: { processed: 40, total: 100 },
        rowCount: 0,
      } as never)
      .mockResolvedValue({
        id: 'e1',
        status: 'ready',
        progress: { processed: 100, total: 100 },
        rowCount: 100,
        downloadUrl: 'http://files.test/e1.csv',
      } as never);
    renderWithProviders({ route: '/campaigns/cp1' });
    await user.click(await screen.findByRole('button', { name: 'Export' }));
    await user.click(screen.getByRole('menuitem', { name: 'CSV' }));
    await waitFor(() => expect(api.exportResults).toHaveBeenCalledWith('cp1', 'csv'));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Preparing the file… 40 \/ 100/)).toBeInTheDocument();
    expect(screen.queryByText(/Phone numbers are shortened/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    api.exportResults.mockRejectedValueOnce(
      new ApiError({
        status: 409,
        code: 'CONFLICT_INVALID_STATE',
        message: 'Another campaign export is running',
        kind: 'http',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(screen.getByRole('menuitem', { name: 'Excel (XLSX)' }));
    expect(await screen.findByText('Another campaign export is running')).toBeInTheDocument();
  });

  it('recurring parents list their runs; settings and activity tabs', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    api.get.mockResolvedValue(
      fakeCampaign({
        status: 'scheduled',
        recurring: true,
        nextRunAt: '2026-10-22T04:30:00.000Z',
        schedule: {
          startAt: null,
          endAt: null,
          timezone: 'Asia/Kolkata',
          recurrence: { freq: 'daily', days: [], time: '10:00', until: null },
        },
      }),
    );
    api.runs.mockResolvedValue([
      fakeCampaignListItem({
        id: 'run2',
        runNumber: 2,
        name: 'Daily · 21 Oct',
        parentId: 'cp1',
        status: 'running',
      }),
    ]);
    renderWithProviders({ route: '/campaigns/cp1' });
    expect(await screen.findByText('Repeats — next Thu 22 Oct, 10:00.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Counters')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Runs' }));
    expect(await screen.findByRole('link', { name: '#2 · Daily · 21 Oct' })).toHaveAttribute(
      'href',
      '/campaigns/run2',
    );
    await user.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(screen.getByText(/Repeats daily at 10:00/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Activity' }));
    const activity = screen.getByRole('list', { name: 'Activity' });
    expect(within(activity).getAllByText(/Demo Owner/)).toHaveLength(2);
    expect(within(activity).getByText('Running')).toBeInTheDocument();
  });

  it('a run links to its parent; load errors show', async () => {
    signInAs('owner');
    api.get.mockResolvedValueOnce(fakeCampaign({ parentId: 'p1', runNumber: 3 }));
    const view = renderWithProviders({ route: '/campaigns/cp1' });
    expect(
      await screen.findByRole('link', { name: 'Run #3 of a repeating campaign' }),
    ).toHaveAttribute('href', '/campaigns/p1');
    view.unmount();
    api.get.mockRejectedValueOnce(
      new ApiError({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Campaign not found',
        kind: 'http',
      }),
    );
    renderWithProviders({ route: '/campaigns/cp1' });
    expect(await screen.findByText('Campaign not found')).toBeInTheDocument();
  });
});

describe('/campaigns/:id results refresh', () => {
  it('polls the results while the campaign is active (live updates can be off); not when final', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      signInAs('viewer');
      const view = renderWithProviders({ route: '/campaigns/cp1' });
      await screen.findByRole('table', { name: 'Campaign results' });
      await waitFor(() => expect(api.contacts).toHaveBeenCalledTimes(1));
      await act(() => vi.advanceTimersByTimeAsync(10_000));
      await waitFor(() => expect(api.contacts).toHaveBeenCalledTimes(2));
      view.unmount();
      api.contacts.mockClear();
      api.get.mockResolvedValue(fakeCampaign({ status: 'completed' }));
      renderWithProviders({ route: '/campaigns/cp1' });
      await screen.findByRole('table', { name: 'Campaign results' });
      await waitFor(() => expect(api.contacts).toHaveBeenCalledTimes(1));
      await act(() => vi.advanceTimersByTimeAsync(30_000));
      expect(api.contacts).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ETA', () => {
  const base = { remaining: 60, waitingUntil: null, timezone: 'Asia/Kolkata' };
  it('from the last 10 minutes of dials; the window start while waiting; nothing early', () => {
    const t0 = 1_000_000;
    expect(
      etaText({
        ...base,
        samples: [
          { at: t0, attempts: 0 },
          { at: t0 + 60_000, attempts: 12 },
        ],
        now: t0 + 60_000,
      }),
    ).toBe('≈ 5 min');
    expect(
      etaText({
        ...base,
        remaining: 6000,
        samples: [
          { at: t0, attempts: 0 },
          { at: t0 + 60_000, attempts: 12 },
        ],
        now: t0 + 60_000,
      }),
    ).toBe('≈ 8 h');
    expect(
      etaText({
        ...base,
        samples: [
          { at: t0, attempts: 0 },
          { at: t0 + 10_000, attempts: 1 },
        ],
        now: t0 + 10_000,
      }),
    ).toBeNull();
    expect(
      etaText({
        ...base,
        samples: [
          { at: t0, attempts: 5 },
          { at: t0 + 60_000, attempts: 5 },
        ],
        now: t0 + 60_000,
      }),
    ).toBeNull();
    expect(etaText({ ...base, remaining: 0, samples: [], now: t0 })).toBeNull();
    expect(
      etaText({ ...base, waitingUntil: '2026-10-24T03:30:00.000Z', samples: [], now: t0 }),
    ).toBe('continues Sat 24 Oct, 09:00');
  });
});
