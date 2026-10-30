import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/services/api/errors';
import { insightsApi } from '@/services/api/insights';
import type { CallInsights, CallInsightVersion, ChatSummary } from '@/services/api/types';
import { signInAs } from '@/test/auth';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';

import { ChatSummaryDrawer } from './ChatSummaryDrawer';
import { InsightsCard } from './InsightsCard';
import { InsightsSettingsTab } from './InsightsSettingsTab';
import { keyFromLabel, reasonText } from './labels';
import { outcomeLabel } from './queries';

vi.mock('@/services/api/insights', () => ({
  insightsApi: {
    get: vi.fn(),
    regenerate: vi.fn(),
    setDisposition: vi.fn(),
    settings: vi.fn(),
    updateSettings: vi.fn(),
    dispositions: vi.fn(),
    updateDispositions: vi.fn(),
    chatSummaries: vi.fn(),
    requestChatSummary: vi.fn(),
  },
}));
const api = vi.mocked(insightsApi);
const apiError = (code: string, message: string, status: number) =>
  new ApiError({ status, code, message, kind: 'http', details: [] });

const OUTCOMES = [
  { key: 'promise_to_pay', label: 'Promise to pay', active: true },
  { key: 'callback', label: 'Callback requested', active: true },
  { key: 'dispute', label: 'Dispute', active: false },
];

const version = (over: Partial<CallInsightVersion> = {}): CallInsightVersion => ({
  version: 1,
  status: 'done',
  reason: null,
  output: {
    summary: 'Customer will pay ₹5,000 tomorrow.',
    suggestedDisposition: 'promise_to_pay',
    sentiment: { label: 'positive', score: 0.5 },
    keyInfo: {
      promiseDate: '2026-10-28',
      promiseAmountMicros: 5_000_000_000,
      callbackAt: '2026-10-28T04:30:00.000Z',
      disputeReason: 'Says the EMI was already paid',
      wrongNumber: true,
      languagePreference: 'Hinglish',
      notes: 'Prefers evenings',
    },
    confidence: { disposition: 0.9, promise: 0.4, sentiment: 0.7 },
  },
  model: 'gpt-4.1-mini',
  costMicros: 12_000,
  createdBy: null,
  createdAt: '2026-10-27T10:00:00.000Z',
  ...over,
});

/** The generated type of a nullable `$ref` is an intersection — build it with these. */
const asLatest = (v: CallInsightVersion): CallInsights['latest'] => v as CallInsights['latest'];
const NO_LATEST = null as unknown as CallInsights['latest'];

const view = (over: Partial<CallInsights> = {}): CallInsights => ({
  callId: 'c1',
  status: 'done',
  reason: null,
  disposition: 'promise_to_pay',
  dispositionSource: 'ai',
  latest: asLatest(version()),
  history: [version()],
  canRegenerate: true,
  ...over,
});

const card = (props: { answered?: boolean; live?: boolean } = {}, realtime = fakeRealtime()) => {
  renderWithProviders({
    routes: [
      {
        path: '/',
        element: (
          <InsightsCard
            callId="c1"
            answered={props.answered ?? true}
            live={props.live ?? false}
            timezone="Asia/Kolkata"
          />
        ),
      },
    ],
    realtime: realtime.client,
  });
  return realtime;
};

beforeEach(() => {
  vi.clearAllMocks();
  api.dispositions.mockResolvedValue({ dispositions: OUTCOMES });
});

describe('labels', () => {
  it('reasons, outcome labels, keys from labels', () => {
    expect(reasonText('too_short')).toBe('The call was too short to review.');
    expect(reasonText('made_up_reason')).toBe('made up reason');
    expect(reasonText(null)).toBe('No reason given.');
    expect(outcomeLabel('callback', OUTCOMES)).toBe('Callback requested');
    expect(outcomeLabel('promise_to_pay', undefined)).toBeTruthy();
    expect(outcomeLabel('custom_key', [])).toBe('custom_key');
    expect(outcomeLabel(null, OUTCOMES)).toBeNull();
    expect(keyFromLabel('Paid in full!', [])).toBe('paid_in_full');
    expect(keyFromLabel('Paid in full', ['paid_in_full', 'paid_in_full_2'])).toBe('paid_in_full_3');
    expect(keyFromLabel('!!!', [])).toBe('outcome');
  });
});

