import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { campaignsApi, type DryRunOutcome, type ScenarioKey } from '@/services/api/campaigns';
import type { Campaign, CampaignWindow } from '@/services/api/types';
import { RealtimeContext } from '@/services/realtime/context';
import { signInAs } from '@/test/auth';
import { fakeCampaign, fakeCampaignContact, fakeCampaignListItem } from '@/test/campaigns';
import { fakeRealtime } from '@/test/realtime';

import { CallingWindowField } from './fields/CallingWindowField';
import { scheduleMode, scheduleProblems, type ScheduleValue } from './fields/schedule';
import { ScheduleField } from './fields/ScheduleField';
import { OutcomeMixField, ScenarioWeightsField } from './fields/WeightFields';
import { remainder } from './fields/weights';
import { campaignKeys } from './keys';
import {
  campaignStatusColor,
  contactStatusColor,
  dispositionLabel,
  skipReasonLabel,
  waitingText,
} from './labels';
import {
  CAMPAIGN_POLL_MS,
  useAudiencePreview,
  useCampaign,
  useCampaignContacts,
  useCampaignEstimate,
  useCampaignLiveUpdates,
  useCampaignRuns,
  useCampaigns,
  useCanExportCampaigns,
  useCanRunCampaigns,
  useCanWriteCampaigns,
} from './queries';
import { formatInZone, fromLocalInput, intersectWindows, toLocalInput } from './time';

vi.mock('@/services/api/campaigns', () => ({
  campaignsApi: {
    list: vi.fn(),
    get: vi.fn(),
    contacts: vi.fn(),
    runs: vi.fn(),
    estimate: vi.fn(),
    previewAudience: vi.fn(),
  },
}));

const IST = 'Asia/Kolkata';
const page = <T,>(data: T[], nextCursor: string | null) => ({
  success: true as const,
  data,
  meta: { hasMore: nextCursor !== null, nextCursor },
});

