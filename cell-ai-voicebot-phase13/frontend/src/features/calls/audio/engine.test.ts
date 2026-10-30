import { describe, expect, it, vi } from 'vitest';

import {
  createAudioEngine,
  MIC_CONSTRAINTS,
  MIC_ERROR_TEXT,
  MicError,
  requestMicrophone,
  type AudioContextLike,
  type AudioPlatform,
  type WorkletNodeLike,
} from './engine';

vi.mock('./capture.worklet.ts?worker&url', () => ({ default: '/assets/capture.js' }));
vi.mock('./playback.worklet.ts?worker&url', () => ({ default: '/assets/playback.js' }));

const named = (name: string) => Object.assign(new Error(name), { name });

describe('requestMicrophone', () => {
  it('asks with echo cancellation + noise suppression; maps browser errors', async () => {
    const stream = {} as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    await expect(requestMicrophone({ getUserMedia })).resolves.toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith(MIC_CONSTRAINTS);
    expect(MIC_CONSTRAINTS.audio).toMatchObject({ echoCancellation: true, noiseSuppression: true });
    const code = async (err: unknown) => {
      try {
        await requestMicrophone({ getUserMedia: vi.fn().mockRejectedValue(err) });
        return 'resolved';
      } catch (e) {
        return (e as MicError).code;
      }
    };
    expect(await code(named('NotAllowedError'))).toBe('mic_denied');
    expect(await code(named('SecurityError'))).toBe('mic_denied');
    expect(await code(named('NotFoundError'))).toBe('mic_missing');
    expect(await code(named('OverconstrainedError'))).toBe('mic_missing');
    expect(await code(named('NotReadableError'))).toBe('mic_failed');
    expect(await code('weird')).toBe('mic_failed');
    await expect(requestMicrophone(undefined)).rejects.toMatchObject({ code: 'unsupported' });
    expect(MIC_ERROR_TEXT.mic_denied).toMatch(/blocked/);
    expect(new MicError('unsupported').name).toBe('MicError');
  });
});

const fakeNode = (): WorkletNodeLike & { posted: unknown[]; connected: unknown[] } => {
  const posted: unknown[] = [];
  const connected: unknown[] = [];
  return {
    posted,
    connected,
    port: { postMessage: (m: unknown) => posted.push(m), onmessage: null },
    connect: (t: unknown) => connected.push(t),
    disconnect: vi.fn(),
  };
};

const fakePlatform = (state = 'suspended') => {
  const nodes: Record<string, ReturnType<typeof fakeNode>> = {};
  const modules: string[] = [];
  const context = {
    sampleRate: 24_000,
    state,
    destination: 'speakers',
    audioWorklet: { addModule: (url: string) => (modules.push(url), Promise.resolve()) },
    createMediaStreamSource: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
    createGain: () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }),
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.reject(new Error('already closed'))),
  } satisfies AudioContextLike;
  const platform: AudioPlatform = {
    createContext: () => context,
    createNode: (_ctx, name) => (nodes[name] = fakeNode()),
  };
  return { platform, context, nodes, modules };
};

const send = (node: WorkletNodeLike, data: unknown) =>
  node.port.onmessage?.(new MessageEvent('message', { data }));