describe('InsightsCard', () => {
  it('done: summary, mood, AI facts (unsure promise), outcome source, version line; subscribes when the call is over', async () => {
    signInAs('owner');
    api.get.mockResolvedValue(view());
    const rt = card();
    expect(await screen.findByText('Customer will pay ₹5,000 tomorrow.')).toBeVisible();
    expect(screen.getByText('Customer: Positive')).toBeVisible();
    expect(screen.getByText('Wrong number')).toBeVisible();
    expect(screen.getByText('AI — unsure')).toBeVisible();
    expect(screen.getAllByText('AI').length).toBe(4);
    expect(screen.getByText(/2026-10-28 · ₹5,000/)).toBeVisible();
    expect(screen.getByText('Says the EMI was already paid')).toBeVisible();
    expect(screen.getByText('Hinglish')).toBeVisible();
    expect(screen.getByText('Prefers evenings')).toBeVisible();
    expect(screen.getByText('Suggested by AI')).toBeVisible();
    expect(screen.getByText(/Version 1 · .* · cost ₹0.01/)).toBeVisible();
    expect(rt.topics).toEqual(['call:c1']);
  });

  it('the outcome can be changed by people who can call; inactive outcomes are not offered', async () => {
    const user = userEvent.setup();
    signInAs('agent');
    api.get.mockResolvedValue(view());
    api.setDisposition.mockResolvedValue(
      view({ disposition: 'callback', dispositionSource: 'user' }),
    );
    card({ live: true });
    await user.click(await screen.findByRole('combobox', { name: 'Outcome' }));
    const options = within(screen.getByRole('listbox'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['Promise to pay', 'Promise to pay', 'Callback requested']);
    await user.click(screen.getByRole('option', { name: 'Callback requested' }));
    await waitFor(() => expect(api.setDisposition).toHaveBeenCalledWith('c1', 'callback'));
    expect(await screen.findByText('Set by a team member')).toBeVisible();
  });

  it('regenerate asks first; viewers see the outcome read-only and no regenerate', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    api.get.mockResolvedValue(view({ dispositionSource: 'flow' }));
    api.regenerate.mockResolvedValue(view({ status: 'pending', canRegenerate: false }));
    card();
    await user.click(await screen.findByRole('button', { name: 'Make again' }));
    expect(screen.getByText(/uses AI credit/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Make again' }));
    await waitFor(() => expect(api.regenerate).toHaveBeenCalledWith('c1'));
    expect(await screen.findByLabelText('Making the insights')).toBeVisible();
  });

  it('viewer: read-only outcome, no regenerate', async () => {
    signInAs('viewer');
    api.get.mockResolvedValue(view({ dispositionSource: 'flow' }));
    card();
    expect(await screen.findByText('Set by the flow')).toBeVisible();
    expect(screen.getAllByText('Promise to pay').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Make again' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Outcome' })).toBeNull();
  });

  it('not reviewed yet: insights come a minute after the call', async () => {
    signInAs('owner');
    api.get.mockResolvedValueOnce(
      view({
        status: null,
        latest: NO_LATEST,
        history: [],
        disposition: null,
        dispositionSource: null,
      }),
    );
    card();
    expect(await screen.findByText(/about a minute after the call ends/)).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Outcome' })).toHaveTextContent(
      'Choose an outcome',
    );
  });

  it('not answered / skipped / failed / history', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    api.get.mockResolvedValueOnce(
      view({
        status: null,
        latest: NO_LATEST,
        history: [],
        disposition: null,
        dispositionSource: null,
      }),
    );
    card({ answered: false });
    expect(await screen.findByText(/the call was not answered/)).toBeVisible();
    api.get.mockResolvedValueOnce(
      view({
        status: 'failed',
        reason: 'provider_error',
        latest: asLatest(
          version({ version: 2, status: 'failed', reason: 'provider_error', output: null }),
        ),
        history: [
          version({ version: 2, status: 'failed', reason: 'provider_error', output: null }),
          version({ version: 1, createdBy: { id: 'u1', name: 'Asha' } }),
        ],
      }),
    );
    card();
    expect(await screen.findByText('The AI service was not available.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Earlier versions (1)' }));
    expect(await screen.findByText(/Version 1 · Ready .* Customer will pay/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Hide earlier versions' }));
    api.get.mockResolvedValueOnce(
      view({
        status: 'skipped',
        reason: 'too_short',
        latest: asLatest(version({ status: 'skipped', reason: 'too_short', output: null })),
        history: [
          version({ status: 'skipped', reason: 'too_short', output: null }),
          version({ version: 2, status: 'skipped', reason: null, output: null }),
        ],
      }),
    );
    card();
    expect(await screen.findByText('The call was too short to review.')).toBeVisible();
  });

  it('a done version asked by a person; refresh on call.insights; error + retry', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    api.get.mockResolvedValueOnce(
      view({
        latest: asLatest(
          version({
            createdBy: { id: 'u1', name: 'Asha' },
            output: {
              ...version().output!,
              keyInfo: {
                ...version().output!.keyInfo,
                promiseAmountMicros: null,
                callbackAt: null,
                disputeReason: null,
                wrongNumber: false,
                languagePreference: null,
                notes: null,
              },
              sentiment: { label: 'negative', score: -0.5 },
            },
          }),
        ),
      }),
    );
    const rt = card();
    expect(await screen.findByText(/asked by Asha/)).toBeVisible();
    expect(screen.getByText('Customer: Negative')).toBeVisible();
    api.get.mockResolvedValueOnce(
      view({
        latest: asLatest(version({ output: { ...version().output!, summary: 'Updated summary' } })),
      }),
    );
    rt.emit('call.insights', { callId: 'other', status: 'done', version: 2 });
    rt.emit('call.insights', { callId: 'c1', status: 'done', version: 2 });
    expect(await screen.findByText('Updated summary')).toBeVisible();
    api.get.mockRejectedValueOnce(apiError('INTERNAL_ERROR', 'Something broke', 500));
    api.get.mockResolvedValueOnce(view());
    card();
    expect(await screen.findByText('Something broke')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findAllByText('Customer will pay ₹5,000 tomorrow.')).not.toHaveLength(0);
  });
});