describe('campaign queries', () => {
  const rt = fakeRealtime();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <RealtimeContext value={rt.client}>{children}</RealtimeContext>
    </QueryClientProvider>
  );
  const api = vi.mocked(campaignsApi);
  beforeEach(() => {
    client.clear();
    api.list
      .mockReset()
      .mockResolvedValueOnce(page([fakeCampaignListItem()], 'n1'))
      .mockResolvedValueOnce(page([fakeCampaignListItem({ id: 'cp2' })], null));
    api.get.mockReset().mockResolvedValue(fakeCampaign());
    api.contacts.mockReset().mockResolvedValue(page([fakeCampaignContact()], null));
    api.runs.mockReset().mockResolvedValue([]);
    api.estimate.mockReset().mockResolvedValue({} as never);
    api.previewAudience.mockReset().mockResolvedValue({ total: 3 } as never);
  });
  afterEach(() => vi.useRealTimers());

  it('permissions: manager writes / runs / exports; agent and viewer none; impersonators none', () => {
    const useAll = () => [useCanWriteCampaigns(), useCanRunCampaigns(), useCanExportCampaigns()];
    signInAs('manager');
    expect(renderHook(useAll, { wrapper }).result.current).toEqual([true, true, true]);
    signInAs('agent');
    expect(renderHook(useAll, { wrapper }).result.current).toEqual([false, false, false]);
    signInAs('viewer');
    expect(renderHook(useAll, { wrapper }).result.current).toEqual([false, false, false]);
    signInAs('owner', {
      impersonation: { impersonatorId: 'sa', expiresAt: '2026-10-08T01:00:00Z' },
    });
    expect(renderHook(useAll, { wrapper }).result.current).toEqual([false, false, false]);
  });

  it('pages lists and contacts with the cursor; runs / estimate load; idle without an id', async () => {
    signInAs('owner');
    const list = renderHook(() => useCampaigns({ status: ['running'] }), { wrapper });
    await waitFor(() => expect(list.result.current.data?.pages).toHaveLength(1));
    await act(() => list.result.current.fetchNextPage());
    expect(api.list).toHaveBeenLastCalledWith({ status: ['running'], cursor: 'n1' });
    await waitFor(() => expect(list.result.current.hasNextPage).toBe(false));
    const contacts = renderHook(() => useCampaignContacts('cp1', { q: 'asha' }), { wrapper });
    await waitFor(() => expect(contacts.result.current.isSuccess).toBe(true));
    expect(api.contacts).toHaveBeenCalledWith('cp1', { q: 'asha' });
    const more = renderHook(() => [useCampaignRuns('cp1'), useCampaignEstimate('cp1')], {
      wrapper,
    });
    await waitFor(() => expect(more.result.current.every((q) => q.isSuccess)).toBe(true));
    const idle = renderHook(
      () => [useCampaign(''), useCampaignRuns('cp1', false), useCampaignEstimate('', true)],
      { wrapper },
    );
    expect(idle.result.current.every((q) => q.fetchStatus === 'idle')).toBe(true);
  });

  it('polls the detail every 5 s while active, not once it is final', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    signInAs('owner');
    const detail = renderHook(() => useCampaign('cp1'), { wrapper });
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    const first = api.get.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(CAMPAIGN_POLL_MS * 2 + 50));
    expect(api.get.mock.calls.length).toBeGreaterThanOrEqual(first + 2);
    api.get.mockResolvedValue(fakeCampaign({ status: 'completed' }));
    await act(() => detail.result.current.refetch());
    // polling follows the cached data (refetchInterval reads query.state.data)
    expect(client.getQueryData<Campaign>(campaignKeys.detail('cp1'))?.status).toBe('completed');
    const final = api.get.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(CAMPAIGN_POLL_MS * 3));
    expect(api.get).toHaveBeenCalledTimes(final);
  });

  it('the audience preview waits for the edits to stop; nothing to preview = no request', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    signInAs('owner');
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] | null }) =>
        useAudiencePreview(ids ? { flowId: 'f1', audience: { listIds: ids } } : null),
      { wrapper, initialProps: { ids: null as string[] | null } },
    );
    expect(result.current.fetchStatus).toBe('idle');
    rerender({ ids: ['l1'] });
    rerender({ ids: ['l1', 'l2'] });
    await act(() => vi.advanceTimersByTimeAsync(500));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.previewAudience).toHaveBeenCalledTimes(1);
    expect(api.previewAudience).toHaveBeenCalledWith({
      flowId: 'f1',
      audience: { listIds: ['l1', 'l2'] },
    });
  });

  it('live: status refreshes lists + detail; progress patches the counters; campaign calls refresh results', async () => {
    signInAs('owner');
    const detail = renderHook(() => useCampaign('cp1'), { wrapper });
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    renderHook(() => useCampaignLiveUpdates('cp1'), { wrapper });
    expect(rt.topics).toContain('campaign:cp1');
    const spy = vi.spyOn(client, 'invalidateQueries');
    rt.emit('campaign.status', { campaignId: 'cp1', status: 'paused', pauseReason: 'manual' });
    expect(spy).toHaveBeenCalledWith({ queryKey: campaignKeys.lists });
    expect(spy).toHaveBeenCalledWith({ queryKey: campaignKeys.detail('cp1') });
    rt.emit('campaign.progress', { campaignId: 'cp1', stats: { completed: 77, calling: 1 } });
    const patched = client.getQueryData<Campaign>(campaignKeys.detail('cp1'));
    expect(patched?.stats).toMatchObject({ completed: 77, calling: 1, total: 100 });
    rt.emit('campaign.progress', { campaignId: 'other', stats: { completed: 1 } });
    expect(client.getQueryData(campaignKeys.detail('other'))).toBeUndefined();
    spy.mockClear();
    rt.emit('call.ended', {
      callId: 'c1',
      status: 'completed',
      endReason: null,
      durationSec: 1,
      disposition: null,
      costMicros: 0,
    });
    expect(spy).not.toHaveBeenCalled();
    rt.emit('call.ended', {
      callId: 'c2',
      campaignId: 'cp1',
      status: 'completed',
      endReason: 'hangup_node',
      durationSec: 9,
      disposition: 'paid',
      costMicros: 1,
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: campaignKeys.contacts('cp1') });
    // without an id: no topic
    const before = rt.topics.length;
    renderHook(() => useCampaignLiveUpdates(), { wrapper });
    expect(rt.topics).toHaveLength(before);
  });
});

