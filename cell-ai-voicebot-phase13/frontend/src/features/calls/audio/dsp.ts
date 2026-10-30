/**
 * Plain audio helpers shared by the worklets and the tests (no browser APIs).
 * The call protocol is PCM16 little-endian mono at 24 kHz in 20 ms frames
 * (480 samples = 960 bytes) — docs/conventions/websocket.md §8 (backend).
 */

export const CALL_SAMPLE_RATE = 24_000;
export const FRAME_SAMPLES = 480;
export const FRAME_BYTES = FRAME_SAMPLES * 2;

/** Average of the input channels (mic may be stereo). */
export const downmix = (channels: readonly Float32Array[]): Float32Array => {
  const first = channels[0];
  if (!first) return new Float32Array(0);
  if (channels.length === 1) return first;
  const out = new Float32Array(first.length);
  for (const channel of channels) {
    for (let i = 0; i < out.length; i += 1) out[i] = (out[i] as number) + (channel[i] as number);
  }
  for (let i = 0; i < out.length; i += 1) out[i] = (out[i] as number) / channels.length;
  return out;
};

/**
 * Streaming resampler (state kept between blocks). Downsampling averages each
 * output sample's input span — a cheap low-pass against aliasing; upsampling
 * interpolates linearly.
 */
export class Resampler {
  readonly fromRate: number;
  readonly toRate: number;
  private readonly step: number;
  private pending = new Float32Array(0);
  private pos = 0;

  constructor(fromRate: number, toRate: number) {
    this.fromRate = fromRate;
    this.toRate = toRate;
    this.step = fromRate / toRate;
  }

  process(input: Float32Array): Float32Array {
    if (this.fromRate === this.toRate) return input;
    const buf = new Float32Array(this.pending.length + input.length);
    buf.set(this.pending);
    buf.set(input, this.pending.length);
    const out: number[] = [];
    if (this.step > 1) {
      while (this.pos + this.step <= buf.length) {
        const start = Math.floor(this.pos);
        const end = Math.floor(this.pos + this.step);
        let sum = 0;
        for (let i = start; i < end; i += 1) sum += buf[i] as number;
        out.push(sum / (end - start));
        this.pos += this.step;
      }
    } else {
      while (Math.floor(this.pos) + 1 < buf.length) {
        const i = Math.floor(this.pos);
        const a = buf[i] as number;
        out.push(a + ((buf[i + 1] as number) - a) * (this.pos - i));
        this.pos += this.step;
      }
    }
    const keep = Math.floor(this.pos);
    this.pending = buf.slice(keep);
    this.pos -= keep;
    return Float32Array.from(out);
  }
}

/** Float [-1, 1] → PCM16 (clipped). */
export const floatToPcm16 = (input: Float32Array): Int16Array => {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const v = Math.max(-1, Math.min(1, input[i] as number));
    out[i] = v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff);
  }
  return out;
};

/** PCM16 → float [-1, 1]. */
export const pcm16ToFloat = (input: Int16Array): Float32Array => {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) out[i] = (input[i] as number) / 0x8000;
  return out;
};

/** RMS level 0–1 (mic meter). */
export const levelOf = (input: Float32Array): number => {
  if (!input.length) return 0;
  let sum = 0;
  for (const v of input) sum += v * v;
  return Math.min(1, Math.sqrt(sum / input.length));
};

/** Collects PCM16 samples and hands out exact 480-sample (960-byte) frames. */
export class Framer {
  private buffer = new Int16Array(FRAME_SAMPLES);
  private filled = 0;

  push(samples: Int16Array): ArrayBuffer[] {
    const frames: ArrayBuffer[] = [];
    let offset = 0;
    while (offset < samples.length) {
      const take = Math.min(FRAME_SAMPLES - this.filled, samples.length - offset);
      this.buffer.set(samples.subarray(offset, offset + take), this.filled);
      this.filled += take;
      offset += take;
      if (this.filled === FRAME_SAMPLES) {
        frames.push(this.buffer.buffer);
        this.buffer = new Int16Array(FRAME_SAMPLES);
        this.filled = 0;
      }
    }
    return frames;
  }

  reset(): void {
    this.filled = 0;
  }
}

/** Playback buffer: the reader gets silence on underrun (counted); `clear` drops everything. */
export class RingBuffer {
  private readonly data: Float32Array;
  private read = 0;
  private write = 0;
  private size = 0;
  underruns = 0;

  constructor(capacity: number) {
    this.data = new Float32Array(capacity);
  }

  get available(): number {
    return this.size;
  }

  /** Adds samples; when full the oldest are overwritten (never blocks the audio thread). */
  push(samples: Float32Array): void {
    for (const v of samples) {
      this.data[this.write] = v;
      this.write = (this.write + 1) % this.data.length;
      if (this.size === this.data.length) this.read = (this.read + 1) % this.data.length;
      else this.size += 1;
    }
  }

  /** Fills `out`; returns true when it had audio for all of it. */
  pull(out: Float32Array): boolean {
    const wanted = out.length;
    const n = Math.min(wanted, this.size);
    for (let i = 0; i < n; i += 1) {
      out[i] = this.data[this.read] as number;
      this.read = (this.read + 1) % this.data.length;
    }
    out.fill(0, n);
    this.size -= n;
    const full = n === wanted;
    // a short read in the middle of a reply is an underrun; an empty buffer is just silence
    if (!full && n > 0) this.underruns += 1;
    return full;
  }

  clear(): void {
    this.read = 0;
    this.write = 0;
    this.size = 0;
  }
}
