import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { agentsApi } from '@/services/api/agents';
import { campaignsApi } from '@/services/api/campaigns';
import { ApiError } from '@/services/api/errors';
import { flowsApi } from '@/services/api/flows';
import { insightsApi } from '@/services/api/insights';
import { reportsApi, type ReportTab } from '@/services/api/reports';
import { teamApi } from '@/services/api/team';
import type { Report } from '@/services/api/types';
import { whatsappApi } from '@/services/api/whatsapp';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

import {
  filtersFromParams,
  filtersToParams,
  isReportTab,
  presetRange,
  rangeProblem,
  toQuery,
} from './filters';
import { deltaOf, formatDuration, formatMetric, metricHelp, metricLabel } from './labels';

vi.mock('@/services/api/reports', () => ({ reportsApi: { get: vi.fn() } }));
vi.mock('@/services/api/campaigns', () => ({ campaignsApi: { list: vi.fn() } }));
vi.mock('@/services/api/flows', () => ({ flowsApi: { list: vi.fn() } }));
vi.mock('@/services/api/agents', () => ({ agentsApi: { list: vi.fn() } }));
vi.mock('@/services/api/team', () => ({ teamApi: { list: vi.fn() } }));
vi.mock('@/services/api/whatsapp', () => ({ whatsappApi: { channels: vi.fn() } }));
vi.mock('@/services/api/insights', () => ({
  insightsApi: {
    dispositions: vi.fn(() =>
      Promise.resolve({ dispositions: [{ key: 'promise_to_pay', label: 'PTP', active: true }] }),
    ),
  },
}));
vi.mock('./TrendChart', () => ({
  default: ({ series }: { series: { key: string }[] }) => (
    <div data-testid="chart">{series.map((s) => s.key).join(',')}</div>
  ),
}));

const api = vi.mocked(reportsApi);
const apiError = (message: string) =>
  new ApiError({ status: 500, code: 'INTERNAL_ERROR', message, kind: 'http', details: [] });

const report = (tab: ReportTab, over: Partial<Report> = {}): Report => ({
  tab,
  range: { from: '2026-10-21', to: '2026-10-27', timezone: 'Asia/Kolkata' },
  compareRange: null,
  kpis: [
    { key: 'calls_attempted', value: 12, previous: 10, unit: 'count' },
    { key: 'answer_rate', value: 58.3, previous: null, unit: 'percent' },
    { key: 'spend', value: 12_000_000, unit: 'micros' },
  ],
  series: [
    {
      key: 'calls_attempted',
      unit: 'count',
      points: [
        { day: '2026-10-26', value: 4 },
        { day: '2026-10-27', value: 8 },
      ],
    },
    {
      key: 'spend',
      unit: 'micros',
      points: [
        { day: '2026-10-26', value: 0 },
        { day: '2026-10-27', value: null },
      ],
    },
  ],
  table: {
    columns: [
      { key: 'calls', unit: 'count' },
      { key: 'share', unit: 'percent' },
    ],
    rows: [
      { id: 'promise_to_pay', label: 'promise_to_pay', values: { calls: 3, share: 42.9 } },
      { id: 'callback', label: 'callback', values: { calls: 5, share: null } },
      { id: null, label: 'No outcome', values: { calls: 1, share: 14.3 } },
    ],
  },
  updatedAt: '2026-10-27T10:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((tab) => Promise.resolve(report(tab)));
});

