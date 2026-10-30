import type { Call, CallEvent, CallTranscriptTurn } from '@/services/api/types';

/** A finished flow test call (override what the test needs). */
export const fakeCall = (overrides: Partial<Call> = {}): Call => ({
  id: 'c1',
  direction: 'outbound',
  provider: 'webcall',
  mode: 'ai',
  agentUserId: null,
  whatsapp: null,
  isTest: true,
  charged: true,
  campaign: null,
  status: 'completed',
  endReason: 'hangup_node',
  source: { kind: 'flow', flowId: 'f1', flowVersionRef: 1, agentId: null, name: 'Loan recovery' },
  contact: { id: 'k1', name: 'Asha Verma' },
  startedBy: { id: 'u1', name: 'Demo Owner' },
  timestamps: {
    queuedAt: '2026-10-15T10:00:00.000Z',
    ringingAt: '2026-10-15T10:00:01.000Z',
    answeredAt: '2026-10-15T10:00:02.000Z',
    endedAt: '2026-10-15T10:00:28.000Z',
  },
  durationSec: 26,
  variables: { name: 'Asha Verma' },
  outcome: { disposition: 'paid' },
  disposition: 'paid',
  dispositionSource: null,
  insights: null,
  languageDetected: 'hi',
  metrics: {
    latency: { p50Ms: 820, p95Ms: 1400, maxMs: 1600, samples: 4 },
    bargeIns: 1,
    silencePrompts: 0,
    aiSeconds: 0,
    ttsChars: 300,
    ttsCachedChars: 120,
  },
  cost: {
    telephonyMicros: 0,
    aiMicros: 0,
    ttsMicros: 600_000,
    commissionMicros: 295_000,
    totalMicros: 895_000,
  },
  recording: { durationSec: 26, sizeBytes: 793_004, deletedAt: null },
  flowRunId: 'r1',
  error: null,
  createdAt: '2026-10-15T10:00:00.000Z',
  ...overrides,
});

export const fakeTranscript = (): CallTranscriptTurn[] => [
  {
    seq: 1,
    speaker: 'bot',
    text: 'Yeh call quality ke liye record ki ja rahi hai.',
    language: null,
    startMs: 0,
    endMs: 2800,
    interrupted: false,
    source: 'system',
  },
  {
    seq: 2,
    speaker: 'customer',
    text: '[1]',
    language: null,
    startMs: 9000,
    endMs: 9000,
    interrupted: false,
    source: 'dtmf',
  },
  {
    seq: 3,
    speaker: 'bot',
    text: 'Dhanyavaad, namaste.',
    language: 'hi',
    startMs: 12_000,
    endMs: 13_000,
    interrupted: true,
    source: 'tts',
  },
];

export const fakeEvents = (): CallEvent[] => [
  { seq: 1, type: 'status', data: { status: 'ringing' }, at: '2026-10-15T10:00:01.000Z' },
  {
    seq: 2,
    type: 'node_entered',
    data: { nodeId: 'greet', type: 'speak' },
    at: '2026-10-15T10:00:03.000Z',
  },
  { seq: 3, type: 'latency', data: { ms: 820 }, at: '2026-10-15T10:00:10.000Z' },
];

/** In-memory `/ws/media` socket: tests play the server side. */
export class FakeMediaWs {
  static instances: FakeMediaWs[] = [];
  binaryType = 'blob';
  readyState = 0;
  sent: (string | ArrayBuffer)[] = [];
  closedWith: number | undefined;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    FakeMediaWs.instances.push(this);
  }
  static last(): FakeMediaWs {
    const ws = FakeMediaWs.instances.at(-1);
    if (!ws) throw new Error('no media socket');
    return ws;
  }
  send(data: string | ArrayBuffer) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closedWith = code;
    this.readyState = 3;
  }
  serverOpen() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }
  serverSend(data: unknown) {
    this.onmessage?.(
      new MessageEvent('message', {
        data: data instanceof ArrayBuffer || typeof data === 'string' ? data : JSON.stringify(data),
      }),
    );
  }
  serverClose(code: number) {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close', { code }));
  }
  controls(): Record<string, unknown>[] {
    return this.sent
      .filter((d): d is string => typeof d === 'string')
      .map((d) => JSON.parse(d) as Record<string, unknown>);
  }
}

/** Audio engine double: records playback, lets tests push mic frames / levels. */
export const fakeAudioEngine = () => {
  const frameFns: ((f: ArrayBuffer) => void)[] = [];
  const levelFns: ((l: number) => void)[] = [];
  const played: ArrayBuffer[] = [];
  const calls = { clear: 0, muted: [] as boolean[], closed: 0 };
  const engine = {
    sampleRate: 24_000,
    underruns: 0,
    onFrame: (fn: (f: ArrayBuffer) => void) => frameFns.push(fn),
    onLevel: (fn: (l: number) => void) => levelFns.push(fn),
    play: (pcm: ArrayBuffer) => played.push(pcm),
    clear: () => {
      calls.clear += 1;
    },
    setMuted: (m: boolean) => calls.muted.push(m),
    setInputDevice: () => Promise.resolve(),
    close: () => {
      calls.closed += 1;
      return Promise.resolve();
    },
  };
  return {
    engine,
    played,
    calls,
    micFrame: (f = new ArrayBuffer(960)) => frameFns.forEach((fn) => fn(f)),
    micLevel: (l: number) => levelFns.forEach((fn) => fn(l)),
  };
};