describe('campaign labels and time', () => {
  it('colours, labels and the waiting text', () => {
    expect(campaignStatusColor('running')).toBe('info');
    expect(campaignStatusColor('completed')).toBe('success');
    expect(campaignStatusColor('paused')).toBe('warning');
    expect(campaignStatusColor('scheduled')).toBe('warning');
    expect(campaignStatusColor('failed')).toBe('error');
    expect(campaignStatusColor('draft')).toBe('default');
    expect(contactStatusColor('completed')).toBe('success');
    expect(contactStatusColor('failed')).toBe('error');
    expect(contactStatusColor('calling')).toBe('info');
    expect(contactStatusColor('callback_wait')).toBe('warning');
    expect(contactStatusColor('skipped')).toBe('default');
    expect(skipReasonLabel('dnd')).toBe('On the do-not-call list');
    expect(skipReasonLabel('new_reason')).toBe('new_reason');
    expect(skipReasonLabel(null)).toBeNull();
    expect(dispositionLabel('promise_to_pay')).toBe('Promise to pay');
    expect(waitingText('2026-10-24T03:30:00.000Z', IST)).toBe(
      'Waiting for the calling window — calls resume Sat 09:00',
    );
  });

  it('datetime-local ↔ ISO in the account timezone; windows intersect', () => {
    expect(toLocalInput('2026-10-24T03:30:00.000Z', IST)).toBe('2026-10-24T09:00');
    expect(toLocalInput(null, IST)).toBe('');
    expect(fromLocalInput('2026-10-24T09:00', IST)).toBe('2026-10-24T03:30:00.000Z');
    expect(fromLocalInput('24/10/2026', IST)).toBeNull();
    expect(formatInZone('2026-10-24T03:30:00.000Z', IST)).toBe('Sat 24 Oct, 09:00');
    const w: CampaignWindow = { start: '08:00', end: '20:00', days: [0, 1, 2] };
    expect(intersectWindows(w, { start: '09:00', end: '19:00', days: [1, 2, 3] })).toEqual({
      start: '09:00',
      end: '19:00',
      days: [1, 2],
    });
    expect(intersectWindows(w, { start: '09:00', end: '21:00' })).toEqual({
      start: '09:00',
      end: '20:00',
      days: [0, 1, 2],
    });
    expect(intersectWindows(w, { start: '09:00', end: '19:00', days: [5] })).toBeNull();
    expect(intersectWindows(w, { start: '21:00', end: '22:00' })).toBeNull();
  });
});

