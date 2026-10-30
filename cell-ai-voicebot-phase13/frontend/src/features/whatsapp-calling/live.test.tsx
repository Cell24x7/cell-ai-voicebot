import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth/store';
import { agentsApi } from '@/services/api/agents';
import { ApiError } from '@/services/api/errors';
import { flowsApi } from '@/services/api/flows';
import type * as InboxModule from '@/services/api/inbox';
import { inboxApi } from '@/services/api/inbox';
import { teamApi } from '@/services/api/team';
import type * as WalletModule from '@/services/api/wallet';
import { walletApi } from '@/services/api/wallet';
import { whatsappCallingApi } from '@/services/api/whatsapp-calling';
import { fakeAgentRow } from '@/test/agents';
import { signInAs } from '@/test/auth';
import { fakeAudioEngine, FakeMediaWs } from '@/test/calls';
import { fakeCallingSettings, fakeCallPermission, fakeIncoming, fakeWaCall } from '@/test/calls-wa';
import { fakeFlowRow } from '@/test/flows';
import { fakeConversationDetail } from '@/test/inbox';
import { fakeRealtime } from '@/test/realtime';
import { renderWithProviders } from '@/test/render';

import { MIC_ERROR_TEXT, MicError } from '../calls/audio/engine';

import { AvailabilityToggle } from './live/AvailabilityToggle';
import { CallButton } from './live/CallButton';
import { CallMounts } from './live/CallMounts';
import {
  answerCall,
  clearCall,
  hangupCall,
  onCallEnded,
  onCallStatus,
  placeCall,
  pressKey,
  reconnectCall,
  setHeld,
  setLiveCallDeps,
  setMuted,
  type LiveCallDeps,
} from './live/controller';
import { aiCallMinuteMicros } from './live/cost';
import { MicrophonePicker } from './live/MicrophonePicker';
import { isRingMuted, setRingMuted, startRing } from './live/ringer';
import { newActiveCall, useLiveCallStore } from './live/store';

vi.mock('@/services/api/whatsapp-calling', () => ({
  whatsappCallingApi: {
    permission: vi.fn(),
    getSettings: vi.fn(),
    requestPermission: vi.fn(),
    setAvailability: vi.fn(),
    start: vi.fn(),
    answer: vi.fn(),
    decline: vi.fn(),
    hold: vi.fn(),
    transfer: vi.fn(),
    mediaTicket: vi.fn(),
  },
}));
vi.mock('@/services/api/flows', () => ({ flowsApi: { list: vi.fn() } }));
vi.mock('@/services/api/agents', () => ({ agentsApi: { list: vi.fn() } }));
vi.mock('@/services/api/team', () => ({ teamApi: { list: vi.fn() } }));
vi.mock('@/services/api/wallet', async (importOriginal) => ({
  ...(await importOriginal<typeof WalletModule>()),
  walletApi: { rates: vi.fn() },
}));
vi.mock('@/services/api/inbox', async (importOriginal) => ({
  ...(await importOriginal<typeof InboxModule>()),
  inboxApi: { conversation: vi.fn() },
}));
const api = vi.mocked(whatsappCallingApi);
const offset = <T,>(data: T[]) => ({
  success: true as const,
  data,
  meta: { page: 1, limit: 100, total: data.length, totalPages: 1 },
});
const TICKET = {
  callId: 'wc1',
  mediaTicket: 'wst_wa',
  expiresAt: '2026-10-25T10:01:00.000Z',
  wsPath: '/ws/media',
};

const callStatus = vi.fn(() => Promise.resolve('ringing'));
const make = (overrides: Partial<LiveCallDeps> = {}) => {
  const audio = fakeAudioEngine();
  const stop = vi.fn();
  const hangup = vi.fn(() => Promise.resolve());
  const deps: LiveCallDeps = {
    requestMic: vi.fn(() =>
      Promise.resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream),
    ),
    createEngine: vi.fn(() => Promise.resolve(audio.engine)),
    socketFactory: (url) => new FakeMediaWs(url),
    mediaUrl: (ticket, path) => `ws://test${path}?ticket=${ticket}`,
    now: () => 1_000,
    api: {
      start: api.start,
      answer: api.answer,
      decline: api.decline,
      hold: api.hold,
      transfer: api.transfer,
      mediaTicket: api.mediaTicket,
      hangup,
      status: callStatus,
    },
    ...overrides,
  };
  setLiveCallDeps(deps);
  return { deps, audio, stop, hangup };
};
const server = (event: unknown) => act(() => FakeMediaWs.last().serverSend(event));
const status = (s: string) =>
  server({ type: 'call.event', event: { type: 'status', data: { status: s }, seq: 1 } });
