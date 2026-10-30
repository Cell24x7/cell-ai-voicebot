/**
 * The browser side of a call's audio: microphone → capture worklet → 960-byte
 * frames, and call frames → playback worklet → speaker. Browser APIs sit
 * behind `AudioPlatform` so the tester is tested with a fake.
 */
// eslint-disable-next-line import-x/default -- Vite `?worker&url`: the bundled worklet's URL
import captureUrl from './capture.worklet.ts?worker&url';
import { CALL_SAMPLE_RATE } from './dsp';
// eslint-disable-next-line import-x/default -- Vite `?worker&url`: the bundled worklet's URL
import playbackUrl from './playback.worklet.ts?worker&url';

export type MicErrorCode = 'mic_denied' | 'mic_missing' | 'mic_failed' | 'unsupported';

export class MicError extends Error {
  readonly code: MicErrorCode;
  constructor(code: MicErrorCode) {
    super(code);
    this.name = 'MicError';
    this.code = code;
  }
}

export const MIC_ERROR_TEXT: Record<MicErrorCode, string> = {
  mic_denied:
    'Microphone access is blocked. Allow it in the browser (the icon left of the address bar) and try again.',
  mic_missing: 'No microphone found. Connect one (headphones with a mic are best) and try again.',
  mic_failed: 'The microphone could not be started. Close other apps using it and try again.',
  unsupported: 'This browser cannot make test calls. Use a recent Chrome, Edge or Firefox.',
};

/** Echo cancellation + noise suppression on — the bot must not hear itself. */
export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

export const requestMicrophone = async (
  media: Pick<MediaDevices, 'getUserMedia'> | undefined = globalThis.navigator?.mediaDevices,
  deviceId?: string,
): Promise<MediaStream> => {
  if (!media?.getUserMedia) throw new MicError('unsupported');
  try {
    return await media.getUserMedia(
      deviceId
        ? {
            ...MIC_CONSTRAINTS,
            audio: {
              ...(MIC_CONSTRAINTS.audio as MediaTrackConstraints),
              deviceId: { exact: deviceId },
            },
          }
        : MIC_CONSTRAINTS,
    );
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new MicError('mic_denied');
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new MicError('mic_missing');
    }
    throw new MicError('mic_failed');
  }
};

/** The parts of a worklet node we use. */
export interface WorkletNodeLike {
  readonly port: Pick<MessagePort, 'postMessage'> & {
    onmessage: ((event: MessageEvent) => void) | null;
  };
  connect(target: unknown): unknown;
  disconnect(): void;
}

/** The parts of an AudioContext we use. */
export interface AudioContextLike {
  readonly sampleRate: number;
  readonly state: string;
  readonly destination: unknown;
  readonly audioWorklet: { addModule(url: string): Promise<void> };
  createMediaStreamSource(stream: MediaStream): {
    connect(target: unknown): unknown;
    disconnect(): void;
  };
  createGain(): { gain: { value: number }; connect(target: unknown): unknown; disconnect(): void };
  resume(): Promise<void>;
  close(): Promise<void>;
}

export interface AudioPlatform {
  createContext(): AudioContextLike;
  createNode(
    context: AudioContextLike,
    name: string,
    options: AudioWorkletNodeOptions,
  ): WorkletNodeLike;
}

export const browserAudioPlatform: AudioPlatform = {
  createContext: () => {
    try {
      // the call rate: no resampling at all where the browser supports it
      return new AudioContext({ sampleRate: CALL_SAMPLE_RATE, latencyHint: 'interactive' });
    } catch {
      return new AudioContext({ latencyHint: 'interactive' });
    }
  },
  createNode: (context, name, options) =>
    new AudioWorkletNode(context as unknown as BaseAudioContext, name, options),
};