describe('campaign fields', () => {
  it('calling window: edits days / times, flags errors, shows the effective window', () => {
    const Harness = ({ bound }: { bound?: boolean }) => {
      const [value, setValue] = useState<CampaignWindow>({
        start: '08:00',
        end: '20:00',
        days: [1, 2],
      });
      return (
        <CallingWindowField
          value={value}
          onChange={setValue}
          accountWindow={{ start: '09:00', end: '19:00', days: [1, 2, 3, 4, 5, 6] }}
          {...(bound ? { bound: { start: '09:00', end: '18:00', label: 'TRAI hours' } } : {})}
        />
      );
    };
    const { unmount } = render(<Harness />);
    expect(
      screen.getByText(/Calls go out 09:00–19:00, Mon, Tue \(narrowed by the account window\)/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Wed' }));
    expect(screen.getByText(/Mon, Tue, Wed/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '07:00' } });
    expect(screen.getByText('Must be after the start')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '08:30' } });
    expect(screen.getByText(/does not overlap the account window/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '19:00' } });
    expect(screen.getByText(/Calls go out 09:00–19:00, Mon, Tue, Wed\.$/)).toBeInTheDocument();
    for (const d of ['Mon', 'Tue', 'Wed']) fireEvent.click(screen.getByRole('button', { name: d }));
    expect(screen.getByText('Pick at least one day')).toBeInTheDocument();
    unmount();
    render(<Harness bound />);
    expect(screen.getByText(/09:00–18:00.*and TRAI hours/)).toBeInTheDocument();
  });

  it('schedule: now / later / repeat daily or weekly, until, end, problems', () => {
    const now = new Date('2026-10-21T04:00:00.000Z');
    let latest: ScheduleValue = { startAt: null, endAt: null, recurrence: null };
    const Harness = () => {
      const [value, setValue] = useState<ScheduleValue>(latest);
      return (
        <ScheduleField
          value={value}
          now={now}
          timezone={IST}
          onChange={(v) => {
            latest = v;
            setValue(v);
          }}
        />
      );
    };
    render(<Harness />);
    fireEvent.click(screen.getByLabelText('Later'));
    expect(latest.startAt).toBe('2026-10-21T05:00:00.000Z');
    fireEvent.change(screen.getByLabelText('Start at (Asia/Kolkata)'), {
      target: { value: '2026-10-21T08:00' },
    });
    expect(latest.startAt).toBe('2026-10-21T02:30:00.000Z');
    expect(screen.getByText('The start must be in the future')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('End (optional, Asia/Kolkata)'), {
      target: { value: '2026-10-20T08:00' },
    });
    expect(screen.getByText('The end must be after the start')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Repeat'));
    expect(latest.recurrence).toEqual({ freq: 'daily', days: [], time: '10:00', until: null });
    fireEvent.click(screen.getByLabelText('Weekly'));
    expect(screen.getByText('Pick at least one day for a weekly campaign')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fri' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mon' }));
    expect(latest.recurrence?.days).toEqual([1, 5]);
    fireEvent.change(screen.getByLabelText('At (Asia/Kolkata)'), { target: { value: '11:15' } });
    fireEvent.change(screen.getByLabelText('Until (optional, Asia/Kolkata)'), {
      target: { value: '2026-10-01T00:00' },
    });
    expect(screen.getByText('"Until" must be in the future')).toBeInTheDocument();
    expect(latest.recurrence?.time).toBe('11:15');
    fireEvent.click(screen.getByLabelText('Start now'));
    expect(latest).toMatchObject({ startAt: null, recurrence: null });
    expect(scheduleMode({ startAt: null, recurrence: null })).toBe('now');
    expect(scheduleProblems({ startAt: null, endAt: '2026-10-22T00:00:00.000Z' }, now)).toEqual([]);
  });

  it('outcome mix and scenario weights: percent in, basis points out, remainder shown', () => {
    let mix: Record<DryRunOutcome, number> = {
      answered: 6500,
      no_answer: 2000,
      busy: 1000,
      failed: 300,
      invalid_number: 200,
    };
    let scenarios: Record<ScenarioKey, number> = {
      paid: 30,
      promise: 25,
      refuse: 10,
      callback: 10,
      silence: 10,
      wrong_number: 5,
      hangup_early: 5,
      wrong_keys: 5,
    };
    const Harness = () => {
      const [m, setM] = useState(mix);
      const [s, setS] = useState(scenarios);
      return (
        <>
          <OutcomeMixField
            value={m}
            onChange={(v) => {
              mix = v;
              setM(v);
            }}
          />
          <ScenarioWeightsField
            value={s}
            onChange={(v) => {
              scenarios = v;
              setS(v);
            }}
          />
        </>
      );
    };
    render(<Harness />);
    expect(screen.getAllByText('Adds up to 100 %')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Answered'), { target: { value: '60.5' } });
    expect(mix.answered).toBe(6050);
    expect(screen.getByText('4.5 % left to give')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Already paid'), { target: { value: '150' } });
    expect(scenarios.paid).toBe(100);
    expect(screen.getByText('70 % too much')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Already paid'), { target: { value: 'x' } });
    expect(scenarios.paid).toBe(0);
    expect(remainder({ a: 50, b: 50 })).toBe(0);
  });
});