const active = () => useLiveCallStore.getState().active;
const place = (mode: 'human' | 'ai' = 'human') =>
  placeCall({
    channelId: 'wa1',
    contactId: 'k1',
    mode,
    program: mode === 'ai' ? { kind: 'flow', id: 'f1' } : null,
    label: 'Asha Verma',
    conversationId: 'cv1',
    idempotencyKey: 'key-1',
    recording: true,
  });
const http = (code: string, status = 409) =>
  new ApiError({ status, code, message: 'server text', kind: 'http', details: [] });

beforeEach(() => {
  FakeMediaWs.instances = [];
  useLiveCallStore.setState({ active: null, incoming: [] });
  signInAs('agent');
  api.start.mockResolvedValue({ ...TICKET, call: fakeWaCall('queued' as never) });
  api.answer.mockResolvedValue(TICKET);
  api.decline.mockResolvedValue({ declined: true });
  api.hold.mockResolvedValue({ held: true });
  api.transfer.mockResolvedValue({ callId: 'wc1', ringing: true });
  api.permission.mockResolvedValue(fakeCallPermission('temporary'));
  api.getSettings.mockResolvedValue(fakeCallingSettings());
  api.setAvailability.mockImplementation((s) => Promise.resolve({ status: s }));
  vi.mocked(flowsApi.list).mockResolvedValue(offset([fakeFlowRow()]));
  vi.mocked(agentsApi.list).mockResolvedValue(offset([fakeAgentRow()]));
  vi.mocked(teamApi.list).mockResolvedValue(
    offset([{ id: 'u2', name: 'Ravi Agent', role: { key: 'agent', name: 'Agent' } }]) as never,
  );
  vi.mocked(inboxApi.conversation).mockResolvedValue(fakeConversationDetail());
  vi.mocked(walletApi.rates).mockResolvedValue({
    aiPerMinuteMicros: 6_000_000,
    whatsappCalling: {
      payer: 'platform',
      pulseSec: 6,
      markets: [
        { market: 'IN', label: 'India', perMinuteMicros: 450_000 },
        { market: 'OTHER', label: 'Other', perMinuteMicros: 1_150_000 },
      ],
    },
  } as never);
});
afterEach(() => {
  clearCall();
  setLiveCallDeps(null);
  vi.clearAllMocks();
});

