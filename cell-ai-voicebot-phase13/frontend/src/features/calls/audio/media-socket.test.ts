import { describe, expect, it, vi } from 'vitest';

import {
  buildMediaUrl,
  CLOSE_TEXT,
  closeReasonOf,
  MediaSocket,
  type MediaSocketHandlers,
  type MediaWebSocketLike,
} from './media-socket';

class FakeMediaWs implements MediaWebSocketLike {
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
    this.onmessage?.(new MessageEvent('message', { data }));
  }
  serverClose(code: number) {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close', { code }));
  }
  controls() {
    return this.sent
      .filter((d): d is string => typeof d === 'string')
      .map((d) => JSON.parse(d) as unknown);
  }
}

const setup = () => {
  let ws: FakeMediaWs | null = null;
  const handlers = {
    onMessage: vi.fn(),
    onAudio: vi.fn(),
    onClose: vi.fn(),
  } satisfies MediaSocketHandlers;
  const socket = new MediaSocket(
    'ws://x/ws/media?ticket=t',
    handlers,
    (url) => (ws = new FakeMediaWs(url)),
  );
  if (!ws) throw new Error('no socket');
  return { socket, ws: ws as FakeMediaWs, handlers };
};

describe('buildMediaUrl', () => {
  it('uses the WS base or the page origin, appends the media path and the ticket', () => {
    expect(buildMediaUrl('wst_a b', '/ws/media', 'ws://localhost:3100/ws/')).toBe(
      'ws://localhost:3100/ws/media?ticket=wst_a%20b',
    );
    expect(buildMediaUrl('t', '/ws/media', '', { protocol: 'https:', host: 'app.example' })).toBe(
      'wss://app.example/ws/media?ticket=t',
    );
    expect(buildMediaUrl('t', undefined, '', { protocol: 'http:', host: 'localhost:3150' })).toBe(
      'ws://localhost:3150/ws/media?ticket=t',
    );
  });
});

describe('closeReasonOf', () => {
  it('maps the media close codes; anything else is a lost connection', () => {
    expect(closeReasonOf(4011)).toBe('already_connected');
    expect(closeReasonOf(4012)).toBe('call_ended');
    expect(closeReasonOf(4010)).toBe('ticket_expired');
    expect(closeReasonOf(1001)).toBe('server_shutdown');
    expect(closeReasonOf(1006)).toBe('connection_lost');
    expect(CLOSE_TEXT.connection_lost).toMatch(/lost/);
  });
});

describe('MediaSocket', () => {
  it('opens, sends controls and frames only while open, parses messages and audio', async () => {
    const { socket, ws, handlers } = setup();
    expect(ws.binaryType).toBe('arraybuffer');
    socket.ready(); // not open yet: dropped
    const opened = socket.opened();
    ws.serverOpen();
    await opened;
    await socket.opened(); // already open
    expect(socket.open).toBe(true);
    socket.ready();
    socket.dtmf('5');
    socket.mute(true);
    socket.transferResult('no_answer');
    socket.sayText('maine pay kar diya');
    socket.hangup();
    socket.sendFrame(new ArrayBuffer(960));
    expect(ws.controls()).toEqual([
      { type: 'call.ready', sampleRate: 24000 },
      { type: 'call.dtmf', digit: '5' },
      { type: 'call.mute', muted: true },
      { type: 'call.transfer_result', result: 'no_answer' },
      { type: 'call.say_text', text: 'maine pay kar diya' },
      { type: 'call.hangup' },
    ]);
    expect(ws.sent.filter((d) => d instanceof ArrayBuffer)).toHaveLength(1);

    ws.serverSend(
      JSON.stringify({ type: 'call.config', textInput: true, sampleRate: 24000, frameBytes: 960 }),
    );
    ws.serverSend('not json');
    ws.serverSend(JSON.stringify({ no: 'type' }));
    ws.serverSend(JSON.stringify(null));
    const frame = new ArrayBuffer(960);
    ws.serverSend(frame);
    ws.serverSend(new Blob(['x'])); // not an ArrayBuffer: ignored
    expect(handlers.onMessage).toHaveBeenCalledTimes(1);
    expect(handlers.onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'call.config' }),
    );
    expect(handlers.onAudio).toHaveBeenCalledWith(frame);

    ws.serverClose(4012);
    ws.serverClose(4012); // reported once
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
    expect(handlers.onClose).toHaveBeenCalledWith('call_ended', 4012);
    expect(socket.open).toBe(false);
  });

  it('opened() rejects when the server refuses the ticket; close() needs no server', async () => {
    const refused = setup();
    const opened = refused.socket.opened();
    refused.ws.serverClose(4001);
    await expect(opened).rejects.toThrow('ticket_invalid');
    expect(refused.handlers.onClose).toHaveBeenCalledWith('ticket_invalid', 4001);

    const mine = setup();
    mine.ws.serverOpen();
    mine.socket.close();
    expect(mine.ws.closedWith).toBe(1000);
    mine.ws.serverClose(1000);
    expect(mine.handlers.onClose).not.toHaveBeenCalled(); // closed on purpose
    mine.socket.close(); // already closed: no second close
    expect(mine.ws.closedWith).toBe(1000);
  });
});

describe('MediaSocket default WebSocket', () => {
  it('uses the browser WebSocket when no factory is given', () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'WebSocket',
      class extends FakeMediaWs {
        constructor(url: string) {
          super(url);
          urls.push(url);
        }
      },
    );
    const socket = new MediaSocket('ws://x/ws/media?ticket=t', {
      onMessage: vi.fn(),
      onAudio: vi.fn(),
      onClose: vi.fn(),
    });
    expect(urls).toEqual(['ws://x/ws/media?ticket=t']);
    expect(socket.open).toBe(false);
    vi.unstubAllGlobals();
  });
});