const summary = (over: Partial<ChatSummary> = {}): ChatSummary => ({
  id: 's1',
  status: 'done',
  reason: null,
  summary: 'Customer asked for the EMI date; agent said 30 October.',
  messageCount: 3,
  costMicros: 5_000,
  createdBy: { id: 'u1', name: 'Asha' },
  createdAt: '2026-10-27T10:00:00.000Z',
  ...over,
});

const drawer = (canSummarize: boolean, realtime = fakeRealtime()) => {
  const onClose = vi.fn();
  renderWithProviders({
    routes: [
      {
        path: '/',
        element: (
          <ChatSummaryDrawer
            conversationId="v1"
            open
            onClose={onClose}
            canSummarize={canSummarize}
            timezone="Asia/Kolkata"
          />
        ),
      },
    ],
    realtime: realtime.client,
  });
  return { onClose, realtime };
};

describe('ChatSummaryDrawer', () => {
  it('lists summaries (done, on close, working, not made), summarises new messages, refreshes on events', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    api.chatSummaries.mockResolvedValueOnce([
      summary(),
      summary({
        id: 's2',
        createdBy: null,
        messageCount: 0,
        status: 'skipped',
        reason: 'empty',
        summary: null,
      }),
    ]);
    api.requestChatSummary.mockResolvedValue([
      summary({ id: 's3', status: 'pending', summary: null }),
      summary(),
    ]);
    const { onClose, realtime } = drawer(true);
    expect(await screen.findByText(/agent said 30 October/)).toBeVisible();
    expect(screen.getByText(/when the chat was closed/)).toBeVisible();
    expect(screen.getByText('Not made: There were no new messages.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Summarize new messages' }));
    expect(await screen.findByText('Working on it…')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Summarize new messages' })).toBeDisabled();
    api.chatSummaries.mockResolvedValueOnce([summary({ id: 's3', summary: 'Fresh summary' })]);
    realtime.emit('inbox.conversation.summary', { conversationId: 'other', summaryId: 'x' });
    realtime.emit('inbox.conversation.summary', { conversationId: 'v1', summaryId: 's3' });
    expect(await screen.findByText('Fresh summary')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close summary' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('read-only for people who cannot reply; empty list; load error + retry; request error', async () => {
    const user = userEvent.setup();
    signInAs('viewer');
    api.chatSummaries.mockResolvedValueOnce([]);
    drawer(false);
    expect(await screen.findByText('No summaries yet.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Summarize new messages' })).toBeNull();
    api.chatSummaries.mockRejectedValueOnce(apiError('INTERNAL_ERROR', 'Down', 500));
    api.chatSummaries.mockResolvedValueOnce([]);
    drawer(true);
    expect(await screen.findByText('Down')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    api.requestChatSummary.mockRejectedValueOnce(
      apiError('CHAT_SUMMARY_EMPTY', 'There are no new messages to summarise in this chat.', 409),
    );
    await user.click(screen.getAllByRole('button', { name: 'Summarize new messages' })[0]!);
    expect(
      await screen.findByText('There are no new messages to summarise in this chat.'),
    ).toBeVisible();
  });
});

