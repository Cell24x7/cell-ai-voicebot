import { useCallback, useEffect, useReducer, useRef } from 'react';

import { callsApi, type StartWebCallInput } from '@/services/api/calls';
import { getErrorMessage, isApiError } from '@/services/api/errors';
import type { StartedWebCall } from '@/services/api/types';

import {
  createAudioEngine,
  MIC_ERROR_TEXT,
  MicError,
  requestMicrophone,
  type AudioEngine,
} from '../audio/engine';
import {
  buildMediaUrl,
  CLOSE_TEXT,
  MediaSocket,
  type MediaServerMessage,
  type MediaWebSocketFactory,
} from '../audio/media-socket';

export type CallPhase =
  'idle' | 'starting' | 'connecting' | 'ringing' | 'in_call' | 'ending' | 'ended' | 'failed';

export interface LiveLine {
  key: string;
  speaker: 'customer' | 'bot' | 'agent';
  text: string;
  final: boolean;
  interrupted: boolean;
}

export interface LiveEvent {
  seq: number;
  type: string;
  data: Record<string, unknown>;
}

export interface CallFailure {
  kind: 'mic' | 'api' | 'socket';
  message: string;
  /** API error code (wallet, limits …) or the socket close reason. */
  code: string | null;
  /** Field errors of a refused start (`body.variables.<name>`, `body.testPhone`). */
  details?: { path: string; message: string }[];
}

export interface WebCallState {
  phase: CallPhase;
  callId: string | null;
  voice: StartedWebCall['voice'] | null;
  textInput: boolean;
  /** Epoch ms when the call was answered (timer). */
  answeredAt: number | null;
  lines: LiveLine[];
  events: LiveEvent[];
  latencies: number[];
  transfer: { phoneLast4: string } | null;
  muted: boolean;
  level: number;
  ended: { reason: string; durationSec: number; costMicros: number } | null;
  failure: CallFailure | null;
  notice: string | null;
}

export const INITIAL_CALL: WebCallState = {
  phase: 'idle',
  callId: null,
  voice: null,
  textInput: false,
  answeredAt: null,
  lines: [],
  events: [],
  latencies: [],
  transfer: null,
  muted: false,
  level: 0,
  ended: null,
  failure: null,
  notice: null,
};

type Action =
  | { type: 'reset' }
  | { type: 'starting' }
  | { type: 'connecting'; started: StartedWebCall }
  | { type: 'message'; message: MediaServerMessage; now: number }
  | { type: 'level'; level: number }
  | { type: 'muted'; muted: boolean }
  | { type: 'transfer_answered' }
  | { type: 'ending' }
  | { type: 'closed'; failure: CallFailure | null }
  | { type: 'failed'; failure: CallFailure };

let lineKey = 0;

const onMessage = (s: WebCallState, m: MediaServerMessage, now: number): WebCallState => {
  switch (m.type) {
    case 'call.config':
      return { ...s, textInput: m.textInput };
    case 'call.transcript': {
      // one live partial per speaker; a final replaces it
      const lines = s.lines.filter((l) => l.final || l.speaker !== m.speaker);
      lineKey += 1;
      lines.push({
        key: `l${String(lineKey)}`,
        speaker: m.speaker,
        text: m.text,
        final: m.final,
        interrupted: m.final && m.interrupted === true,
      });
      return { ...s, lines };
    }
    case 'call.event': {
      const event = { seq: m.event.seq, type: m.event.type, data: m.event.data };
      const next: WebCallState = { ...s, events: [...s.events, event] };
      if (event.type === 'status' && event.data.status === 'ringing' && s.phase === 'connecting') {
        next.phase = 'ringing';
      }
      if (event.type === 'status' && event.data.status === 'in_progress') {
        next.phase = s.phase === 'ending' ? s.phase : 'in_call';
        next.answeredAt = now;
      }
      if (event.type === 'latency' && typeof event.data.ms === 'number') {
        next.latencies = [...s.latencies, event.data.ms];
      }
      return next;
    }
    case 'call.transfer':
      return { ...s, transfer: { phoneLast4: m.phoneLast4 } };
    case 'call.ended':
      return {
        ...s,
        phase: 'ending',
        transfer: null,
        ended: { reason: m.reason, durationSec: m.durationSec, costMicros: m.costMicros },
      };
    case 'error':
      return {
        ...s,
        notice:
          m.code === 'text_input_disabled'
            ? 'Typed input is switched off on this server — speak instead.'
            : 'The server did not understand the last message.',
      };
    case 'wallet.empty_warning':
    case 'call.hold':
    case 'audio.clear':
      return s;
  }
};

const reducer = (s: WebCallState, a: Action): WebCallState => {
  switch (a.type) {
    case 'reset':
      return INITIAL_CALL;
    case 'starting':
      return { ...INITIAL_CALL, phase: 'starting' };
    case 'connecting':
      return {
        ...s,
        phase: 'connecting',
        callId: a.started.call.id,
        voice: a.started.voice,
        textInput: a.started.textInput,
      };
    case 'message':
      return onMessage(s, a.message, a.now);
    case 'level':
      return s.level === a.level ? s : { ...s, level: a.level };
    case 'muted':
      return { ...s, muted: a.muted };
    case 'transfer_answered':
      return { ...s, transfer: null };
    case 'ending':
      return s.phase === 'ended' || s.phase === 'failed' ? s : { ...s, phase: 'ending' };
    case 'closed':
      return a.failure
        ? { ...s, phase: 'failed', failure: a.failure, transfer: null, level: 0 }
        : { ...s, phase: 'ended', transfer: null, level: 0 };
    case 'failed':
      return { ...s, phase: 'failed', failure: a.failure, level: 0 };
  }
};