describe('report filters', () => {
  const today = '2026-10-27';
  it('presets, URL round trips, defaults and bad values', () => {
    expect(presetRange('today', today)).toEqual({ from: today, to: today });
    expect(presetRange('yesterday', today)).toEqual({ from: '2026-10-26', to: '2026-10-26' });
    expect(presetRange('30d', today).from).toBe('2026-09-28');
    expect(presetRange('90d', today).from).toBe('2026-07-30');
    expect(presetRange('month', today)).toEqual({ from: '2026-10-01', to: today });
    expect(presetRange('last_month', '2026-03-15')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    const empty = filtersFromParams(new URLSearchParams(), today);
    expect(empty).toMatchObject({
      preset: '7d',
      from: '2026-10-21',
      to: today,
      compare: false,
      channel: null,
      slice: null,
    });
    expect(filtersToParams(empty).toString()).toBe('');
    const full = filtersFromParams(
      new URLSearchParams(
        'range=custom&from=2026-09-01&to=2026-09-30&compare=1&channel=voice&flowId=abcdefabcdefabcdefabcdef&test=1&campaignIds=aaaaaaaaaaaaaaaaaaaaaaaa,bad',
      ),
      today,
    );
    expect(full).toMatchObject({
      preset: 'custom',
      from: '2026-09-01',
      to: '2026-09-30',
      compare: true,
      channel: 'voice',
      slice: { key: 'flowId', id: 'abcdefabcdefabcdefabcdef' },
      includeTest: true,
      campaignIds: ['aaaaaaaaaaaaaaaaaaaaaaaa'],
    });
    expect(filtersToParams(full).toString()).toBe(
      'range=custom&from=2026-09-01&to=2026-09-30&compare=1&channel=voice&flowId=abcdefabcdefabcdefabcdef&test=1&campaignIds=aaaaaaaaaaaaaaaaaaaaaaaa',
    );
    expect(toQuery(full, 'campaigns')).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
      compare: true,
      channel: 'voice',
      flowId: 'abcdefabcdefabcdefabcdef',
      includeTest: true,
      campaignIds: ['aaaaaaaaaaaaaaaaaaaaaaaa'],
    });
    expect(toQuery(full, 'overview')).not.toHaveProperty('campaignIds');
    // custom without valid days falls back to 7 days; unknown values are ignored
    expect(filtersFromParams(new URLSearchParams('range=custom&from=x'), today).preset).toBe('7d');
    expect(
      filtersFromParams(new URLSearchParams('range=nope&channel=fax&userId=1'), today),
    ).toMatchObject({ preset: '7d', channel: null, slice: null });
    expect(isReportTab('team')).toBe(true);
    expect(isReportTab('nope')).toBe(false);
    expect(rangeProblem('', today)).toBe('Choose both days');
    expect(rangeProblem('2026-10-27', '2026-10-01')).toBe('The start must be before the end');
    expect(rangeProblem('2025-01-01', '2026-10-01')).toBe('At most 366 days');
    expect(rangeProblem('2026-10-01', '2026-10-27')).toBeNull();
  });

  it('labels and formatting', () => {
    expect(metricLabel('answer_rate')).toBe('Answer rate');
    expect(metricLabel('mystery_count')).toBe('mystery count');
    expect(metricHelp('mystery_count')).toBe('');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(95)).toBe('1m 35s');
    expect(formatDuration(120)).toBe('2m');
    expect(formatDuration(3700)).toBe('1h 1m');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatMetric(null, 'count')).toBe('—');
    expect(formatMetric(undefined, 'count')).toBe('—');
    expect(formatMetric(42.5, 'percent')).toBe('42.5%');
    expect(formatMetric(1234, 'count')).toBe('1,234');
    expect(formatMetric(1_500_000, 'micros')).toBe('₹1.50');
    expect(formatMetric(61, 'seconds')).toBe('1m 1s');
    expect(deltaOf(12, 10)).toEqual({ text: '+20%', direction: 'up' });
    expect(deltaOf(5, 10)).toEqual({ text: '−50%', direction: 'down' });
    expect(deltaOf(10, 10)).toEqual({ text: '0%', direction: 'same' });
    expect(deltaOf(3, 0)).toEqual({ text: 'new', direction: 'up' });
    expect(deltaOf(0, 0)).toEqual({ text: '0%', direction: 'same' });
    expect(deltaOf(null, 1)).toBeNull();
    expect(deltaOf(1, null)).toBeNull();
  });
});

