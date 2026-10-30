import { useCallback, useEffect, useRef, useState } from 'react';

/** Preferred recording formats: OGG / Opus is sent as is, WebM / Opus is remuxed, M4A is an audio file. */
export const VOICE_TYPES = [
  'audio/ogg;codecs=opus',
  'audio/webm;codecs=opus',
  'audio/mp4',
] as const;

export const pickVoiceType = (isSupported: (type: string) => boolean): string | null =>
  VOICE_TYPES.find((t) => isSupported(t)) ?? null;

/** Can this browser record at all (MediaRecorder + getUserMedia)? */
export const canRecord = (): boolean =>
  typeof MediaRecorder !== 'undefined' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function';

/** Safari's M4A recordings are not voice notes on WhatsApp (sent as an audio file). */
export const isM4a = (mimeType: string): boolean => mimeType.startsWith('audio/mp4');

export const fileNameFor = (mimeType: string): string =>
  isM4a(mimeType) ? 'voice.m4a' : mimeType.startsWith('audio/ogg') ? 'voice.ogg' : 'voice.webm';

/** getUserMedia / MediaRecorder failure → what to tell the agent. */
export const micErrorMessage = (err: unknown): string => {
  const name = err instanceof Error ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone access is blocked. Allow the microphone for this site to record voice notes.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone was found.';
    case 'NotReadableError':
      return 'The microphone is being used by another app.';
    default:
      return 'Could not start recording. Try again.';
  }
};

export type RecorderState =
  | { phase: 'idle'; notice?: string }
  | { phase: 'requesting' }
  | { phase: 'recording'; elapsedMs: number }
  | { phase: 'recorded'; blob: Blob; url: string; durationMs: number; mimeType: string }
  | { phase: 'error'; message: string };

export const UNSUPPORTED_TEXT = "This browser can't record voice notes.";
export const TOO_SHORT_TEXT = 'Voice notes need at least 1 second.';
const TICK_MS = 200;

/**
 * Voice note recording (memory only — never stored in the browser): mono mic,
 * best supported type, timer, auto-stop at `maxSeconds`, recordings shorter
 * than `minMs` discarded, mic tracks stopped on stop / cancel / unmount.
 */
export const useVoiceRecorder = ({ maxSeconds, minMs }: { maxSeconds: number; minMs: number }) => {
  const [state, setState] = useState<RecorderState>({ phase: 'idle' });
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  const discard = useRef(false);
  /**
   * Counts starts, cancels and unmounts (never resets). A microphone granted to an
   * older attempt (cancelled, unmounted, or started twice by React strict mode) is
   * released at once.
   */
  const attempt = useRef(0);
  const url = useRef<string | null>(null);

  const stopTracks = useCallback(() => {
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);
  const revoke = useCallback(() => {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
  }, []);

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  const start = useCallback(async () => {
    revoke();
    if (!canRecord()) {
      setState({ phase: 'error', message: UNSUPPORTED_TEXT });
      return;
    }
    setState({ phase: 'requesting' });
    attempt.current += 1;
    const mine = attempt.current;
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      if (attempt.current !== mine) {
        for (const track of media.getTracks()) track.stop();
        return;
      }
      stream.current = media;
      const type = pickVoiceType((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(media, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      discard.current = false;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        const durationMs = Date.now() - startedAt.current;
        stopTracks();
        recorder.current = null;
        if (discard.current) {
          setState({ phase: 'idle' });
          return;
        }
        if (durationMs < minMs) {
          setState({ phase: 'idle', notice: TOO_SHORT_TEXT });
          return;
        }
        const mimeType = rec.mimeType || type || 'audio/webm';
        const blob = new Blob(chunks, { type: mimeType });
        url.current = URL.createObjectURL(blob);
        setState({ phase: 'recorded', blob, url: url.current, durationMs, mimeType });
      };
      recorder.current = rec;
      startedAt.current = Date.now();
      rec.start(1000);
      setState({ phase: 'recording', elapsedMs: 0 });
      timer.current = setInterval(() => {
        const elapsedMs = Date.now() - startedAt.current;
        if (elapsedMs >= maxSeconds * 1000) stop();
        else setState({ phase: 'recording', elapsedMs });
      }, TICK_MS);
    } catch (err) {
      stopTracks();
      setState({ phase: 'error', message: micErrorMessage(err) });
    }
  }, [maxSeconds, minMs, stop, stopTracks, revoke]);

  /** Throw the recording away (Esc / trash) — nothing is kept. */
  const cancel = useCallback(() => {
    attempt.current += 1;
    discard.current = true;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    else {
      stopTracks();
      revoke();
      setState({ phase: 'idle' });
    }
  }, [stopTracks, revoke]);

  useEffect(
    () => () => {
      attempt.current += 1;
      discard.current = true;
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stopTracks();
      revoke();
    },
    [stopTracks, revoke],
  );

  return { state, start, stop, cancel };
};