export interface WebCallDeps {
  startWeb: (body: StartWebCallInput) => Promise<StartedWebCall>;
  requestMic: () => Promise<MediaStream>;
  createEngine: (stream: MediaStream) => Promise<AudioEngine>;
  socketFactory?: MediaWebSocketFactory;
  mediaUrl: (ticket: string, wsPath: string) => string;
  now: () => number;
}

export const browserCallDeps: WebCallDeps = {
  startWeb: (body) => callsApi.startWeb(body),
  requestMic: () => requestMicrophone(),
  createEngine: (stream) => createAudioEngine(stream),
  mediaUrl: (ticket, wsPath) => buildMediaUrl(ticket, wsPath),
  now: () => Date.now(),
};

const LIVE: readonly CallPhase[] = ['starting', 'connecting', 'ringing', 'in_call', 'ending'];
export const isLivePhase = (phase: CallPhase): boolean => LIVE.includes(phase);

/**
 * One browser test call: microphone → `POST /calls/web` → audio engine →
 * `/ws/media`. Exposes the live state (transcript, events, latency, transfer
 * prompt, end summary) and the tester's actions.
 */
export const useWebCall = (deps: WebCallDeps = browserCallDeps) => {
  const [state, dispatch] = useReducer(reducer, INITIAL_CALL);
  const socket = useRef<MediaSocket | null>(null);
  const engine = useRef<AudioEngine | null>(null);
  const ended = useRef(false);

  const cleanup = useCallback(() => {
    socket.current?.close();
    socket.current = null;
    const e = engine.current;
    engine.current = null;
    void e?.close();
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(
    async (body: StartWebCallInput) => {
      cleanup();
      ended.current = false;
      dispatch({ type: 'starting' });
      let stream: MediaStream;
      try {
        stream = await deps.requestMic();
      } catch (err) {
        const code = err instanceof MicError ? err.code : 'mic_failed';
        dispatch({ type: 'failed', failure: { kind: 'mic', message: MIC_ERROR_TEXT[code], code } });
        return;
      }
      let started: StartedWebCall;
      try {
        started = await deps.startWeb(body);
      } catch (err) {
        for (const track of stream.getTracks()) track.stop();
        dispatch({
          type: 'failed',
          failure: {
            kind: 'api',
            message: getErrorMessage(err),
            code: isApiError(err) ? err.code : null,
            details: isApiError(err)
              ? (err.details ?? []).map((d) => ({ path: d.path ?? '', message: d.message }))
              : [],
          },
        });
        return;
      }
      let audio: AudioEngine;
      try {
        audio = await deps.createEngine(stream);
      } catch {
        for (const track of stream.getTracks()) track.stop();
        dispatch({
          type: 'failed',
          failure: { kind: 'mic', message: MIC_ERROR_TEXT.mic_failed, code: 'mic_failed' },
        });
        return;
      }
      engine.current = audio;
      dispatch({ type: 'connecting', started });
      const media = new MediaSocket(
        deps.mediaUrl(started.mediaTicket, started.wsPath),
        {
          onMessage: (message) => {
            if (message.type === 'audio.clear') audio.clear();
            if (message.type === 'call.ended') ended.current = true;
            dispatch({ type: 'message', message, now: deps.now() });
          },
          onAudio: (frame) => audio.play(frame),
          onClose: (reason) => {
            socket.current = null;
            engine.current = null;
            void audio.close();
            const normal = ended.current || reason === 'normal' || reason === 'call_ended';
            dispatch({
              type: 'closed',
              failure: normal
                ? null
                : { kind: 'socket', message: CLOSE_TEXT[reason], code: reason },
            });
          },
        },
        deps.socketFactory,
      );
      socket.current = media;
      audio.onFrame((frame) => media.sendFrame(frame));
      audio.onLevel((level) => dispatch({ type: 'level', level: Math.round(level * 20) / 20 }));
      try {
        await media.opened();
      } catch {
        return; // onClose reported why
      }
      media.ready();
    },
    [cleanup, deps],
  );

  const actions = {
    start,
    hangup: useCallback(() => {
      socket.current?.hangup();
      dispatch({ type: 'ending' });
    }, []),
    setMuted: useCallback((muted: boolean) => {
      engine.current?.setMuted(muted);
      socket.current?.mute(muted);
      dispatch({ type: 'muted', muted });
    }, []),
    pressKey: useCallback((digit: string) => socket.current?.dtmf(digit), []),
    sayText: useCallback((text: string) => socket.current?.sayText(text), []),
    answerTransfer: useCallback((result: 'connected' | 'failed' | 'no_answer') => {
      socket.current?.transferResult(result);
      dispatch({ type: 'transfer_answered' });
    }, []),
    reset: useCallback(() => {
      cleanup();
      dispatch({ type: 'reset' });
    }, [cleanup]),
  };
  return { state, ...actions };
};
