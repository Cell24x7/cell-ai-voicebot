import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CallTesterPage } from '@/pages/calls/CallTesterPage';
import { agentsApi } from '@/services/api/agents';
import { callsApi } from '@/services/api/calls';
import { contactsApi } from '@/services/api/contacts';
import { ApiError } from '@/services/api/errors';
import { flowsApi } from '@/services/api/flows';
import type { StartedWebCall } from '@/services/api/types';
import { fakeAgent, fakeAgentRow } from '@/test/agents';
import { signInAs } from '@/test/auth';
import { fakeAudioEngine, fakeCall, FakeMediaWs } from '@/test/calls';
import { fakeFlowRow, KNOWN_VARIABLES } from '@/test/flows';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';

import { MicError } from '../audio/engine';

import type { WebCallDeps } from './useWebCall';

vi.mock('@/services/api/flows', () => ({ flowsApi: { list: vi.fn(), variables: vi.fn() } }));
vi.mock('@/services/api/agents', () => ({ agentsApi: { list: vi.fn(), get: vi.fn() } }));
vi.mock('@/services/api/contacts', () => ({ contactsApi: { list: vi.fn() } }));
vi.mock('@/services/api/calls', () => ({ callsApi: { get: vi.fn() } }));

const STARTED = (overrides: Partial<StartedWebCall> = {}): StartedWebCall => ({
  call: fakeCall({ status: 'queued', endReason: null }),
  mediaTicket: 'wst_ticket',
  expiresAt: '2026-10-15T10:01:00.000Z',
  wsPath: '/ws/media',
  textInput: true,
  voice: 'fake',
  ...overrides,
});

const make = (overrides: Partial<WebCallDeps> = {}) => {
  const audio = fakeAudioEngine();
  const stop = vi.fn();
  const deps: WebCallDeps = {
    startWeb: vi.fn(() => Promise.resolve(STARTED())),
    requestMic: vi.fn(() =>
      Promise.resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream),
    ),
    createEngine: vi.fn(() => Promise.resolve(audio.engine)),
    socketFactory: (url) => new FakeMediaWs(url),
    mediaUrl: (ticket, path) => `ws://test${path}?ticket=${ticket}`,
    now: () => Date.now(),
    ...overrides,
  };
  return { deps, audio, stop };
};

const page = (
  deps: WebCallDeps,
  route = '/calls/test?flowId=f1&version=draft',
  realtime?: ReturnType<typeof fakeRealtime>['client'],
) =>
  renderWithProviders({
    route,
    ...(realtime ? { realtime } : {}),
    routes: [
      {
        path: '/calls/test',
        element: (
          <>
            <Link to="/elsewhere">Go elsewhere</Link>
            <CallTesterPage deps={deps} />
          </>
        ),
      },
      { path: '/calls/:id', element: <div>Detail page</div> },
      { path: '/elsewhere', element: <div>Elsewhere page</div> },
    ],
  });

const server = (event: unknown) => act(() => FakeMediaWs.last().serverSend(event));
const status = (s: string, seq: number) =>
  server({ type: 'call.event', event: { type: 'status', data: { status: s }, seq } });

beforeEach(() => {
  FakeMediaWs.instances = [];
  signInAs('agent');
  vi.mocked(flowsApi.list).mockResolvedValue({
    success: true,
    data: [
      fakeFlowRow(),
      fakeFlowRow({ id: 'f2', name: 'Draft only', publishedVersion: null, status: 'draft' }),
    ],
    meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
  });
  vi.mocked(flowsApi.variables).mockResolvedValue(KNOWN_VARIABLES);
  vi.mocked(agentsApi.list).mockResolvedValue({
    success: true,
    data: [fakeAgentRow()],
    meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
  });
  vi.mocked(agentsApi.get).mockResolvedValue(
    fakeAgent({ allowedVariables: ['name', 'phone_last4'] }),
  );
  vi.mocked(contactsApi.list).mockResolvedValue({
    success: true,
    data: [
      {
        id: 'k1',
        name: 'Asha Verma',
        phoneE164: '+919000400012',
      } as never,
    ],
    meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
  } as never);
  vi.mocked(callsApi.get).mockResolvedValue(fakeCall());
});
afterEach(() => vi.useRealTimers());

