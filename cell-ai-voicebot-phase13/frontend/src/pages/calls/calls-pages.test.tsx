import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { callsApi } from '@/services/api/calls';
import { campaignsApi } from '@/services/api/campaigns';
import { ApiError } from '@/services/api/errors';
import { insightsApi } from '@/services/api/insights';
import { signInAs } from '@/test/auth';
import { fakeCall, fakeEvents, fakeTranscript } from '@/test/calls';
import { fakeCampaignListItem } from '@/test/campaigns';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/calls', () => ({
  callsApi: {
    list: vi.fn(),
    get: vi.fn(),
    transcript: vi.fn(),
    events: vi.fn(),
    recording: vi.fn(),
    hangup: vi.fn(),
    active: vi.fn(),
  },
}));

vi.mock('@/services/api/campaigns', () => ({ campaignsApi: { list: vi.fn() } }));
vi.mock('@/services/api/insights', () => ({
  insightsApi: {
    get: vi.fn(() =>
      Promise.resolve({
        callId: 'c1',
        status: null,
        reason: null,
        disposition: null,
        dispositionSource: null,
        latest: null,
        history: [],
        canRegenerate: false,
      }),
    ),
    dispositions: vi.fn(() => Promise.resolve({ dispositions: [] })),
  },
}));

const api = vi.mocked(callsApi);
const page = (data: ReturnType<typeof fakeCall>[], nextCursor: string | null = null) => ({
  success: true as const,
  data,
  meta: { hasMore: Boolean(nextCursor), nextCursor },
});

beforeEach(() => {
  vi.clearAllMocks();
  api.list.mockResolvedValue(page([]));
  vi.mocked(campaignsApi.list).mockResolvedValue({
    success: true,
    data: [fakeCampaignListItem()],
    meta: { hasMore: false, nextCursor: null },
  } as never);
  api.get.mockResolvedValue(fakeCall());
  api.transcript.mockResolvedValue(fakeTranscript());
  api.events.mockResolvedValue(fakeEvents());
  api.recording.mockResolvedValue({
    url: 'http://files.test/rec.wav?sig=1',
    expiresAt: '2026-10-15T10:05:00.000Z',
    durationSec: 26,
  });
});