describe('createAudioEngine', () => {
  it('switches the microphone without rebuilding the socket and stops both streams at their end', async () => {
    const f = fakePlatform();
    const stop = vi.fn();
    const nextStop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    const next = { getTracks: () => [{ stop: nextStop }] } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(next);
    const engine = await createAudioEngine(stream, f.platform, { getUserMedia });
    await engine.setInputDevice('headset');
    expect(getUserMedia).toHaveBeenCalledWith({
      ...MIC_CONSTRAINTS,
      audio: {
        ...(MIC_CONSTRAINTS.audio as MediaTrackConstraints),
        deviceId: { exact: 'headset' },
      },
    });
    expect(stop).toHaveBeenCalledOnce();
    expect(nextStop).not.toHaveBeenCalled();
    await engine.close();
    expect(nextStop).toHaveBeenCalledOnce();
    await engine.setInputDevice('ignored');
    expect(getUserMedia).toHaveBeenCalledOnce();
  });

  it('releases a microphone selected after the call closed; failed worklet startup also cleans up', async () => {
    const f = fakePlatform();
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    let resolve!: (value: MediaStream) => void;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((r) => {
          resolve = r;
        }),
    );
    const engine = await createAudioEngine(stream, f.platform, { getUserMedia });
    const change = engine.setInputDevice('headset');
    await engine.close();
    const nextStop = vi.fn();
    resolve({ getTracks: () => [{ stop: nextStop }] } as unknown as MediaStream);
    await change;
    expect(nextStop).toHaveBeenCalledOnce();
    f.context.audioWorklet.addModule = () => Promise.reject(new Error('worklet failed'));
    await expect(createAudioEngine(stream, f.platform)).rejects.toThrow('worklet failed');
    expect(f.context.close).toHaveBeenCalledTimes(2);
  });

  it('loads both worklets, wires mic → capture → muted sink and playback → speakers, resumes', async () => {
    const f = fakePlatform();
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    const engine = await createAudioEngine(stream, f.platform);
    expect(f.modules).toEqual(['/assets/capture.js', '/assets/playback.js']);
    expect(f.context.resume).toHaveBeenCalled();
    expect(f.nodes['cav-playback']?.connected).toEqual(['speakers']);
    expect(engine.sampleRate).toBe(24_000);

    const frames: number[] = [];
    const levels: number[] = [];
    engine.onFrame((frame) => frames.push(frame.byteLength));
    engine.onLevel((level) => levels.push(level));
    const capture = f.nodes['cav-capture'] as WorkletNodeLike;
    send(capture, { type: 'frame', frame: new ArrayBuffer(960) });
    send(capture, { type: 'frame' }); // malformed: ignored
    send(capture, { type: 'level', level: 0.3 });
    send(capture, { type: 'level' });
    expect(frames).toEqual([960]);
    expect(levels).toEqual([0.3, 0]);

    const playback = f.nodes['cav-playback'] as ReturnType<typeof fakeNode>;
    const pcm = new ArrayBuffer(960);
    engine.play(pcm);
    engine.clear();
    engine.setMuted(true);
    expect(playback.posted).toEqual([{ type: 'audio', pcm }, { type: 'clear' }]);
    expect((capture as ReturnType<typeof fakeNode>).posted).toEqual([
      { type: 'mute', muted: true },
    ]);
    send(playback, { type: 'stats', underruns: 3 });
    send(playback, { type: 'stats' });
    send(playback, { type: 'other' });
    expect(engine.underruns).toBe(3);

    await engine.close();
    await engine.close(); // once
    expect(stop).toHaveBeenCalledTimes(1);
    engine.play(new ArrayBuffer(960));
    engine.clear();
    expect(playback.posted).toHaveLength(2); // nothing after close
  });

  it('a running context is not resumed', async () => {
    const f = fakePlatform('running');
    await createAudioEngine({ getTracks: () => [] } as unknown as MediaStream, f.platform);
    expect(f.context.resume).not.toHaveBeenCalled();
  });
});

describe('browserAudioPlatform', () => {
  it('asks for a 24 kHz context (falls back to the device rate) and builds real worklet nodes', async () => {
    const { browserAudioPlatform } = await import('./engine');
    const made: unknown[] = [];
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor(options: { sampleRate?: number }) {
          if (options.sampleRate && made.length === 0) {
            made.push('refused 24 kHz');
            throw new Error('NotSupportedError');
          }
          made.push(options);
        }
      },
    );
    vi.stubGlobal(
      'AudioWorkletNode',
      class {
        constructor(_ctx: unknown, name: string) {
          made.push(name);
        }
      },
    );
    const ctx = browserAudioPlatform.createContext();
    expect(made).toEqual(['refused 24 kHz', { latencyHint: 'interactive' }]);
    browserAudioPlatform.createContext();
    expect(made.at(-1)).toEqual({ sampleRate: 24_000, latencyHint: 'interactive' });
    browserAudioPlatform.createNode(ctx, 'cav-capture', {});
    expect(made.at(-1)).toBe('cav-capture');
    vi.unstubAllGlobals();
  });
});