describe('Web call tester', () => {
  it('prefilled flow + draft, typed values: a whole call — ringing, in call, transcript, keys, words, transfer, end, result', async () => {
    const user = userEvent.setup();
    const { deps, audio } = make();
    page(deps);
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Flow' })).toHaveValue('Loan recovery'),
    );
    await user.type(await screen.findByRole('textbox', { name: '{{name}}' }), 'Asha');
    await user.type(await screen.findByRole('textbox', { name: '{{amount}}' }), '2500');
    await user.type(
      screen.getByRole('textbox', { name: 'Test phone (optional)' }),
      '+91 90004-00012',
    );
    await user.click(screen.getByRole('button', { name: 'Start call' }));
    await waitFor(() => expect(FakeMediaWs.instances).toHaveLength(1));
    expect(deps.startWeb).toHaveBeenCalledWith({
      flowId: 'f1',
      version: 'draft',
      variables: { name: 'Asha', amount: '2500' },
      testPhone: '+919000400012',
    });
    const ws = FakeMediaWs.last();
    expect(ws.url).toBe('ws://test/ws/media?ticket=wst_ticket');
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
    expect(screen.getByText('Fake voice (test mode)')).toBeInTheDocument();
    await act(async () => {
      ws.serverOpen();
      await Promise.resolve(); // let the hook send call.ready
    });
    expect(ws.controls()).toEqual([{ type: 'call.ready', sampleRate: 24000 }]);
    server({ type: 'call.config', textInput: true, sampleRate: 24000, frameBytes: 960 });
    status('ringing', 1);
    expect(screen.getByText('Ringing…')).toBeInTheDocument();
    status('in_progress', 2);
    expect(screen.getByText('In call')).toBeInTheDocument();
    expect(screen.getByLabelText('Call time')).toHaveTextContent('00:00');

    // audio both ways + barge-in flush
    act(() => audio.micFrame());
    expect(ws.sent.filter((d) => d instanceof ArrayBuffer)).toHaveLength(1);
    act(() => audio.micLevel(0.33));
    server(new ArrayBuffer(960));
    expect(audio.played).toHaveLength(1);
    server({ type: 'audio.clear' });
    server({ type: 'call.hold', on: true });
    server({ type: 'wallet.empty_warning', endsInSec: 30 });
    expect(audio.calls.clear).toBe(1);

    // transcript: partial → final, interrupted mark, latency chip, timeline
    server({ type: 'call.transcript', seq: 1, speaker: 'bot', text: 'Namaste Asha', final: false });
    const transcript = screen.getByRole('list', { name: 'Live transcript' });
    expect(within(transcript).getByText('Namaste Asha').closest('li')).toHaveAttribute(
      'data-final',
      'false',
    );
    server({
      type: 'call.transcript',
      seq: 1,
      speaker: 'bot',
      text: 'Namaste Asha ji',
      final: true,
    });
    expect(within(transcript).queryByText('Namaste Asha')).not.toBeInTheDocument();
    expect(within(transcript).getByText('Namaste Asha ji').closest('li')).toHaveAttribute(
      'data-final',
      'true',
    );
    // regression: the barge-in event comes before the cut line — the flag on the line decides
    server({ type: 'call.event', event: { type: 'barge_in', data: { playedMs: 900 }, seq: 3 } });
    expect(within(transcript).queryByText('interrupted')).not.toBeInTheDocument();
    server({
      type: 'call.transcript',
      seq: 2,
      speaker: 'bot',
      text: 'Aapki EMI due hai',
      final: true,
      interrupted: true,
    });
    expect(within(transcript).getByText('interrupted')).toBeInTheDocument();
    server({ type: 'call.event', event: { type: 'latency', data: { ms: 640 }, seq: 4 } });
    expect(screen.getByText('640 ms')).toBeInTheDocument();
    expect(screen.getByText('Customer interrupted the bot (after 900 ms)')).toBeInTheDocument();

    // keypad, mute, typed words
    await user.click(screen.getByRole('button', { name: 'Key 1' }));
    await user.click(screen.getByRole('button', { name: 'Mute' }));
    expect(audio.calls.muted).toEqual([true]);
    await user.click(screen.getByRole('button', { name: 'Unmute' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Type instead of speaking' }),
      'maine pay kar diya{Enter}',
    );
    expect(ws.controls().slice(1)).toEqual([
      { type: 'call.dtmf', digit: '1' },
      { type: 'call.mute', muted: true },
      { type: 'call.mute', muted: false },
      { type: 'call.say_text', text: 'maine pay kar diya' },
    ]);
    server({ type: 'error', code: 'text_input_disabled' });
    expect(screen.getByText(/Typed input is switched off/)).toBeInTheDocument();
    server({ type: 'error', code: 'bad_message' });
    expect(screen.getByText(/did not understand/)).toBeInTheDocument();

    // transfer prompt
    server({ type: 'call.transfer', phoneLast4: '3210' });
    expect(screen.getByText(/transferring the customer to ••••3210/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'No answer' }));
    expect(ws.controls().at(-1)).toEqual({ type: 'call.transfer_result', result: 'no_answer' });
    expect(screen.queryByText(/transferring the customer/)).not.toBeInTheDocument();

    // the end: summary from the saved call, link to the detail
    server({ type: 'call.ended', reason: 'hangup_node', durationSec: 26, costMicros: 895_000 });
    act(() => ws.serverClose(1000));
    const result = await screen.findByRole('region', { name: 'Call result' });
    expect(await within(result).findByText(/Flow finished · 26 s · Paid/)).toBeInTheDocument();
    expect(within(result).getByText(/Cost ₹0.90/)).toBeInTheDocument();
    expect(audio.calls.closed).toBe(1);
    await user.click(within(result).getByRole('link', { name: /Open call details/ }));
    expect(await screen.findByText('Detail page')).toBeInTheDocument();
  });

  it('hang up from the tester; a new call starts from the setup again', async () => {
    const user = userEvent.setup();
    const { deps } = make();
    page(deps);
    await user.click(await screen.findByRole('button', { name: 'Start call' }));
    await waitFor(() => expect(FakeMediaWs.instances).toHaveLength(1));
    const ws = FakeMediaWs.last();
    await act(async () => {
      ws.serverOpen();
      await Promise.resolve(); // let the hook send call.ready
    });
    status('in_progress', 1);
    await user.click(screen.getByRole('button', { name: 'Hang up' }));
    expect(ws.controls().at(-1)).toEqual({ type: 'call.hangup' });
    expect(screen.getByText('Ending…')).toBeInTheDocument();
    server({ type: 'call.ended', reason: 'customer_hangup', durationSec: 3, costMicros: 1 });
    act(() => ws.serverClose(1000));
    await user.click(await screen.findByRole('button', { name: 'New call' }));
    expect(screen.getByRole('button', { name: 'Start call' })).toBeInTheDocument();
  });

  it('the result waits for the saved call: the call.ended event refreshes it, else it polls', async () => {
    // the socket says "ended" before the backend saved the call: the first read is still live
    const endCall = async () => {
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: 'Start call' }));
      await waitFor(() => expect(FakeMediaWs.instances).toHaveLength(1));
      const ws = FakeMediaWs.last();
      await act(async () => {
        ws.serverOpen();
        await Promise.resolve();
      });
      status('in_progress', 1);
      server({ type: 'call.ended', reason: 'hangup_node', durationSec: 26, costMicros: 895_000 });
      act(() => ws.serverClose(1000));
      const result = await screen.findByRole('region', { name: 'Call result' });
      await waitFor(() => expect(callsApi.get).toHaveBeenCalledTimes(1));
      expect(within(result).queryByRole('link', { name: /Open call details/ })).toBeNull();
      return result;
    };
    const live = fakeCall({ status: 'in_progress', endReason: null });

    // 1. live updates: call.ended on /ws/events refetches the call
    vi.mocked(callsApi.get).mockResolvedValueOnce(live).mockResolvedValue(fakeCall());
    const rt = fakeRealtime();
    const first = make();
    const one = page(first.deps, undefined, rt.client);
    const result = await endCall();
    rt.emit('call.ended', { callId: 'c1', status: 'completed' });
    expect(await within(result).findByRole('link', { name: /Open call details/ })).toBeVisible();
    one.unmount();

    // 2. no live updates: polls while the saved call is still live
    vi.mocked(callsApi.get).mockReset();
    vi.mocked(callsApi.get).mockResolvedValueOnce(live).mockResolvedValue(fakeCall());
    vi.useFakeTimers({ shouldAdvanceTime: true });
    FakeMediaWs.instances = [];
    const second = make();
    page(second.deps);
    const again = await endCall();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });
    expect(await within(again).findByRole('link', { name: /Open call details/ })).toBeVisible();
  });

  it('a dropped socket fails the call with the reason; leaving during a call asks first', async () => {
    const user = userEvent.setup();
    const { deps } = make();
    page(deps);
    await user.click(await screen.findByRole('button', { name: 'Start call' }));
    await waitFor(() => expect(FakeMediaWs.instances).toHaveLength(1));
    await act(async () => {
      FakeMediaWs.last().serverOpen();
      await Promise.resolve(); // let the hook send call.ready
    });
    status('in_progress', 1);
    await user.click(screen.getByRole('link', { name: 'Go elsewhere' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Leave this call?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Stay' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('Elsewhere page')).not.toBeInTheDocument();
    act(() => FakeMediaWs.last().serverClose(1006));
    expect(await screen.findByText('The connection to the server was lost.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Call failed' })).toBeInTheDocument();
  });

  it('a refused ticket before the socket opens fails the call', async () => {
    const user = userEvent.setup();
    const { deps } = make();
    page(deps);
    await user.click(await screen.findByRole('button', { name: 'Start call' }));
    await waitFor(() => expect(FakeMediaWs.instances).toHaveLength(1));
    act(() => FakeMediaWs.last().serverClose(4010));
    expect(await screen.findByText(/expired before the browser connected/)).toBeInTheDocument();
  });

  it('mic denied → message, no call; wallet refusal → message; field errors on the typed values', async () => {
    const user = userEvent.setup();
    const denied = make({ requestMic: vi.fn(() => Promise.reject(new MicError('mic_denied'))) });
    const first = page(denied.deps);
    await user.click(await screen.findByRole('button', { name: 'Start call' }));
    expect(await screen.findByText(/Microphone access is blocked/)).toBeInTheDocument();
    expect(denied.deps.startWeb).not.toHaveBeenCalled();
    first.unmount();

    const odd = make({ requestMic: vi.fn(() => Promise.reject(new Error('odd'))) });
    const second = page(odd.deps);
    await user.click(await screen.findByRole('button', { name: 'Start call' }));
    expect(await screen.findByText(/could not be started/)).toBeInTheDocument();
    second.unmount();

    const broke = make({
      startWeb: vi.fn(() =>
        Promise.reject(
          new ApiError({
            status: 422,
            code: 'VALIDATION_FAILED',
            message: 'Check the highlighted fields.',
            kind: 'http',
            details: [
              { path: 'body.variables.amount', message: 'Not a valid currency' },
              { message: 'x' } as never,
            ],
          }),
        ),
      ),
    });
    const third = page(broke.deps);
    await user.click(await screen.findByRole('button', { name: 'Start call' }));
    expect(await screen.findByText('Not a valid currency')).toBeInTheDocument();
    expect(broke.stop).toHaveBeenCalled(); // mic released
    third.unmount();

    const plain = make({ startWeb: vi.fn(() => Promise.reject(new Error('boom'))) });
    const fourth = page(plain.deps);
    await user.click(await screen.findByRole('button', { name: 'Start call' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fourth.unmount();

    const noEngine = make({ createEngine: vi.fn(() => Promise.reject(new Error('worklet'))) });
    page(noEngine.deps);
    await user.click(await screen.findByRole('button', { name: 'Start call' }));
    expect(await screen.findByText(/could not be started/)).toBeInTheDocument();
    expect(noEngine.stop).toHaveBeenCalled();
  });

  it('an agent alone (prefilled), a contact as the customer; published flows default to published', async () => {
    const user = userEvent.setup();
    const { deps } = make();
    const agentPage = page(deps, '/calls/test?agentId=a1');
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'AI agent' })).toHaveValue('Recovery Bot'),
    );
    expect(await screen.findByRole('textbox', { name: '{{name}}' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '{{phone_last4}}' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'A contact' }));
    expect(screen.getByRole('button', { name: 'Start call' })).toBeDisabled();
    await user.click(screen.getByRole('combobox', { name: 'Contact' }));
    await user.click(await screen.findByRole('option', { name: 'Asha Verma · ••••0012' }));
    await user.click(screen.getByRole('button', { name: 'Start call' }));
    await waitFor(() =>
      expect(deps.startWeb).toHaveBeenCalledWith({ agentId: 'a1', contactId: 'k1' }),
    );
    agentPage.unmount();

    const flowPage = make();
    page(flowPage.deps, '/calls/test');
    await user.click(await screen.findByRole('combobox', { name: 'Flow' }));
    await user.click(await screen.findByRole('option', { name: 'Draft only' }));
    expect(screen.getByRole('combobox', { name: 'Version' })).toHaveTextContent('Saved draft');
    await user.click(screen.getByRole('combobox', { name: 'Flow' }));
    await user.click(await screen.findByRole('option', { name: 'Loan recovery' }));
    expect(screen.getByRole('combobox', { name: 'Version' })).toHaveTextContent('Published (v2)');
    await user.click(screen.getByRole('radio', { name: 'An AI agent alone' }));
    await user.click(screen.getByRole('radio', { name: 'A call flow' }));
    await user.click(screen.getByRole('button', { name: 'Start call' }));
    await waitFor(() =>
      expect(flowPage.deps.startWeb).toHaveBeenCalledWith({
        flowId: 'f1',
        version: 'published',
        variables: {},
      }),
    );
  });

  it('the call timer ticks while in a call', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let now = 1_000_000;
    vi.setSystemTime(now);
    const { deps } = make({ now: () => now });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    page(deps);
    await user.click(await screen.findByRole('button', { name: 'Start call' }));
    await waitFor(() => expect(FakeMediaWs.instances).toHaveLength(1));
    await act(async () => {
      FakeMediaWs.last().serverOpen();
      await Promise.resolve(); // let the hook send call.ready
    });
    status('in_progress', 1);
    now += 65_000;
    act(() => {
      vi.setSystemTime(now);
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByLabelText('Call time')).toHaveTextContent('01:06'); // 65 s + the 1 s tick
  });
});
