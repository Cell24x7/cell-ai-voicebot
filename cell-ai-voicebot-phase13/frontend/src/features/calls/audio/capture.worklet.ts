/**
 * Microphone → call frames, inside the AudioWorklet thread: downmix, resample
 * to 24 kHz, PCM16, exact 960-byte frames posted to the main thread
 * (transferred, no copy) + a level every 100 ms for the meter. Muted → silent
 * frames (the server counts them as silence; no mic audio leaves the page).
 */
import { CALL_SAMPLE_RATE, downmix, floatToPcm16, Framer, levelOf, Resampler } from './dsp';

// AudioWorkletGlobalScope (module-local: these names don't exist on the main thread)
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

export type CaptureMessage =
  { type: 'frame'; frame: ArrayBuffer } | { type: 'level'; level: number };

export class CaptureProcessor extends AudioWorkletProcessor {
  private readonly resampler = new Resampler(sampleRate, CALL_SAMPLE_RATE);
  private readonly framer = new Framer();
  private muted = false;
  private peak = 0;
  private counted = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<{ type?: string; muted?: boolean }>) => {
      if (event.data.type !== 'mute') return;
      this.muted = Boolean(event.data.muted);
      // drop the half-filled frame: no audio from before the mute goes out after it
      if (this.muted) {
        this.framer.reset();
        this.peak = 0;
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!input?.length) return true;
    const mono = downmix(input);
    this.peak = Math.max(this.peak, this.muted ? 0 : levelOf(mono));
    this.counted += mono.length;
    if (this.counted >= sampleRate / 10) {
      this.port.postMessage({ type: 'level', level: this.peak } satisfies CaptureMessage);
      this.peak = 0;
      this.counted = 0;
    }
    const resampled = this.resampler.process(mono);
    const pcm = this.muted ? new Int16Array(resampled.length) : floatToPcm16(resampled);
    for (const frame of this.framer.push(pcm)) {
      this.port.postMessage({ type: 'frame', frame } satisfies CaptureMessage, [frame]);
    }
    return true;
  }
}

registerProcessor('cav-capture', CaptureProcessor);
