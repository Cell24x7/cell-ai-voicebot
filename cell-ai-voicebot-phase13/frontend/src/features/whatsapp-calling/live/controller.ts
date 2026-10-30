import {
  createAudioEngine,
  MIC_ERROR_TEXT,
  MicError,
  requestMicrophone,
  type AudioEngine,
} from '@/features/calls/audio/engine';
import {
  buildMediaUrl,
  CLOSE_TEXT,
  MediaSocket,
  type MediaWebSocketFactory,
} from '@/features/calls/audio/media-socket';
import { callsApi } from '@/services/api/calls';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import type { WhatsAppCallMediaTicket, WhatsAppCallProgram } from '@/services/api/types';
import { whatsappCallingApi } from '@/services/api/whatsapp-calling';

import { CALL_ERROR_TEXT } from '../labels';

import { newActiveCall, useLiveCallStore, type ActiveWaCall } from './store';

/**
 * The browser's side of a WhatsApp call (one at a time): the agent's microphone →
 * the Phase 7 audio engine → `/ws/media` (the server bridges it to the customer's
 * WhatsApp leg). AI calls have no media here — the bar follows their status.
 */
export interface LiveCallDeps {
  requestMic: () => Promise<MediaStream>;
  createEngine: (stream: MediaStream) => Promise<AudioEngine>;
  socketFactory?: MediaWebSocketFactory;
  mediaUrl: (ticket: string, wsPath: string) => string;
  now: () => number;
  api: Pick<
    typeof whatsappCallingApi,
    'start' | 'answer' | 'hold' | 'transfer' | 'decline' | 'mediaTicket'
  > & {
    hangup: (callId: string) => Promise<unknown>;
    /** The call's current status (an answered transfer is already in progress). */
    status: (callId: string) => Promise<string>;
  };
}

export const browserLiveCallDeps: LiveCallDeps = {
  requestMic: () => requestMicrophone(),
  createEngine: (stream) => createAudioEngine(stream),
  mediaUrl: (ticket, wsPath) => buildMediaUrl(ticket, wsPath),
  now: () => Date.now(),
  api: {
    start: (body, key) => whatsappCallingApi.start(body, key),
    answer: (id) => whatsappCallingApi.answer(id),
    hold: (id, on) => whatsappCallingApi.hold(id, on),
    transfer: (id, userId) => whatsappCallingApi.transfer(id, userId),
    decline: (id) => whatsappCallingApi.decline(id),
    mediaTicket: (id) => whatsappCallingApi.mediaTicket(id),
    hangup: (id) => callsApi.hangup(id),
    status: async (id) => (await callsApi.get(id)).status,
  },
};

let deps: LiveCallDeps = browserLiveCallDeps;
/** Tests: fake mic / engine / socket / API. */
export const setLiveCallDeps = (next: LiveCallDeps | null): void => {
  deps = next ?? browserLiveCallDeps;
};

let socket: MediaSocket | null = null;
let engine: AudioEngine | null = null;
let endedByServer = false;
/** Invalidates asynchronous microphone / API work when the call is canceled or replaced. */
let attempt = 0;

const store = () => useLiveCallStore.getState();
const patch = (p: Partial<ActiveWaCall>) => store().patchActive(p);

export const callErrorText = (err: unknown): string => {
  const e = toApiError(err);
  return (
    (e.kind === 'http' && e.code ? CALL_ERROR_TEXT[e.code] : undefined) ?? getErrorMessage(err)
  );
};

const release = () => {
  socket?.close();
  socket = null;
  const e = engine;
  engine = null;
  void e?.close();
};

const micStream = async (generation: number): Promise<MediaStream | null> => {
  try {
    const stream = await deps.requestMic();
    if (generation !== attempt) {
      for (const track of stream.getTracks()) track.stop();
      return null;
    }
    return stream;
  } catch (err) {
    const code = err instanceof MicError ? err.code : 'mic_failed';
    if (generation === attempt) patch({ phase: 'failed', failure: MIC_ERROR_TEXT[code] });
    return null;
  }
};

