/**
 * Call audio → speaker, inside the AudioWorklet thread: 24 kHz PCM16 frames
 * from the main thread are resampled to the context rate into a ring buffer
 * (≈ 10 s); the output reads it (silence on underrun, counted). `clear` drops
 * everything at once (barge-in).
 */
import { CALL_SAMPLE_RATE, pcm16ToFloat, Resampler, RingBuffer } from './dsp';

// AudioWorkletGlobalScope (module-local: these names don't exist on the main thread)
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

export type PlaybackCommand = { type: 'audio'; pcm: ArrayBuffer } | { type: 'clear' };
export type PlaybackReport = { type: 'stats'; underruns: number; buffered: number };

export class PlaybackProcessor extends AudioWorkletProcessor {
  private readonly ring = new RingBuffer(sampleRate * 10);
  private resampler = new Resampler(CALL_SAMPLE_RATE, sampleRate);
  private reported = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<PlaybackCommand>) => {
      const command = event.data;
      if (command.type === 'audio') {
        this.ring.push(this.resampler.process(pcm16ToFloat(new Int16Array(command.pcm))));
      } else {
        this.ring.clear();
        this.resampler = new Resampler(CALL_SAMPLE_RATE, sampleRate);
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const channels = outputs[0] ?? [];
    const first = channels[0];
    if (!first) return true;
    this.ring.pull(first);
    for (const channel of channels.slice(1)) channel.set(first);
    if (this.ring.underruns !== this.reported) {
      this.reported = this.ring.underruns;
      this.port.postMessage({
        type: 'stats',
        underruns: this.ring.underruns,
        buffered: this.ring.available,
      } satisfies PlaybackReport);
    }
    return true;
  }
}

registerProcessor('cav-playback', PlaybackProcessor);
