import { describe, expect, it } from 'vitest';

import {
  CALL_SAMPLE_RATE,
  downmix,
  floatToPcm16,
  FRAME_BYTES,
  FRAME_SAMPLES,
  Framer,
  levelOf,
  pcm16ToFloat,
  Resampler,
  RingBuffer,
} from './dsp';

const sine = (hz: number, rate: number, samples: number, start = 0) =>
  Float32Array.from(
    { length: samples },
    (_, i) => Math.sin((2 * Math.PI * hz * (start + i)) / rate) * 0.5,
  );

describe('downmix', () => {
  it('averages channels; mono passes through; no input is empty', () => {
    const l = Float32Array.from([1, 0, -1]);
    const r = Float32Array.from([0, 0, 1]);
    expect([...downmix([l, r])]).toEqual([0.5, 0, 0]);
    expect(downmix([l])).toBe(l);
    expect(downmix([])).toHaveLength(0);
  });
});

describe('Resampler', () => {
  it('48 kHz → 24 kHz: half the samples, the tone survives, blocks join without gaps', () => {
    const r = new Resampler(48_000, CALL_SAMPLE_RATE);
    const input = sine(440, 48_000, 48_000);
    let out: number[] = [];
    for (let i = 0; i < input.length; i += 128)
      out = out.concat([...r.process(input.subarray(i, i + 128))]);
    expect(out.length).toBeGreaterThanOrEqual(23_990);
    expect(out.length).toBeLessThanOrEqual(24_000);
    const expected = sine(440, 24_000, out.length);
    // averaging pairs shifts the phase by half an input sample — compare loosely
    const err = out.reduce((n, v, i) => n + Math.abs(v - (expected[i] ?? 0)), 0) / out.length;
    expect(err).toBeLessThan(0.02);
  });

  it('44.1 kHz → 24 kHz keeps the rate ratio across odd block sizes', () => {
    const r = new Resampler(44_100, CALL_SAMPLE_RATE);
    let total = 0;
    for (let i = 0; i < 100; i += 1) total += r.process(new Float32Array(441)).length;
    expect(Math.abs(total - 24_000)).toBeLessThanOrEqual(1);
  });

  it('24 kHz → 48 kHz interpolates; same rate passes through', () => {
    const up = new Resampler(CALL_SAMPLE_RATE, 48_000);
    const a = up.process(Float32Array.from([0, 1]));
    const b = up.process(Float32Array.from([0]));
    expect([...a, ...b].map((v) => Number(v.toFixed(2)))).toEqual([0, 0.5, 1, 0.5]);
    const same = new Resampler(24_000, 24_000);
    const block = Float32Array.from([0.1, 0.2]);
    expect(same.process(block)).toBe(block);
  });
});

describe('PCM16 conversion and level', () => {
  it('clips, rounds and converts both ways', () => {
    expect([...floatToPcm16(Float32Array.from([0, 1, -1, 2, -2, 0.5]))]).toEqual([
      0, 32767, -32768, 32767, -32768, 16384,
    ]);
    expect([...pcm16ToFloat(Int16Array.from([0, -32768, 16384]))]).toEqual([0, -1, 0.5]);
  });

  it('RMS level, capped at 1; silence and empty are 0', () => {
    expect(levelOf(new Float32Array(10))).toBe(0);
    expect(levelOf(new Float32Array(0))).toBe(0);
    expect(levelOf(Float32Array.from([0.5, -0.5]))).toBeCloseTo(0.5);
    expect(levelOf(Float32Array.from([3, 3]))).toBe(1);
  });
});

describe('Framer', () => {
  it('hands out exact 960-byte frames whatever the block sizes', () => {
    const f = new Framer();
    expect(f.push(new Int16Array(300))).toHaveLength(0);
    const frames = f.push(Int16Array.from({ length: 700 }, (_, i) => i));
    expect(frames).toHaveLength(2);
    expect(frames.every((x) => x.byteLength === FRAME_BYTES)).toBe(true);
    expect(new Int16Array(frames[1] ?? new ArrayBuffer(0))[0]).toBe(FRAME_SAMPLES - 300);
    f.reset();
    expect(f.push(new Int16Array(FRAME_SAMPLES))).toHaveLength(1);
  });
});

describe('RingBuffer', () => {
  it('plays what was pushed, pads silence, counts underruns mid-reply, overwrites when full, clears', () => {
    const ring = new RingBuffer(4);
    const out = new Float32Array(3);
    expect(ring.pull(out)).toBe(false); // empty: silence, not an underrun
    expect(ring.underruns).toBe(0);
    ring.push(Float32Array.from([1, 2]));
    expect(ring.available).toBe(2);
    expect(ring.pull(out)).toBe(false);
    expect([...out]).toEqual([1, 2, 0]);
    expect(ring.underruns).toBe(1);
    ring.push(Float32Array.from([1, 2, 3, 4, 5, 6]));
    expect(ring.available).toBe(4);
    const four = new Float32Array(4);
    expect(ring.pull(four)).toBe(true);
    expect([...four]).toEqual([3, 4, 5, 6]);
    ring.push(Float32Array.from([7]));
    ring.clear();
    expect(ring.available).toBe(0);
  });
});