export interface AudioEngine {
  readonly sampleRate: number;
  /** Underruns reported by the playback worklet (gaps in the bot's audio). */
  readonly underruns: number;
  onFrame(fn: (frame: ArrayBuffer) => void): void;
  onLevel(fn: (level: number) => void): void;
  /** A 960-byte call frame for the speaker. */
  play(pcm: ArrayBuffer): void;
  /** Barge-in: drop everything queued now. */
  clear(): void;
  setMuted(muted: boolean): void;
  /** Switch input without interrupting the media socket or the customer's call. */
  setInputDevice(deviceId: string): Promise<void>;
  close(): Promise<void>;
}

const buildAudioEngine = async (
  stream: MediaStream,
  platform: AudioPlatform,
  media: Pick<MediaDevices, 'getUserMedia'> | undefined,
  context: AudioContextLike,
): Promise<AudioEngine> => {
  await context.audioWorklet.addModule(captureUrl);
  await context.audioWorklet.addModule(playbackUrl);
  let currentStream = stream;
  let source = context.createMediaStreamSource(currentStream);
  const capture = platform.createNode(context, 'cav-capture', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  // a muted sink keeps the capture node pulled by the graph without playing the mic back
  const sink = context.createGain();
  sink.gain.value = 0;
  source.connect(capture);
  capture.connect(sink);
  sink.connect(context.destination);
  const playback = platform.createNode(context, 'cav-playback', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  playback.connect(context.destination);
  if (context.state === 'suspended') await context.resume();

  const frameFns: ((frame: ArrayBuffer) => void)[] = [];
  const levelFns: ((level: number) => void)[] = [];
  let underruns = 0;
  capture.port.onmessage = (
    event: MessageEvent<{ type: string; frame?: ArrayBuffer; level?: number }>,
  ) => {
    const m = event.data;
    if (m.type === 'frame' && m.frame) for (const fn of frameFns) fn(m.frame);
    else if (m.type === 'level') for (const fn of levelFns) fn(m.level ?? 0);
  };
  playback.port.onmessage = (event: MessageEvent<{ type: string; underruns?: number }>) => {
    if (event.data.type === 'stats') underruns = event.data.underruns ?? underruns;
  };
  let closed = false;
  let inputChange = 0;
  return {
    sampleRate: context.sampleRate,
    get underruns() {
      return underruns;
    },
    onFrame: (fn) => frameFns.push(fn),
    onLevel: (fn) => levelFns.push(fn),
    play: (pcm) => {
      if (!closed) playback.port.postMessage({ type: 'audio', pcm }, [pcm]);
    },
    clear: () => {
      if (!closed) playback.port.postMessage({ type: 'clear' });
    },
    setMuted: (muted) => capture.port.postMessage({ type: 'mute', muted }),
    setInputDevice: async (deviceId) => {
      if (closed) return;
      const change = ++inputChange;
      const next = await requestMicrophone(media, deviceId);
      if (closed || change !== inputChange) {
        for (const track of next.getTracks()) track.stop();
        return;
      }
      try {
        const replacement = context.createMediaStreamSource(next);
        replacement.connect(capture);
        source.disconnect();
        for (const track of currentStream.getTracks()) track.stop();
        source = replacement;
        currentStream = next;
      } catch (err) {
        for (const track of next.getTracks()) track.stop();
        throw err;
      }
    },
    close: async () => {
      if (closed) return;
      closed = true;
      source.disconnect();
      capture.disconnect();
      playback.disconnect();
      sink.disconnect();
      for (const track of currentStream.getTracks()) track.stop();
      await context.close().catch(() => undefined);
    },
  };
};

export const createAudioEngine = async (
  stream: MediaStream,
  platform: AudioPlatform = browserAudioPlatform,
  media: Pick<MediaDevices, 'getUserMedia'> | undefined = globalThis.navigator?.mediaDevices,
): Promise<AudioEngine> => {
  const context = platform.createContext();
  try {
    return await buildAudioEngine(stream, platform, media, context);
  } catch (err) {
    for (const track of stream.getTracks()) track.stop();
    await context.close().catch(() => undefined);
    throw err;
  }
};