describe('live call controller', () => {
  it('canceling while microphone permission is pending stops the stream and never dials', async () => {
    let resolve!: (stream: MediaStream) => void;
    const { stop } = make({
      requestMic: () =>
        new Promise((r) => {
          resolve = r;
        }),
    });
    api.start.mockRejectedValue(http('CALL_CAPACITY'));
    const work = place();
    clearCall();
    resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await work;
    expect(stop).toHaveBeenCalledOnce();
    expect(api.start).not.toHaveBeenCalled();
    expect(active()).toBeNull();
  });

  it('a canceled dial response hangs up that call without replacing a newer call', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof api.start>>) => void;
    const { hangup } = make();
    api.start.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const work = place('ai');
    clearCall();
    useLiveCallStore.getState().setActive(
      newActiveCall({
        mode: 'ai',
        direction: 'outbound',
        label: 'New call',
        conversationId: null,
        callId: 'wc2',
      }),
    );
    resolve({ callId: 'wc1', call: fakeWaCall('ringing', 'ai') });
    await work;
    expect(hangup).toHaveBeenCalledWith('wc1');
    expect(active()?.callId).toBe('wc2');
    expect(FakeMediaWs.instances).toHaveLength(0);
  });

  it('a delayed audio engine is released after canceling instead of opening a media socket', async () => {
    const audio = fakeAudioEngine();
    let resolve!: (value: typeof audio.engine) => void;
    const createEngine = vi.fn(
      () =>
        new Promise<typeof audio.engine>((r) => {
          resolve = r;
        }),
    );
    make({ createEngine });
    const work = place();
    await waitFor(() => expect(createEngine).toHaveBeenCalled());
    clearCall();
    resolve(audio.engine);
    await work;
    expect(audio.calls.closed).toBe(1);
    expect(FakeMediaWs.instances).toHaveLength(0);
  });

  it('a stale socket message cannot change a newer call', async () => {
    make();
    const work = place();
    await waitFor(() => expect(FakeMediaWs.instances).toHaveLength(1));
    const old = FakeMediaWs.last();
    old.serverOpen();
    await work;
    clearCall();
    useLiveCallStore.getState().setActive(
      newActiveCall({
        mode: 'ai',
        direction: 'outbound',
        label: 'New call',
        conversationId: null,
        callId: 'wc2',
      }),
    );
    old.serverSend({ type: 'call.ended', reason: 'customer_hangup', durationSec: 4 });
    expect(active()).toMatchObject({ callId: 'wc2', phase: 'starting', ended: null });
  });

  it('Call yourself: mic → start (Idempotency-Key) → media socket → ringing → in call → ended', async () => {
    const { deps } = make();
    const p = place();
    await waitFor(() => expect(FakeMediaWs.instances).toHaveLength(1));
    expect(deps.requestMic).toHaveBeenCalled();
    expect(api.start).toHaveBeenCalledWith(
      { channelId: 'wa1', contactId: 'k1', mode: 'human' },
      'key-1',
    );
    expect(FakeMediaWs.last().url).toBe('ws://test/ws/media?ticket=wst_wa');
    act(() => FakeMediaWs.last().serverOpen());
    await p;
    expect(FakeMediaWs.last().controls()).toContainEqual({
      type: 'call.ready',
      sampleRate: 24_000,
    });
    expect(active()).toMatchObject({ callId: 'wc1', phase: 'connecting' });
    status('ringing');
    expect(active()?.phase).toBe('ringing');
    status('in_progress');
    expect(active()).toMatchObject({ phase: 'in_call', answeredAt: 1_000 });
    server({ type: 'call.ended', reason: 'customer_hangup', durationSec: 12, costMicros: 0 });
    act(() => FakeMediaWs.last().serverClose(1000));
    expect(active()).toMatchObject({
      phase: 'ended',
      ended: { reason: 'customer_hangup', durationSec: 12 },
    });
  });

  it('agent call: the account events (not the bridge socket) report answered / ended', async () => {
    make();
    const p = place();
    await waitFor(() => expect(FakeMediaWs.instances).toHaveLength(1));
    act(() => FakeMediaWs.last().serverOpen());
    await p;
    act(() => onCallStatus('wc1', 'in_progress'));
    expect(active()).toMatchObject({ phase: 'in_call', answeredAt: 1_000 });
    act(() => onCallEnded('wc1', { endReason: 'customer_hangup', durationSec: 7 }));
    expect(active()).toMatchObject({ phase: 'ended', ended: { durationSec: 7 } });
    act(() => FakeMediaWs.last().serverClose(4012));
    expect(active()?.phase).toBe('ended');
  });

  it('shows the low-wallet grace warning and accepts server hold changes', async () => {
    make();
    button();
    const placing = place();
    await waitFor(() => expect(FakeMediaWs.instances).toHaveLength(1));
    act(() => FakeMediaWs.last().serverOpen());
    await placing;
    status('in_progress');
    server({ type: 'wallet.empty_warning', endsInSec: 30 });
    expect(await screen.findByText(/Wallet balance is low/)).toHaveTextContent('30 seconds');
    server({ type: 'call.hold', on: true });
    expect(active()?.held).toBe(true);
    server({ type: 'call.hold', on: false });
    expect(active()?.held).toBe(false);
    act(() => onCallEnded('wc1', { endReason: 'wallet_empty', durationSec: 30 }));
    expect(screen.queryByText(/Wallet balance is low/)).not.toBeInTheDocument();
  });

  it('mute / hold / keys / hang up go to the socket and the API', async () => {
    const { audio } = make();
    const p = place();
    await waitFor(() => expect(FakeMediaWs.instances).toHaveLength(1));
    act(() => FakeMediaWs.last().serverOpen());
    await p;
    status('in_progress');
    act(() => setMuted(true));
    expect(audio.calls.muted).toEqual([true]);
    expect(FakeMediaWs.last().controls()).toContainEqual({ type: 'call.mute', muted: true });
    await act(() => setHeld(true));
    expect(api.hold).toHaveBeenCalledWith('wc1', true);
    expect(active()?.held).toBe(true);
    api.hold.mockRejectedValueOnce(http('CALL_NOT_ACTIVE'));
    await act(() => setHeld(false));
    expect(active()).toMatchObject({ held: true, failure: 'This call has ended.' });
    act(() => pressKey('5'));
    expect(FakeMediaWs.last().controls()).toContainEqual({ type: 'call.dtmf', digit: '5' });
    await act(() => hangupCall());
    expect(FakeMediaWs.last().controls()).toContainEqual({ type: 'call.hangup' });
  });

  it('mic denied / refused call / socket lost', async () => {
    make({ requestMic: () => Promise.reject(new MicError('mic_denied')) });
    await act(() => place());
    expect(active()?.phase).toBe('failed');
    expect(active()?.failure).toMatch(/microphone/i);
    expect(api.start).not.toHaveBeenCalled();

    const { stop } = make();
    api.start.mockRejectedValueOnce(http('WHATSAPP_CALL_PERMISSION_MISSING'));
    await act(() => place());
    expect(active()).toMatchObject({
      phase: 'failed',
      failure: 'The customer has not allowed calls.',
    });
    expect(stop).toHaveBeenCalled();

    make();
    const p = place();
    await waitFor(() => expect(FakeMediaWs.instances.length).toBeGreaterThan(0));
    act(() => FakeMediaWs.last().serverOpen());
    await p;
    act(() => FakeMediaWs.last().serverClose(1006));
    expect(active()).toMatchObject({ phase: 'failed', network: 'lost' });
    // the call goes on at the server: reconnect with a new ticket
    api.mediaTicket.mockResolvedValueOnce({ ...TICKET, mediaTicket: 'wst_again' });
    const again = reconnectCall();
    await waitFor(() => expect(FakeMediaWs.instances.at(-1)?.url).toContain('wst_again'));
    act(() => FakeMediaWs.last().serverOpen());
    await again;
    expect(api.mediaTicket).toHaveBeenCalledWith('wc1');
    expect(active()).toMatchObject({ phase: 'connecting', network: 'good', failure: null });
  });

  it('Call with AI: no microphone, the bar follows the account events, hang up by API', async () => {
    const { deps, hangup } = make();
    api.start.mockResolvedValueOnce({ callId: 'wc1', call: fakeWaCall('queued' as never, 'ai') });
    await act(() => place('ai'));
    expect(deps.requestMic).not.toHaveBeenCalled();
    expect(api.start).toHaveBeenCalledWith(
      { channelId: 'wa1', contactId: 'k1', mode: 'ai', program: { kind: 'flow', id: 'f1' } },
      'key-1',
    );
    expect(active()).toMatchObject({ callId: 'wc1', phase: 'ringing', mode: 'ai' });
    act(() => onCallStatus('other', 'in_progress'));
    expect(active()?.phase).toBe('ringing');
    act(() => onCallStatus('wc1', 'in_progress'));
    expect(active()?.phase).toBe('in_call');
    await act(() => hangupCall());
    expect(hangup).toHaveBeenCalledWith('wc1');
    act(() => onCallEnded('wc1', { endReason: 'agent_end_call', durationSec: 30 }));
    expect(active()).toMatchObject({ phase: 'ended', ended: { durationSec: 30 } });
  });

  it('answering: first wins; taken → the reason; one call at a time', async () => {
    make();
    api.answer.mockRejectedValueOnce(http('WHATSAPP_CALL_TAKEN'));
    expect(
      await answerCall({ callId: 'wc1', label: 'Asha', conversationId: null, recording: false }),
    ).toBe(false);
    expect(active()?.failure).toBe('Someone else answered this call.');
    const p = answerCall({ callId: 'wc1', label: 'Asha', conversationId: null, recording: false });
    await waitFor(() => expect(FakeMediaWs.instances).toHaveLength(1));
    act(() => FakeMediaWs.last().serverOpen());
    expect(await p).toBe(true);
    // busy: a second answer does nothing
    expect(
      await answerCall({ callId: 'wc2', label: 'X', conversationId: null, recording: false }),
    ).toBe(false);
    expect(api.answer).toHaveBeenCalledTimes(2);
  });

  it('cost per minute of an AI call (call by market + AI)', () => {
    const rates = {
      aiPerMinuteMicros: 6_000_000,
      whatsappCalling: {
        markets: [
          { market: 'IN', perMinuteMicros: 450_000 },
          { market: 'OTHER', perMinuteMicros: 1_150_000 },
        ],
      },
    };
    expect(aiCallMinuteMicros(rates, '+919000000101')).toEqual({ call: 450_000, ai: 6_000_000 });
    expect(aiCallMinuteMicros(rates, '+971500000000')).toEqual({ call: 1_150_000, ai: 6_000_000 });
    expect(aiCallMinuteMicros(undefined, '+91')).toBeNull();
  });
});