describe('/reports', () => {
  it('overview by default: KPIs with change, a chart per unit with a table view, the URL keeps filters across tabs', async () => {
    const user = userEvent.setup();
    signInAs('viewer');
    renderWithProviders({ route: '/reports?compare=1' });
    const calls = await screen.findByRole('region', { name: 'Calls' });
    expect(within(calls).getByText('12')).toBeInTheDocument();
    expect(within(calls).getByText(/\+20% · before: 10/)).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Answer rate' })).getByText('before: —'),
    ).toBeInTheDocument();
    expect((await screen.findAllByTestId('chart')).map((c) => c.textContent)).toEqual([
      'calls_attempted',
      'spend',
    ]);
    expect(screen.getAllByRole('table', { name: 'Chart as a table' })[1]).toHaveTextContent(
      '2026-10-27—',
    );
    expect(api.get).toHaveBeenLastCalledWith(
      'overview',
      expect.objectContaining({ compare: true }),
    );
    await user.click(screen.getByRole('tab', { name: 'Team' }));
    await waitFor(() =>
      expect(api.get).toHaveBeenLastCalledWith('team', expect.objectContaining({ compare: true })),
    );
  });

  it('calls tab: outcome names, sort, drill-down links, "See these calls"', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    renderWithProviders({ route: '/reports/calls' });
    const table = await screen.findByRole('table', { name: 'Calls details' });
    expect(within(table).getByRole('link', { name: 'PTP' })).toHaveAttribute(
      'href',
      expect.stringContaining('/calls?from='),
    );
    expect(within(table).getByRole('link', { name: 'PTP' }).getAttribute('href')).toContain(
      'disposition=promise_to_pay',
    );
    expect(
      within(table).getByRole('link', { name: 'No outcome' }).getAttribute('href'),
    ).not.toContain('disposition');
    const names = () =>
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.firstChild?.textContent);
    await user.click(within(table).getByText('Calls'));
    expect(names()).toEqual(['callback', 'PTP', 'No outcome']);
    await user.click(within(table).getByText('Calls'));
    expect(names()).toEqual(['No outcome', 'PTP', 'callback']);
    await user.click(within(table).getByText('Share'));
    expect(names()).toEqual(['PTP', 'No outcome', 'callback']);
    expect(screen.getByRole('link', { name: 'See these calls' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'AI settings' })).toHaveAttribute(
      'href',
      '/settings/ai',
    );
    expect(insightsApi.dispositions).toHaveBeenCalled();
  });

  it('row links per tab; one flow shows its funnel without links; empty tables', async () => {
    signInAs('owner');
    const rows = (id: string | null, label: string) => ({
      columns: [{ key: 'calls_attempted', unit: 'count' as const }],
      rows: [{ id, label, values: { calls_attempted: 1 } }],
    });
    const cases: [string, ReportTab, string | null][] = [
      ['/reports/campaigns', 'campaigns', '/campaigns/x1'],
      ['/reports/flows', 'flows', '/flows/x1'],
      ['/reports/agents', 'agents', '/agents/x1'],
      ['/reports/templates', 'templates', '/whatsapp/templates'],
    ];
    for (const [route, tab, href] of cases) {
      api.get.mockResolvedValueOnce(report(tab, { table: rows('x1', 'Row one') }));
      const view = renderWithProviders({ route });
      expect(await screen.findByRole('link', { name: 'Row one' })).toHaveAttribute('href', href);
      view.unmount();
    }
    api.get.mockResolvedValueOnce(report('team', { table: rows('u1', 'Asha') }));
    let view = renderWithProviders({ route: '/reports/team' });
    expect(await screen.findByText('Asha')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Asha' })).toBeNull();
    view.unmount();
    api.get.mockResolvedValueOnce(report('flows', { table: rows('start', 'Start') }));
    view = renderWithProviders({ route: '/reports/flows?flowId=abcdefabcdefabcdefabcdef' });
    expect(await screen.findByText('Start')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Start' })).toBeNull();
    view.unmount();
    api.get.mockResolvedValueOnce(report('agents', { table: { columns: [], rows: [] } }));
    renderWithProviders({ route: '/reports/agents' });
    expect(await screen.findByText('Nothing to show for this period.')).toBeInTheDocument();
  });

  it('filters: presets, custom range (checked), compare, channel, one slice, test calls', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    vi.mocked(campaignsApi.list).mockResolvedValue({
      data: [{ id: 'cccccccccccccccccccccccc', name: 'October dues' }],
    } as never);
    renderWithProviders({ route: '/reports' });
    await screen.findByRole('region', { name: 'Calls' });
    await user.click(screen.getByRole('combobox', { name: 'Period' }));
    await user.click(await screen.findByRole('option', { name: 'Yesterday' }));
    await waitFor(() => {
      const q = api.get.mock.lastCall?.[1];
      expect(q?.from).toBe(q?.to);
    });
    await user.click(screen.getByRole('combobox', { name: 'Period' }));
    await user.click(await screen.findByRole('option', { name: 'Custom' }));
    fireEvent.change(await screen.findByLabelText('From'), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-01' } });
    expect(screen.getByText('The start must be before the end')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-25' } });
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(api.get).toHaveBeenLastCalledWith('overview', {
        from: '2026-10-20',
        to: '2026-10-25',
      }),
    );
    await user.click(screen.getByRole('switch', { name: 'Compare with the period before' }));
    await user.click(screen.getByRole('combobox', { name: 'Calls' }));
    await user.click(await screen.findByRole('option', { name: 'WhatsApp only' }));
    await user.click(screen.getByRole('switch', { name: 'Include test calls' }));
    await user.click(screen.getByRole('combobox', { name: 'Show one' }));
    await user.click(await screen.findByRole('option', { name: 'Campaign' }));
    await user.click(await screen.findByRole('combobox', { name: 'Campaign' }));
    await user.click(await screen.findByRole('option', { name: 'October dues' }));
    await waitFor(() =>
      expect(api.get).toHaveBeenLastCalledWith('overview', {
        from: '2026-10-20',
        to: '2026-10-25',
        compare: true,
        channel: 'whatsapp',
        campaignId: 'cccccccccccccccccccccccc',
        includeTest: true,
      }),
    );
    await user.click(screen.getByRole('combobox', { name: 'Show one' }));
    await user.click(await screen.findByRole('option', { name: 'Everything' }));
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Campaign' })).toBeNull());
  });

  it('every slice list loads from its own API; a failing list says so', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    vi.mocked(flowsApi.list).mockResolvedValue({
      data: [{ id: 'f1', name: 'Loan recovery' }],
    } as never);
    vi.mocked(agentsApi.list).mockResolvedValue({
      data: [{ id: 'a1', name: 'Recovery Bot' }],
    } as never);
    vi.mocked(teamApi.list).mockResolvedValue({ data: [{ id: 'u1', name: 'Asha' }] } as never);
    vi.mocked(whatsappApi.channels).mockRejectedValue(apiError('nope'));
    renderWithProviders({ route: '/reports' });
    await screen.findByRole('region', { name: 'Calls' });
    for (const [kind, option] of [
      ['Flow', 'Loan recovery'],
      ['AI agent', 'Recovery Bot'],
      ['Team member', 'Asha'],
    ] as const) {
      await user.click(screen.getByRole('combobox', { name: 'Show one' }));
      await user.click(await screen.findByRole('option', { name: kind }));
      await user.click(await screen.findByRole('combobox', { name: kind }));
      expect(await screen.findByRole('option', { name: option })).toBeInTheDocument();
      await user.keyboard('{Escape}');
    }
    await user.click(screen.getByRole('combobox', { name: 'Show one' }));
    await user.click(await screen.findByRole('option', { name: 'WhatsApp number' }));
    expect(await screen.findByText('Could not load the list')).toBeInTheDocument();
  });

  it('a report error can be retried; unknown tabs go to the overview; agents have no access', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    api.get.mockRejectedValueOnce(apiError('Reports are down'));
    renderWithProviders({ route: '/reports/calls' });
    expect(await screen.findByText('Reports are down')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('table', { name: 'Calls details' })).toBeInTheDocument();
    const view = renderWithProviders({ route: '/reports/nope' });
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('overview', expect.anything()));
    view.unmount();
    signInAs('agent');
    renderWithProviders({ route: '/reports' });
    expect(
      await screen.findByText(/don't have access|not allowed|Forbidden|permission/i),
    ).toBeInTheDocument();
  });
});

describe('Dashboard KPIs', () => {
  it("today's numbers against yesterday for people with reports; none for agents", async () => {
    signInAs('owner');
    const view = renderWithProviders({ route: '/' });
    const today = await screen.findByRole('region', { name: 'Today' });
    expect(await within(today).findByRole('region', { name: 'Answer rate' })).toBeInTheDocument();
    expect(within(today).queryByRole('region', { name: 'Talk time' })).toBeNull();
    expect(within(today).getByRole('link', { name: 'View reports' })).toHaveAttribute(
      'href',
      '/reports',
    );
    expect(api.get).toHaveBeenCalledWith('overview', expect.objectContaining({ compare: true }));
    view.unmount();
    api.get.mockRejectedValueOnce(apiError('x'));
    const failing = renderWithProviders({ route: '/' });
    expect(
      await screen.findByText("Today's numbers are not available right now."),
    ).toBeInTheDocument();
    failing.unmount();
    signInAs('agent');
    renderWithProviders({ route: '/' });
    await screen.findByText(/Welcome/);
    expect(screen.queryByRole('region', { name: 'Today' })).toBeNull();
  });
});
