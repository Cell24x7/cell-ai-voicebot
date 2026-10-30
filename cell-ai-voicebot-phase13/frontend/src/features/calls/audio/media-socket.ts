/**
 * `/ws/media` client for one web test call (backend docs/conventions/websocket.md
 * §8): JSON control messages both ways, 960-byte PCM16 frames as binary.
 */

export type MediaServerMessage =
  | { type: 'call.config'; textInput: boolean; sampleRate: number; frameBytes: number }
  | {
      type: 'call.transcript';
      seq: number;
      speaker: 'customer' | 'bot' | 'agent';
      text: string;
      final: boolean;
      /** Finals: a barge-in cut this line. */
      interrupted?: boolean;
    }
  | { type: 'call.event'; event: { type: string; data: Record<string, unknown>; seq: number } }
  | { type: 'call.transfer'; phoneLast4: string }
  | { type: 'audio.clear' }
  | { type: 'wallet.empty_warning'; endsInSec: number }
  | { type: 'call.hold'; on: boolean }
  | { type: 'call.ended'; reason: string; durationSec: number; costMicros: number }
  | { type: 'error'; code: string };

export type MediaCloseReason =
  | 'normal'
  | 'ticket_invalid'
  | 'ticket_expired'
  | 'forbidden'
  | 'already_connected'
  | 'call_ended'
  | 'policy'
  | 'too_big'
  | 'server_shutdown'
  | 'connection_lost';

const CLOSE_CODES: Record<number, MediaCloseReason> = {
  1000: 'normal',
  1001: 'server_shutdown',
  1009: 'too_big',
  4001: 'ticket_invalid',
  4003: 'forbidden',
  4008: 'policy',
  4010: 'ticket_expired',
  4011: 'already_connected',
  4012: 'call_ended',
};

export const closeReasonOf = (code: number): MediaCloseReason =>
  CLOSE_CODES[code] ?? 'connection_lost';

/** What to tell the tester when the socket closed before a normal end. */
export const CLOSE_TEXT: Record<MediaCloseReason, string> = {
  normal: 'The call ended.',
  ticket_invalid: 'The call link was not accepted. Start a new call.',
  ticket_expired: 'The call link expired before the browser connected. Start a new call.',
  forbidden: 'This call belongs to someone else.',
  already_connected: 'This call is already open in another tab.',
  call_ended: 'This call has already ended.',
  policy: 'The connection was closed for sending invalid audio.',
  too_big: 'The connection was closed for sending a message that is too large.',
  server_shutdown: 'The server is restarting — the call was ended.',
  connection_lost: 'The connection to the server was lost.',
};

/** The WebSocket bits we use (tests pass a fake). */
export interface MediaWebSocketLike {
  binaryType: string;
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  send(data: string | ArrayBuffer): void;
  close(code?: number): void;
}

export type MediaWebSocketFactory = (url: string) => MediaWebSocketLike;

/** `ws(s)://…/ws/media?ticket=…` from the WS base (`VITE_WS_URL`) or the page origin. */
export const buildMediaUrl = (
  ticket: string,
  wsPath = '/ws/media',
  base: string | undefined = import.meta.env.VITE_WS_URL,
  location: Pick<Location, 'protocol' | 'host'> = window.location,
): string => {
  const root =
    base && base.trim() !== ''
      ? base.trim().replace(/\/+$/, '')
      : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  return `${root}${wsPath.replace(/^\/ws/, '')}?ticket=${encodeURIComponent(ticket)}`;
};

export interface MediaSocketHandlers {
  onMessage(message: MediaServerMessage): void;
  onAudio(frame: ArrayBuffer): void;
  onClose(reason: MediaCloseReason, code: number): void;
}

const OPEN = 1;

export class MediaSocket {
  private readonly ws: MediaWebSocketLike;
  private readonly handlers: MediaSocketHandlers;
  private closed = false;

  constructor(
    url: string,
    handlers: MediaSocketHandlers,
    factory: MediaWebSocketFactory = (u) => new WebSocket(u),
  ) {
    this.handlers = handlers;
    this.ws = factory(url);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onmessage = (event: MessageEvent) => {
      const data: unknown = event.data;
      if (typeof data === 'string') {
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          return; // not ours — ignore
        }
        if (parsed && typeof parsed === 'object' && 'type' in parsed) {
          this.handlers.onMessage(parsed as MediaServerMessage);
        }
      } else if (data instanceof ArrayBuffer) {
        this.handlers.onAudio(data);
      }
    };
    this.ws.onclose = (event: CloseEvent) => {
      if (this.closed) return;
      this.closed = true;
      this.handlers.onClose(closeReasonOf(event.code), event.code);
    };
  }

  /** Resolves when the socket is open; rejects when it closes first. */
  opened(): Promise<void> {
    if (this.ws.readyState === OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const previousClose = this.ws.onclose;
      this.ws.onopen = () => resolve();
      this.ws.onclose = (event: CloseEvent) => {
        previousClose?.call(this.ws, event);
        reject(new Error(closeReasonOf(event.code)));
      };
    });
  }

  get open(): boolean {
    return !this.closed && this.ws.readyState === OPEN;
  }

  private control(message: Record<string, unknown>): void {
    if (this.open) this.ws.send(JSON.stringify(message));
  }

  sendFrame(frame: ArrayBuffer): void {
    if (this.open) this.ws.send(frame);
  }

  /** Microphone ready = the call is answered. */
  ready(sampleRate = 24_000): void {
    this.control({ type: 'call.ready', sampleRate });
  }

  dtmf(digit: string): void {
    this.control({ type: 'call.dtmf', digit });
  }

  mute(muted: boolean): void {
    this.control({ type: 'call.mute', muted });
  }

  transferResult(result: 'connected' | 'failed' | 'no_answer'): void {
    this.control({ type: 'call.transfer_result', result });
  }

  /** Dev / tests only (the server says so in `call.config.textInput`). */
  sayText(text: string): void {
    this.control({ type: 'call.say_text', text });
  }

  hangup(): void {
    this.control({ type: 'call.hangup' });
  }

  /** Closes without a server reason (page leaves, cleanup). */
  close(): void {
    this.closed = true;
    if (this.ws.readyState <= OPEN) this.ws.close(1000);
  }
}