describe('Settings → AI & outcomes', () => {
  const tab = () =>
    renderWithProviders({ routes: [{ path: '/', element: <InsightsSettingsTab /> }] });

  it('switches save one at a time; the others wait for insights to be on', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    api.settings.mockResolvedValue({
      enabled: true,
      chatSummaryOnClose: false,
      transcribeHumanCalls: false,
    });
    api.updateSettings.mockResolvedValue({
      enabled: true,
      chatSummaryOnClose: true,
      transcribeHumanCalls: false,
    });
    tab();
    await user.click(
      await screen.findByRole('switch', { name: 'Summarise chats when they are closed' }),
    );
    await waitFor(() =>
      expect(api.updateSettings).toHaveBeenCalledWith({ chatSummaryOnClose: true }),
    );
    expect(
      await screen.findByRole('switch', { name: 'Summarise chats when they are closed' }),
    ).toBeChecked();
  });

  it('with insights off, the other switches are disabled; viewers cannot edit', async () => {
    signInAs('viewer');
    api.settings.mockResolvedValue({
      enabled: false,
      chatSummaryOnClose: false,
      transcribeHumanCalls: false,
    });
    tab();
    expect(await screen.findByRole('switch', { name: 'Transcribe team calls' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'AI insights after calls' })).toBeDisabled();
    expect(await screen.findByLabelText('Outcome 1')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save outcomes' })).toBeNull();
  });

  it('outcomes: rename, turn off, reorder, add, undo, save; empty names block saving; errors', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    api.settings.mockResolvedValue({
      enabled: true,
      chatSummaryOnClose: false,
      transcribeHumanCalls: false,
    });
    api.updateDispositions.mockImplementation((list) => Promise.resolve({ dispositions: list }));
    tab();
    const first = await screen.findByLabelText('Outcome 1');
    expect(screen.getByRole('button', { name: 'Save outcomes' })).toBeDisabled();
    await user.clear(first);
    expect(screen.getByText('Give it a name')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save outcomes' })).toBeDisabled();
    await user.type(first, 'PTP');
    await user.click(screen.getAllByRole('switch', { name: 'On' })[1]!);
    await user.click(screen.getByRole('button', { name: 'Move Callback requested up' }));
    await user.type(screen.getByLabelText('New outcome'), 'Settled{Enter}');
    await user.click(screen.getByRole('button', { name: 'Move PTP down' }));
    await user.click(screen.getByRole('button', { name: 'Save outcomes' }));
    await waitFor(() =>
      expect(api.updateDispositions).toHaveBeenCalledWith([
        { key: 'callback', label: 'Callback requested', active: false },
        { key: 'dispute', label: 'Dispute', active: false },
        { key: 'promise_to_pay', label: 'PTP', active: true },
        { key: 'settled', label: 'Settled', active: true },
      ]),
    );
    await user.type(screen.getByLabelText('New outcome'), 'Temp');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Undo changes' }));
    expect(screen.queryByDisplayValue('Temp')).toBeNull();
    api.updateDispositions.mockRejectedValueOnce(apiError('VALIDATION_FAILED', 'In use', 422));
    await user.clear(screen.getByLabelText('Outcome 1'));
    await user.type(screen.getByLabelText('Outcome 1'), 'X');
    await user.click(screen.getByRole('button', { name: 'Save outcomes' }));
    expect(await screen.findByText('In use')).toBeVisible();
  });

  it('load errors', async () => {
    signInAs('owner');
    api.settings.mockRejectedValue(apiError('INTERNAL_ERROR', 'Settings down', 500));
    api.dispositions.mockRejectedValue(apiError('INTERNAL_ERROR', 'Outcomes down', 500));
    tab();
    expect(await screen.findByText('Settings down')).toBeVisible();
    expect(await screen.findByText('Outcomes down')).toBeVisible();
  });
});