describe('/calls list', () => {
  it('rows with source, test badge, contact, status, result and cost; load more; open a call', async () => {
    const user = userEvent.setup();
    signInAs('agent');
    api.list
      .mockResolvedValueOnce(
        page(
          [
            fakeCall(),
            fakeCall({
              id: 'c2',
              source: {
                kind: 'agent',
                flowId: null,
                flowVersionRef: null,
                agentId: 'a1',
                name: null,
              },
              contact: null,
              status: 'failed',
              endReason: 'ai_failed',
              disposition: null,
              isTest: false,
            }),
          ],
          'n1',
        ),
      )
      .mockResolvedValueOnce(
        page([
          fakeCall({
            id: 'c3',
            source: {
              kind: 'flow',
              flowId: 'f1',
              flowVersionRef: 'draft',
              agentId: null,
              name: null,
            },
          }),
        ]),
      );
    renderWithProviders({ route: '/calls' });
    const table = await screen.findByRole('table', { name: 'Calls' });
    expect(await within(table).findByText('Loan recovery · v1')).toBeInTheDocument();
    expect(within(table).getAllByText('Test')).toHaveLength(1);
    expect(within(table).getByText('Asha Verma')).toBeInTheDocument();
    expect(within(table).getByText('Deleted agent (agent)')).toBeInTheDocument();
    expect(within(table).getByText('Typed values')).toBeInTheDocument();
    expect(within(table).getByText('Paid')).toBeInTheDocument();
    expect(within(table).getByText('AI unavailable')).toBeInTheDocument();
    expect(within(table).getAllByText('₹0.90')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'New test call' })).toHaveAttribute(
      'href',
      '/calls/test',
    );
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await within(table).findByText('Deleted flow · draft')).toBeInTheDocument();
    expect(api.list).toHaveBeenLastCalledWith({ limit: 25, cursor: 'n1' });
    await user.click(within(table).getAllByRole('link')[0] as HTMLElement);
    expect(await screen.findByRole('region', { name: 'Summary' })).toBeInTheDocument();
  });

  it('filters come from the URL and go back to it; empty states; viewers get no start button', async () => {
    const user = userEvent.setup();
    signInAs('viewer');
    renderWithProviders({
      route: '/calls?status=completed,bogus&test=1&from=2026-10-01&to=2026-10-05&q=asha&flowId=f1',
    });
    expect(await screen.findByText('Nothing matches these filters')).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledWith({
      limit: 25,
      status: ['completed'],
      isTest: true,
      q: 'asha',
      flowId: 'f1',
      from: '2026-09-30T18:30:00.000Z',
      to: '2026-10-05T18:30:00.000Z',
    });
    expect(screen.queryByRole('link', { name: 'New test call' })).not.toBeInTheDocument();
    expect(screen.getByText(/calls of one flow/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show all' }));
    await waitFor(() => expect(screen.queryByText(/calls of one flow/)).not.toBeInTheDocument());
    await user.click(screen.getByRole('switch', { name: 'Test calls only' }));
    await user.clear(screen.getByRole('textbox', { name: 'Contact name' }));
    await user.type(screen.getByRole('textbox', { name: 'Contact name' }), 'ravi');
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'ravi' })),
    );
    expect(api.list).toHaveBeenLastCalledWith(expect.not.objectContaining({ isTest: true }));
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-01' } });
    expect(await screen.findByText('Must be after From')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('No calls yet')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Contact name' })).toHaveValue('');
  });

  it('record filters (outcome, mood, promise) come from the URL; results show outcome labels and chips', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    vi.mocked(insightsApi.dispositions).mockResolvedValue({
      dispositions: [
        { key: 'promise_to_pay', label: 'PTP', active: true },
        { key: 'callback', label: 'Call back', active: true },
      ],
    });
    api.list.mockResolvedValue(
      page([
        fakeCall({
          disposition: 'promise_to_pay',
          insights: {
            status: 'done',
            reason: null,
            sentiment: 'negative',
            hasPromise: true,
            promiseAmountMicros: 1_000_000,
            hasSummary: true,
          },
        }),
        fakeCall({
          id: 'c2',
          disposition: null,
          endReason: 'no_answer',
          insights: {
            status: 'done',
            reason: null,
            sentiment: 'neutral',
            hasPromise: false,
            promiseAmountMicros: null,
            hasSummary: true,
          },
        }),
      ]),
    );
    renderWithProviders({
      route: '/calls?disposition=promise_to_pay,Bad!&sentiment=negative&promise=1',
    });
    const table = await screen.findByRole('table', { name: 'Calls' });
    expect(await within(table).findByText('PTP')).toBeInTheDocument();
    expect(within(table).getByText('Promise')).toBeInTheDocument();
    expect(within(table).getByText('Negative')).toBeInTheDocument();
    expect(within(table).queryByText('Neutral')).not.toBeInTheDocument();
    expect(api.list).toHaveBeenCalledWith({
      limit: 25,
      disposition: ['promise_to_pay'],
      sentiment: 'negative',
      hasPromise: true,
    });
    expect(screen.getByRole('combobox', { name: 'Outcome' })).toHaveTextContent('PTP');
    await user.click(screen.getByRole('combobox', { name: 'Outcome' }));
    await user.click(await screen.findByRole('option', { name: 'Call back' }));
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ disposition: ['promise_to_pay', 'callback'] }),
      ),
    );
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('combobox', { name: 'Customer mood' }));
    await user.click(await screen.findByRole('option', { name: 'Any' }));
    await user.click(screen.getByRole('switch', { name: 'Promise to pay' }));
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ hasPromise: true, sentiment: 'negative' }),
      ),
    );
  });

  it('the status filter (multi select) and live updates', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    const rt = fakeRealtime();
    renderWithProviders({ route: '/calls', realtime: rt.client });
    await screen.findByText('No calls yet');
    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(await screen.findByRole('option', { name: 'Failed' }));
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: ['failed'] })),
    );
    const before = api.list.mock.calls.length;
    rt.emit('call.created', { callId: 'c9', isTest: true });
    await waitFor(() => expect(api.list.mock.calls.length).toBeGreaterThan(before));
  });
});