const button = () =>
  renderWithProviders({
    routes: [
      {
        path: '/',
        element: (
          <>
            <CallButton
              channelId="wa1"
              contactId="k1"
              phoneE164="+919000000101"
              label="Asha Verma"
              conversationId="cv1"
              windowExpiresAt={new Date(Date.now() + 3_600_000).toISOString()}
            />
            <CallMounts />
          </>
        ),
      },
    ],
  });

describe('call button states', () => {
  it('allowed: Call → Call yourself starts the call; the bar shows it', async () => {
    make();
    button();
    await userEvent.click(await screen.findByRole('button', { name: 'Call' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Call yourself/ }));
    await waitFor(() => expect(api.start).toHaveBeenCalled());
    const bar = await screen.findByRole('region', { name: 'WhatsApp call' });
    expect(within(bar).getByText('Asha Verma')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'On a call' })).toBeDisabled();
  });

  it('Call with AI: program + cost line', async () => {
    make();
    button();
    await userEvent.click(await screen.findByRole('button', { name: 'Call' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Call with AI/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Call with AI' });
    expect(await within(dialog).findByLabelText('Estimated cost')).toHaveTextContent('₹6.45');
    const go = within(dialog).getByRole('button', { name: 'Call with AI' });
    expect(go).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Published flow' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Loan recovery' }));
    api.start.mockResolvedValueOnce({ callId: 'wc1', call: fakeWaCall('queued' as never, 'ai') });
    await userEvent.click(go);
    await waitFor(() =>
      expect(api.start).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'ai', program: { kind: 'flow', id: 'f1' } }),
        expect.any(String),
      ),
    );
    expect(
      await screen.findByText('The AI will talk when the customer answers'),
    ).toBeInTheDocument();
  });

  it.each([
    ['requested', 'Requested · waiting'],
    ['declined', "Can't call"],
  ] as const)('%s → %s (disabled)', async (state, text) => {
    api.permission.mockResolvedValue(fakeCallPermission(state));
    button();
    expect(await screen.findByRole('button', { name: text })).toBeDisabled();
  });

  it('can ask → Request permission opens the dialog', async () => {
    api.permission.mockResolvedValue(fakeCallPermission('none'));
    button();
    await userEvent.click(await screen.findByRole('button', { name: 'Request permission' }));
    expect(await screen.findByRole('dialog', { name: 'Ask to allow calls' })).toBeInTheDocument();
  });

  it('viewers see no call button', () => {
    signInAs('viewer');
    button();
    expect(screen.queryByRole('button', { name: /Call|permission/ })).not.toBeInTheDocument();
  });
});