/** Opens the agent's media socket for the call (after the API gave the ticket). */
const connectLeg = async (
  stream: MediaStream,
  ticket: WhatsAppCallMediaTicket,
  generation: number,
) => {
  let audio: AudioEngine;
  try {
    audio = await deps.createEngine(stream);
  } catch {
    for (const track of stream.getTracks()) track.stop();
    if (generation === attempt) patch({ phase: 'failed', failure: MIC_ERROR_TEXT.mic_failed });
    return;
  }
  if (generation !== attempt) {
    await audio.close();
    return;
  }
  engine = audio;
  endedByServer = false;
  patch({ callId: ticket.callId, phase: 'connecting' });
  const media = new MediaSocket(
    deps.mediaUrl(ticket.mediaTicket, ticket.wsPath),
    {
      onMessage: (m) => {
        if (generation !== attempt) return;
        if (m.type === 'audio.clear') audio.clear();
        if (m.type === 'wallet.empty_warning') patch({ walletEndsInSec: m.endsInSec });
        if (m.type === 'call.hold') patch({ held: m.on });
        if (m.type === 'call.event' && m.event.type === 'status') {
          const status = m.event.data.status;
          if (status === 'ringing') patch({ phase: 'ringing' });
          if (status === 'in_progress') patch({ phase: 'in_call', answeredAt: deps.now() });
        }
        if (m.type === 'call.ended') {
          endedByServer = true;
          patch({ phase: 'ending', ended: { reason: m.reason, durationSec: m.durationSec } });
        }
      },
      onAudio: (frame) => {
        if (generation === attempt) audio.play(frame);
      },
      onClose: (reason) => {
        if (generation !== attempt) return;
        socket = null;
        engine = null;
        void audio.close();
        const normal = endedByServer || reason === 'normal' || reason === 'call_ended';
        patch(
          normal
            ? { phase: 'ended', level: 0 }
            : { phase: 'failed', level: 0, network: 'lost', failure: CLOSE_TEXT[reason] },
        );
      },
    },
    deps.socketFactory,
  );
  socket = media;
  audio.onFrame((frame) => media.sendFrame(frame));
  audio.onLevel((level) => {
    if (generation === attempt)
      patch({ level: Math.round(level * 20) / 20, network: audio.underruns > 0 ? 'poor' : 'good' });
  });
  try {
    await media.opened();
  } catch {
    return; // onClose reported why
  }
  media.ready();
};

export interface PlaceCallInput {
  channelId: string;
  contactId: string;
  mode: 'human' | 'ai';
  program?: WhatsAppCallProgram | null;
  label: string;
  conversationId: string | null;
  /** One Idempotency-Key per attempt (a retry of the same click reuses it). */
  idempotencyKey: string;
  recording: boolean;
}

/** "Call yourself" (microphone first) or "Call with AI" (no media in the browser). */
export const placeCall = async (input: PlaceCallInput): Promise<void> => {
  if (isBusy()) return;
  const generation = ++attempt;
  release();
  store().setActive({
    ...newActiveCall({
      mode: input.mode,
      direction: 'outbound',
      label: input.label,
      conversationId: input.conversationId,
    }),
    recording: input.recording,
  });
  const stream = input.mode === 'human' ? await micStream(generation) : null;
  if (input.mode === 'human' && !stream) return;
  try {
    const started = await deps.api.start(
      {
        channelId: input.channelId,
        contactId: input.contactId,
        mode: input.mode,
        ...(input.mode === 'ai' ? { program: input.program ?? null } : {}),
      },
      input.idempotencyKey,
    );
    if (generation !== attempt) {
      for (const track of stream?.getTracks() ?? []) track.stop();
      await deps.api.hangup(started.callId).catch(() => undefined);
      return;
    }
    if (!stream || !started.mediaTicket || !started.wsPath || !started.expiresAt) {
      patch({ callId: started.callId, phase: 'ringing' });
      return;
    }
    await connectLeg(
      stream,
      {
        callId: started.callId,
        mediaTicket: started.mediaTicket,
        expiresAt: started.expiresAt,
        wsPath: started.wsPath,
      },
      generation,
    );
  } catch (err) {
    for (const track of stream?.getTracks() ?? []) track.stop();
    if (generation === attempt) patch({ phase: 'failed', failure: callErrorText(err) });
  }
};