describe('/calls campaign entry points', () => {
  it('Simulated badge + campaign link; line, campaign and contact filters from the URL', async () => {
    const user = userEvent.setup();
    signInAs('viewer');
    api.list.mockResolvedValue(
      page([
        fakeCall({
          provider: 'dryrun',
          campaign: { id: 'cp1', name: 'October recovery', attempt: 2 },
        }),
      ]),
    );
    renderWithProviders({ route: '/calls?contactId=k1' });
    const table = await screen.findByRole('table', { name: 'Calls' });
    expect(await within(table).findByText('Simulated')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'October recovery' })).toHaveAttribute(
      'href',
      '/campaigns/cp1',
    );
    expect(screen.getByText(/Showing the calls of one contact/)).toBeInTheDocument();
    expect(api.list).toHaveBeenLastCalledWith({ limit: 25, contactId: 'k1' });
    await user.click(screen.getByLabelText('Line'));
    await user.click(screen.getByRole('option', { name: 'Simulated' }));
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith({ limit: 25, contactId: 'k1', provider: 'dryrun' }),
    );
    await user.click(screen.getByLabelText('Campaign'));
    await user.click(await screen.findByRole('option', { name: 'October recovery' }));
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith({
        limit: 25,
        contactId: 'k1',
        campaignId: 'cp1',
        provider: 'dryrun',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Show all' }));
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith({
        limit: 25,
        campaignId: 'cp1',
        provider: 'dryrun',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ limit: 25 }));
  });

  it('call detail: "Campaign X · attempt N" links to the campaign', async () => {
    signInAs('viewer');
    api.get.mockResolvedValue(
      fakeCall({ campaign: { id: 'cp1', name: 'October recovery', attempt: 2 } }),
    );
    renderWithProviders({ route: '/calls/c1' });
    expect(
      await screen.findByRole('link', { name: 'October recovery · attempt 2' }),
    ).toHaveAttribute('href', '/campaigns/cp1');
  });

  it('simulated (dry-run) calls say so instead of "Web test call"', async () => {
    signInAs('viewer');
    api.get.mockResolvedValue(fakeCall({ provider: 'dryrun', isTest: true }));
    renderWithProviders({ route: '/calls/c1' });
    expect(await screen.findByText('Simulated call')).toBeInTheDocument();
    expect(screen.queryByText('Web test call')).not.toBeInTheDocument();
  });
});