describe('call bar', () => {
  it('in call: timer, recording dot, controls; AI call: Take over for supervisors', async () => {
    make();
    renderWithProviders({ routes: [{ path: '/', element: <CallMounts /> }] });
    const p = place();
    await waitFor(() => expect(FakeMediaWs.instances).toHaveLength(1));
    act(() => FakeMediaWs.last().serverOpen());
    await act(() => p);
    status('in_progress');
    const bar = await screen.findByRole('region', { name: 'WhatsApp call' });
    expect(within(bar).getByLabelText('Recording')).toBeInTheDocument();
    await userEvent.click(within(bar).getByRole('button', { name: 'Mute' }));
    expect(within(bar).getByRole('button', { name: 'Unmute' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(within(bar).getByRole('button', { name: 'Keypad' }));
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Keypad' })).getByRole('button', { name: 'Key 7' }),
    );
    expect(FakeMediaWs.last().controls()).toContainEqual({ type: 'call.dtmf', digit: '7' });
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(bar).getByRole('button', { name: 'Hang up' }));
    server({ type: 'call.ended', reason: 'agent_end_call', durationSec: 9, costMicros: 0 });
    act(() => FakeMediaWs.last().serverClose(1000));
    expect(await within(bar).findByText('Call ended · 0:09')).toBeInTheDocument();
    await userEvent.click(within(bar).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('region', { name: 'WhatsApp call' })).not.toBeInTheDocument();
  });

  it('AI call in progress: Take over transfers to me and answers', async () => {
    signInAs('manager');
    make();
    api.start.mockResolvedValueOnce({ callId: 'wc1', call: fakeWaCall('queued' as never, 'ai') });
    renderWithProviders({ routes: [{ path: '/', element: <CallMounts /> }] });
    await act(() => place('ai'));
    act(() => onCallStatus('wc1', 'in_progress'));
    const bar = await screen.findByRole('region', { name: 'WhatsApp call' });
    expect(within(bar).getByText('AI is talking')).toBeInTheDocument();
    await userEvent.click(within(bar).getByRole('button', { name: 'Take over' }));
    await waitFor(() => expect(api.transfer).toHaveBeenCalledWith('wc1', 'u1'));
    await waitFor(() => expect(api.answer).toHaveBeenCalledWith('wc1'));
  });

  it('taking over joins a call already in progress: the bar shows it as talking', async () => {
    make();
    callStatus.mockResolvedValueOnce('in_progress');
    const p = answerCall({ callId: 'wc1', label: 'Asha', conversationId: null, recording: false });
    await waitFor(() => expect(FakeMediaWs.instances).toHaveLength(1));
    act(() => FakeMediaWs.last().serverOpen());
    expect(await p).toBe(true);
    expect(active()).toMatchObject({ phase: 'in_call', answeredAt: 1_000 });
  });
});

describe('incoming calls', () => {
  const show = (realtime = fakeRealtime()) => {
    renderWithProviders({
      realtime: realtime.client,
      routes: [
        {
          path: '/',
          element: (
            <StrictMode>
              <CallMounts />
            </StrictMode>
          ),
        },
      ],
    });
    return realtime;
  };

  it('rings with the customer label; Accept answers once; the bar opens', async () => {
    make();
    const rt = show();
    rt.emit('whatsapp.call.incoming', fakeIncoming());
    const popup = await screen.findByRole('alertdialog', { name: 'Incoming WhatsApp call' });
    expect(await within(popup).findByText('Asha Verma')).toBeInTheDocument();
    await userEvent.click(within(popup).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(api.answer).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(FakeMediaWs.instances).toHaveLength(1));
    expect(await screen.findByRole('region', { name: 'WhatsApp call' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('taken by someone else / stopped ringing / decline', async () => {
    signInAs('owner');
    make();
    const rt = show();
    rt.emit('whatsapp.call.incoming', fakeIncoming());
    const popup = await screen.findByRole('alertdialog');
    rt.emit('whatsapp.call.taken', { callId: 'wc1', byUserId: 'u2' });
    expect(await within(popup).findByText('Taken by Ravi Agent')).toBeInTheDocument();
    act(() => useLiveCallStore.getState().dismiss('wc1'));
    rt.emit('whatsapp.call.incoming', fakeIncoming({ callId: 'wc2' }));
    rt.emit('whatsapp.call.ended_ringing', { callId: 'wc2', reason: 'timeout' });
    expect(await screen.findByText('The call stopped ringing')).toBeInTheDocument();
    act(() => useLiveCallStore.getState().dismiss('wc2'));
    rt.emit('whatsapp.call.incoming', fakeIncoming({ callId: 'wc3' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(api.decline).toHaveBeenCalledWith('wc3'));
    expect(api.decline).toHaveBeenCalledTimes(1);
  });

  it('viewers never see incoming calls; the ring sound can be turned off', () => {
    signInAs('viewer');
    const rt = show();
    rt.emit('whatsapp.call.incoming', fakeIncoming());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    setRingMuted(true);
    expect(isRingMuted()).toBe(true);
    setRingMuted(false);
    expect(isRingMuted()).toBe(false);
  });

  it('the ring plays two tones every 2 s until stopped', () => {
    vi.useFakeTimers();
    const started: number[] = [];
    const close = vi.fn(() => Promise.resolve());
    const osc = () => ({
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(() => started.push(1)),
      stop: vi.fn(),
    });
    const stop = startRing(
      () =>
        ({
          createOscillator: osc,
          createGain: () => ({ gain: { value: 0 }, connect: vi.fn() }),
          currentTime: 0,
          destination: {},
          close,
        }) as never,
    );
    expect(started).toHaveLength(2);
    vi.advanceTimersByTime(4_000);
    expect(started).toHaveLength(6);
    stop();
    vi.advanceTimersByTime(4_000);
    expect(started).toHaveLength(6);
    expect(close).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('microphone selection', () => {
  it('switches input on the existing call and reports a denied microphone', async () => {
    const { audio } = make();
    const change = vi.spyOn(audio.engine, 'setInputDevice');
    const work = place();
    await waitFor(() => expect(FakeMediaWs.instances).toHaveLength(1));
    FakeMediaWs.last().serverOpen();
    await work;
    const media = {
      enumerateDevices: vi.fn().mockResolvedValue([
        { kind: 'audioinput', deviceId: 'headset', label: 'USB headset' },
        { kind: 'audioinput', deviceId: 'second', label: '' },
        { kind: 'audiooutput', deviceId: 'speaker', label: 'Speaker' },
      ]),
    };
    renderWithProviders({ routes: [{ path: '/', element: <MicrophonePicker media={media} /> }] });
    const picker = await screen.findByRole('combobox', { name: 'Microphone' });
    await userEvent.click(picker);
    await userEvent.click(screen.getByRole('option', { name: 'USB headset' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith('headset'));
    expect(FakeMediaWs.instances).toHaveLength(1);
    change.mockRejectedValueOnce(new MicError('mic_denied'));
    await userEvent.click(picker);
    await userEvent.click(screen.getByRole('option', { name: 'Microphone 2' }));
    expect(await screen.findByText(MIC_ERROR_TEXT.mic_denied)).toBeInTheDocument();
  });

  it('hides unsupported devices and ignores enumeration that finishes after unmount', async () => {
    let resolve!: (devices: MediaDeviceInfo[]) => void;
    const media = {
      enumerateDevices: () =>
        new Promise<MediaDeviceInfo[]>((r) => {
          resolve = r;
        }),
    };
    const view = renderWithProviders({
      routes: [{ path: '/', element: <MicrophonePicker media={media} /> }],
    });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    view.unmount();
    await act(async () => {
      resolve([]);
      await Promise.resolve();
    });
  });
});

describe('call availability', () => {
  const show = () =>
    renderWithProviders({ routes: [{ path: '/', element: <AvailabilityToggle /> }] });

  it('shows and changes my availability', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Call availability: Available' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Busy/ }));
    await waitFor(() => expect(api.setAvailability).toHaveBeenCalledWith('busy'));
    await waitFor(() =>
      expect(useAuthStore.getState().session?.user.callAvailability).toBe('busy'),
    );
    expect(screen.getByRole('button', { name: 'Call availability: Busy' })).toBeInTheDocument();
  });

  it('on a call it shows busy; viewers have no toggle', () => {
    useLiveCallStore.setState({
      active: { ...(useLiveCallStore.getState().active ?? {}), phase: 'in_call' } as never,
    });
    show();
    expect(screen.getByRole('button', { name: 'Call availability: Busy' })).toHaveTextContent(
      'On a call',
    );
  });

  it('viewers: nothing', () => {
    signInAs('viewer');
    show();
    expect(screen.queryByRole('button', { name: /Call availability/ })).not.toBeInTheDocument();
  });
});
