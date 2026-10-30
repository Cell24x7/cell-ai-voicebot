import { beforeAll, describe, expect, it } from 'vitest';

import { FRAME_BYTES } from './dsp';

/** Port of a fake AudioWorkletProcessor: records what the worklet posts. */
class FakePort {
  posted: { message: unknown; transfer?: unknown[] }[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage(message: unknown, transfer?: unknown[]) {
    this.posted.push({ message, ...(transfer ? { transfer } : {}) });
  }
  send(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data }));
  }
}

const registered = new Map<
  string,
  new () => { port: FakePort; process: (...a: unknown[]) => boolean }
>();

beforeAll(() => {
  // AudioWorkletGlobalScope stand-ins (48 kHz context: the capture worklet resamples)
  Object.assign(globalThis, {
    sampleRate: 48_000,
    AudioWorkletProcessor: class {
      port = new FakePort();
    },
    registerProcessor: (name: string, ctor: never) => registered.set(name, ctor),
  });
});

const load = async () => {
  await import('./capture.worklet');
  await import('./playback.worklet');
  const Capture = registered.get('cav-capture');
  const Playback = registered.get('cav-playback');
  if (!Capture || !Playback) throw new Error('worklets did not register');
  return { Capture, Playback };
};

describe('capture worklet', () => {
  it('turns 48 kHz mic blocks into 960-byte 24 kHz frames (transferred) and levels; muted → silent frames', async () => {
    const { Capture } = await load();
    const node = new Capture();
    expect(node.process([[]])).toBe(true); // no input yet
    const block = Float32Array.from({ length: 128 }, () => 0.5);
    for (let i = 0; i < 40; i += 1) node.process([[block, block]]);
    const frames = node.port.posted.filter((p) => (p.message as { type: string }).type === 'frame');
    expect(frames.length).toBe(5); // 40 × 64 samples = 2,560 → 5 frames of 480
    const first = frames[0]?.message as { frame: ArrayBuffer };
    expect(first.frame.byteLength).toBe(FRAME_BYTES);
    expect(frames[0]?.transfer).toEqual([first.frame]);
    expect(new Int16Array(first.frame)[10]).toBe(16384);
    const levels = node.port.posted.filter((p) => (p.message as { type: string }).type === 'level');
    expect((levels[0]?.message as { level: number }).level).toBeCloseTo(0.5);

    node.port.send({ type: 'mute', muted: true });
    node.port.send({ type: 'other' });
    node.port.posted = [];
    for (let i = 0; i < 40; i += 1) node.process([[block]]);
    const muted = node.port.posted.filter((p) => (p.message as { type: string }).type === 'frame');
    expect(muted.length).toBeGreaterThan(0);
    expect(
      new Int16Array((muted[0]?.message as { frame: ArrayBuffer }).frame).every((v) => v === 0),
    ).toBe(true);
    const mutedLevel = node.port.posted.find(
      (p) => (p.message as { type: string }).type === 'level',
    );
    expect((mutedLevel?.message as { level: number }).level).toBe(0);
  });
});

describe('playback worklet', () => {
  it('plays queued call audio at the context rate, reports underruns, clears on barge-in', async () => {
    const { Playback } = await load();
    const node = new Playback();
    const pcm = Int16Array.from({ length: 480 }, () => 16384);
    node.port.send({ type: 'audio', pcm: pcm.buffer });
    const out = [new Float32Array(128), new Float32Array(128)];
    expect(node.process([], [out])).toBe(true);
    expect(out[0]?.[50]).toBeCloseTo(0.5);
    expect(out[1]?.[50]).toBeCloseTo(0.5); // second channel copies the first
    // 480 samples at 24 kHz ≈ 960 at 48 kHz: drain until it runs short
    for (let i = 0; i < 8; i += 1) node.process([], [[new Float32Array(128)]]);
    const stats = node.port.posted.find((p) => (p.message as { type: string }).type === 'stats');
    expect(stats?.message).toMatchObject({ type: 'stats', underruns: 1 });

    node.port.send({ type: 'audio', pcm: pcm.buffer.slice(0) });
    node.port.send({ type: 'clear' });
    const after = new Float32Array(128);
    node.process([], [[after]]);
    expect(after.every((v) => v === 0)).toBe(true);
    expect(node.process([], [])).toBe(true); // no output channels
  });
});