describe('/calls/:id detail', () => {
  it('a transcribed team call: "Team member" lines from the recording; the AI insights card', async () => {
    signInAs('viewer');
    api.get.mockResolvedValue(fakeCall({ provider: 'whatsapp', mode: 'human' }));
    api.transcript.mockResolvedValue([
      {
        seq: 1,
        speaker: 'customer',
        text: 'Hello ji',
        language: null,
        startMs: 500,
        endMs: 1500,
        interrupted: false,
        source: 'stt',
      },
      {
        seq: 2,
        speaker: 'agent',
        text: 'Namaste',
        language: null,
        startMs: 2000,
        endMs: 3000,
        interrupted: false,
        source: 'stt',
      },
    ]);
    renderWithProviders({ route: '/calls/c1' });
    const transcript = await screen.findByRole('region', { name: 'Transcript' });
    expect(await within(transcript).findByText('Team member')).toBeInTheDocument();
    expect(within(transcript).getAllByText('from the recording')).toHaveLength(2);
    expect(await screen.findByRole('region', { name: 'AI insights' })).toBeInTheDocument();
  });

  it('summary, outcome, cost, quality, timeline and transcript; recording on demand with seek', async () => {
    const user = userEvent.setup();
    signInAs('agent');
    api.get.mockResolvedValue(
      fakeCall({
        outcome: {
          disposition: 'promise_to_pay',
          promiseToPay: { date: '2026-10-16', amountMicros: 2_500_000_000 },
          callback: { date: '2026-10-17', time: '11:00' },
          transfer: { result: 'no_answer' },
          messages: [{ channel: 'sms' }],
        },
        disposition: 'promise_to_pay',
        error: { code: 'engine_error' },
      }),
    );
    renderWithProviders({ route: '/calls/c1' });
    const summary = await screen.findByRole('region', { name: 'Summary' });
    expect(within(summary).getByRole('link', { name: 'Loan recovery · v1' })).toHaveAttribute(
      'href',
      '/flows/f1/versions',
    );
    expect(within(summary).getByRole('link', { name: 'Asha Verma' })).toHaveAttribute(
      'href',
      '/contacts/c/k1',
    );
    expect(within(summary).getByText('Web test call')).toBeInTheDocument();
    expect(within(summary).getByText('Flow finished')).toBeInTheDocument();
    expect(within(summary).getByText('Hindi / Hinglish')).toBeInTheDocument();
    expect(within(summary).getByText('engine error')).toBeInTheDocument();
    expect(within(summary).getByText('Result: Promise to pay')).toBeInTheDocument();
    expect(
      within(summary).getByText('Promise to pay on 2026-10-16 (₹2,500.00)'),
    ).toBeInTheDocument();
    expect(within(summary).getByText('Callback on 2026-10-17 at 11:00')).toBeInTheDocument();
    expect(within(summary).getByText('Transfer: no answer')).toBeInTheDocument();
    expect(within(summary).getByText('1 message queued (sent from Phase 10)')).toBeInTheDocument();
    const cost = screen.getByRole('region', { name: 'Cost' });
    expect(within(cost).getByText('Cost ₹0.90')).toBeInTheDocument();
    expect(within(cost).getByText('None (web test call)')).toBeInTheDocument();
    const quality = screen.getByRole('region', { name: 'Quality' });
    expect(
      within(quality).getByText('median 820 ms · p95 1400 ms · max 1600 ms'),
    ).toBeInTheDocument();
    const timeline = screen.getByRole('region', { name: 'Timeline' });
    expect(await within(timeline).findByText('Bot answered in 820 ms')).toBeInTheDocument();
    const transcript = screen.getByRole('region', { name: 'Transcript' });
    expect(await within(transcript).findByText('Dhanyavaad, namaste.')).toBeInTheDocument();
    expect(within(transcript).getByText('interrupted')).toBeInTheDocument();

    await user.click(within(transcript).getByRole('button', { name: 'Play from 00:09' })); // no audio yet: nothing
    await user.click(screen.getByRole('button', { name: 'Load recording' }));
    const player = await screen.findByLabelText('Call recording');
    expect(player).toHaveAttribute('src', 'http://files.test/rec.wav?sig=1');
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    await user.click(within(transcript).getByRole('button', { name: 'Play from 00:09' }));
    expect((player as HTMLAudioElement).currentTime).toBe(9);
    expect(play).toHaveBeenCalled();
    // the link expired: one fresh link, then give up
    fireEvent.error(player);
    await waitFor(() => expect(api.recording).toHaveBeenCalledTimes(2));
    fireEvent.error(screen.getByLabelText('Call recording'));
    expect(await screen.findByText('The recording could not be played.')).toBeInTheDocument();
    play.mockRestore();
  });

  it('a recording deleted by the retention setting: no player, a note, the transcript stays', async () => {
    signInAs('owner');
    api.get.mockResolvedValue(
      fakeCall({
        recording: { durationSec: 26, sizeBytes: 793_004, deletedAt: '2026-10-20T01:00:00.000Z' },
      }),
    );
    renderWithProviders({ route: '/calls/c1' });
    expect(await screen.findByText(/The recording was deleted on/)).toBeInTheDocument();
    expect(screen.getByText(/data retention setting/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load recording' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Transcript' })).toBeInTheDocument();
  });

  it('viewers see no player; recording link errors show; agent source and typed values', async () => {
    const user = userEvent.setup();
    signInAs('viewer');
    const first = renderWithProviders({ route: '/calls/c1' });
    expect(
      await screen.findByText("You can't play recordings with your role."),
    ).toBeInTheDocument();
    first.unmount();
    signInAs('agent');
    api.get.mockResolvedValue(
      fakeCall({
        source: {
          kind: 'agent',
          flowId: null,
          flowVersionRef: null,
          agentId: 'a1',
          name: 'Recovery Bot',
        },
        contact: null,
        outcome: {},
        disposition: null,
        languageDetected: 'en',
        isTest: false,
        cost: {
          telephonyMicros: 2_000_000,
          aiMicros: 0,
          ttsMicros: 0,
          commissionMicros: 0,
          totalMicros: 2_000_000,
        },
        metrics: {
          ...fakeCall().metrics,
          latency: { p50Ms: null, p95Ms: null, maxMs: null, samples: 0 },
        },
      }),
    );
    api.recording.mockRejectedValueOnce(
      new ApiError({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'This call has no recording',
        kind: 'http',
      }),
    );
    renderWithProviders({ route: '/calls/c1' });
    const summary = await screen.findByRole('region', { name: 'Summary' });
    expect(within(summary).getByRole('link', { name: 'Recovery Bot (agent)' })).toHaveAttribute(
      'href',
      '/agents/a1',
    );
    expect(within(summary).getByText('Typed values')).toBeInTheDocument();
    expect(within(summary).getByText('English')).toBeInTheDocument();
    expect(within(summary).getByText('No outcome recorded.')).toBeInTheDocument();
    expect(screen.getByText('₹2.00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load recording' }));
    expect(await screen.findByText('This call has no recording')).toBeInTheDocument();
  });

  it('a live call: hang up from here, live transcript refresh; load errors retry', async () => {
    const user = userEvent.setup();
    signInAs('agent');
    const rt = fakeRealtime();
    api.get.mockResolvedValue(
      fakeCall({
        status: 'in_progress',
        endReason: null,
        recording: null,
        source: {
          kind: 'flow',
          flowId: 'f1',
          flowVersionRef: 'draft',
          agentId: null,
          name: 'Loan recovery',
        },
      }),
    );
    api.hangup.mockResolvedValueOnce(
      fakeCall({ status: 'completed', endReason: 'customer_hangup' }),
    );
    renderWithProviders({ route: '/calls/c1', realtime: rt.client });
    expect(
      await screen.findByRole('link', { name: 'Loan recovery · saved draft' }),
    ).toHaveAttribute('href', '/flows/f1');
    expect(rt.topics).toEqual(['call:c1']); // a live call: its topic is subscribed
    const before = api.transcript.mock.calls.length;
    rt.emit('call.transcript', { callId: 'c1', seq: 9, speaker: 'bot', text: 'x', final: true });
    rt.emit('call.transcript', { callId: 'other', seq: 9, speaker: 'bot', text: 'x', final: true });
    await waitFor(() => expect(api.transcript.mock.calls.length).toBe(before + 1));
    await user.click(screen.getByRole('button', { name: 'Hang up' }));
    expect(await screen.findByText('Call hung up')).toBeInTheDocument();
    expect(await screen.findByText('Customer hung up')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hang up' })).not.toBeInTheDocument();
  });

  it('a failed hang up and a failed load', async () => {
    const user = userEvent.setup();
    signInAs('agent');
    api.get.mockResolvedValue(fakeCall({ status: 'in_progress', endReason: null }));
    api.hangup.mockRejectedValueOnce(
      new ApiError({
        status: 409,
        code: 'CALL_NOT_ACTIVE',
        message: 'This call is not running on this server.',
        kind: 'http',
      }),
    );
    const first = renderWithProviders({ route: '/calls/c1' });
    await user.click(await screen.findByRole('button', { name: 'Hang up' }));
    expect(await screen.findByText('This call is not running on this server.')).toBeInTheDocument();
    first.unmount();
    api.get.mockRejectedValueOnce(
      new ApiError({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Call not found',
        kind: 'http',
      }),
    );
    renderWithProviders({ route: '/calls/zz' });
    expect(await screen.findByText('Call not found')).toBeInTheDocument();
    api.get.mockResolvedValueOnce(fakeCall());
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('region', { name: 'Summary' })).toBeInTheDocument();
    act(() => undefined);
  });
});