/** Accept a ringing call: microphone → first-wins answer → media socket → Meta accept. */
export const answerCall = async (input: {
  callId: string;
  label: string;
  conversationId: string | null;
  recording: boolean;
}): Promise<boolean> => {
  if (isBusy()) return false;
  const generation = ++attempt;
  release();
  store().setActive({
    ...newActiveCall({
      mode: 'human',
      direction: 'inbound',
      label: input.label,
      conversationId: input.conversationId,
      callId: input.callId,
    }),
    recording: input.recording,
  });
  const stream = await micStream(generation);
  if (!stream) return false;
  try {
    const ticket = await deps.api.answer(input.callId);
    if (generation !== attempt) {
      for (const track of stream.getTracks()) track.stop();
      await deps.api.hangup(input.callId).catch(() => undefined);
      return false;
    }
    await connectLeg(stream, ticket, generation);
    // taking over an AI call joins a call that is already talking (no new status event)
    const now = await deps.api.status(input.callId).catch(() => null);
    if (now && generation === attempt) onCallStatus(input.callId, now);
    return true;
  } catch (err) {
    for (const track of stream.getTracks()) track.stop();
    if (generation === attempt) patch({ phase: 'failed', failure: callErrorText(err) });
    return false;
  }
};

/** The media socket dropped while the call goes on: a new ticket, the same call. */
export const reconnectCall = async (): Promise<void> => {
  const call = store().active;
  if (!call?.callId || call.mode !== 'human' || call.network !== 'lost') return;
  const generation = ++attempt;
  patch({ phase: 'connecting', failure: null, network: 'good' });
  const stream = await micStream(generation);
  if (!stream) return;
  try {
    const ticket = await deps.api.mediaTicket(call.callId);
    await connectLeg(stream, ticket, generation);
    if (call.answeredAt && generation === attempt)
      patch({ phase: 'in_call', answeredAt: call.answeredAt });
  } catch (err) {
    for (const track of stream.getTracks()) track.stop();
    if (generation === attempt) patch({ phase: 'failed', failure: callErrorText(err) });
  }
};

export const declineCall = async (callId: string): Promise<void> => {
  await deps.api.decline(callId).catch(() => undefined);
};

/** Supervisors: take an AI call over (ring yourself on the same call, then answer). */
export const takeOver = async (userId: string): Promise<void> => {
  const call = store().active;
  if (!call?.callId || call.mode !== 'ai') return;
  try {
    await deps.api.transfer(call.callId, userId);
  } catch (err) {
    patch({ failure: callErrorText(err) });
    return;
  }
  const label = call.label;
  const callId = call.callId;
  store().setActive(null);
  await answerCall({
    callId,
    label,
    conversationId: call.conversationId,
    recording: call.recording,
  });
};

export const hangupCall = async (): Promise<void> => {
  const call = store().active;
  if (!call) return;
  if (!call.callId) {
    clearCall();
    return;
  }
  patch({ phase: 'ending' });
  if (socket) {
    socket.hangup();
    return;
  }
  if (call.callId) await deps.api.hangup(call.callId).catch(() => undefined);
};

export const setMuted = (muted: boolean): void => {
  engine?.setMuted(muted);
  socket?.mute(muted);
  patch({ muted });
};

export const setHeld = async (held: boolean): Promise<void> => {
  const call = store().active;
  if (!call?.callId) return;
  patch({ held });
  try {
    await deps.api.hold(call.callId, held);
  } catch (err) {
    patch({ held: !held, failure: callErrorText(err) });
  }
};

export const pressKey = (digit: string): void => socket?.dtmf(digit);

export const changeMicrophone = async (deviceId: string): Promise<void> => {
  await engine?.setInputDevice(deviceId);
};

/**
 * The account's WS events for the active call: AI calls have no media socket, and the
 * agent's socket of a WhatsApp call is the bridge leg (the session reports the
 * customer's call status on the account events, not on that socket).
 */
export const onCallStatus = (callId: string, status: string): void => {
  const call = store().active;
  if (call?.callId !== callId || call.phase === 'ended' || call.phase === 'failed') return;
  if (status === 'ringing' && call.phase !== 'in_call' && call.phase !== 'ending')
    patch({ phase: 'ringing' });
  if (status === 'in_progress' && call.phase !== 'in_call')
    patch({ phase: 'in_call', answeredAt: deps.now() });
};

export const onCallEnded = (
  callId: string,
  ended: { endReason: string | null; durationSec: number },
): void => {
  const call = store().active;
  if (call?.callId !== callId) return;
  const summary = { reason: ended.endReason ?? 'ended', durationSec: ended.durationSec };
  attempt += 1;
  endedByServer = true;
  release();
  patch({ phase: 'ended', ended: summary });
};

/** Closes the bar after the call ended. */
export const clearCall = (): void => {
  attempt += 1;
  release();
  store().setActive(null);
};

export const isBusy = (): boolean => {
  const call = store().active;
  return Boolean(call && call.phase !== 'ended' && call.phase !== 'failed');
};
