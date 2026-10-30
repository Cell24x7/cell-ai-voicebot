import {
  WS_CLOSE,
  WS_EVENT_TYPES,
  type WsClientMessage,
  type WsEvent,
  type WsEventEnvelope,
  type WsEventType,
} from './events';
import { buildWsUrl } from './url';

/** docs/conventions/websocket.md §6 and §11. */
export const PING_INTERVAL_MS = 25_000;
export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_MAX_MS = 30_000;
export const MAX_AUTH_FAILURES = 3;
const DEDUPE_WINDOW = 200;
const OPEN = 1;

export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';
export type RealtimeError = 'forbidden' | 'unauthorized' | 'ticket_unavailable';

/** The subset of the browser WebSocket the client uses (tests pass a fake). */
export interface WebSocketLike {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type WebSocketFactory = new (url: string) => WebSocketLike;

type EventTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;

export interface RealtimeClientOptions {
  /** Returns a fresh single-use ticket (`POST /api/v1/ws/tickets`, Phase 2). */
  getTicket: () => Promise<string>;
  url?: (ticket: string) => string;
  WebSocketImpl?: WebSocketFactory;
  /** Jitter source — injectable for tests. */
  random?: () => number;
  /** Called when a connection is re-established — refetch the screen data. */
  onReconnected?: () => void;
  logger?: Pick<Console, 'debug' | 'warn'>;
  /** Source of the browser `online` event (window). */
  eventTarget?: EventTarget;
}

const KNOWN_TYPES = new Set<string>(WS_EVENT_TYPES);

const isPong = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'pong';

const isEnvelope = (value: unknown): value is WsEventEnvelope =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { id?: unknown }).id === 'string' &&
  typeof (value as { type?: unknown }).type === 'string';

/**
 * Framework-agnostic `/ws/events` client: ticket per connection, ping every
 * 25 s, full-jitter reconnect (1 s → 30 s), close-code handling, ref-counted
 * topics re-sent after reconnect, event de-duplication by id.
 */
export class RealtimeClient {
  private readonly options: Required<
    Pick<RealtimeClientOptions, 'getTicket' | 'url' | 'random' | 'logger'>
  > &
    Pick<RealtimeClientOptions, 'onReconnected' | 'WebSocketImpl' | 'eventTarget'>;

  private ws: WebSocketLike | undefined;
  private status: RealtimeStatus = 'idle';
  private lastError: RealtimeError | undefined;
  private attempt = 0;
  private authFailures = 0;
  /** True once a connection was verified (server answered) — later ones are reconnects. */
  private everVerified = false;
  private verified = false;
  private stopped = true;
  /** Bumped on every connect/disconnect so stale async work is ignored. */
  private generation = 0;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private listeningOnline = false;

  private readonly topics = new Map<string, number>();
  private readonly handlers = new Map<string, Set<(event: WsEventEnvelope) => void>>();
  private readonly anyHandlers = new Set<(event: WsEventEnvelope) => void>();
  private readonly statusListeners = new Set<() => void>();
  private readonly seenIds = new Set<string>();
  private readonly seenOrder: string[] = [];

  constructor(options: RealtimeClientOptions) {
    this.options = {
      getTicket: options.getTicket,
      url: options.url ?? ((ticket) => buildWsUrl(ticket)),
      random: options.random ?? Math.random,
      logger: options.logger ?? console,
      onReconnected: options.onReconnected,
      WebSocketImpl: options.WebSocketImpl,
      eventTarget: options.eventTarget ?? (typeof window === 'undefined' ? undefined : window),
    };
  }

  getStatus(): RealtimeStatus {
    return this.status;
  }

  getLastError(): RealtimeError | undefined {
    return this.lastError;
  }

  /** Subscribe to status changes (for `useSyncExternalStore`). */
  onStatus(listener: () => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  connect(): void {
    if (!this.stopped && this.status !== 'idle' && this.status !== 'closed') return;
    this.stopped = false;
    this.attempt = 0;
    this.authFailures = 0;
    this.lastError = undefined;
    this.listenOnline(true);
    void this.open();
  }

  /** Closes with 1000 and stops reconnecting. `connect()` may be called again. */
  disconnect(): void {
    this.stopped = true;
    this.generation += 1;
    this.clearTimers();
    this.listenOnline(false);
    const ws = this.ws;
    this.ws = undefined;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      ws.close(WS_CLOSE.normal, 'client disconnect');
    }
    this.setStatus('closed');
  }

  /** Ref-counted topic subscription; returns the matching unsubscribe. */
  subscribe(topic: string): () => void {
    const count = (this.topics.get(topic) ?? 0) + 1;
    this.topics.set(topic, count);
    if (count === 1) this.send({ type: 'subscribe', topics: [topic] });
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.unsubscribe(topic);
    };
  }

  /** Typed handler for one event type; returns `off`. */
  on<K extends WsEventType>(type: K, handler: (event: WsEvent<K>) => void): () => void {
    const set = this.handlers.get(type) ?? new Set();
    const wrapped = handler as (event: WsEventEnvelope) => void;
    set.add(wrapped);
    this.handlers.set(type, set);
    return () => set.delete(wrapped);
  }

  /** Every event, including unknown types (DEV tooling). */
  onAny(handler: (event: WsEventEnvelope) => void): () => void {
    this.anyHandlers.add(handler);
    return () => this.anyHandlers.delete(handler);
  }

  private unsubscribe(topic: string): void {
    const count = (this.topics.get(topic) ?? 0) - 1;
    if (count > 0) {
      this.topics.set(topic, count);
      return;
    }
    this.topics.delete(topic);
    this.send({ type: 'unsubscribe', topics: [topic] });
  }

  private async open(): Promise<void> {
    const generation = ++this.generation;
    if (this.status !== 'reconnecting') this.setStatus('connecting');

    let ticket: string;
    try {
      ticket = await this.options.getTicket();
    } catch {
      if (generation !== this.generation || this.stopped) return;
      this.lastError = 'ticket_unavailable';
      this.setStatus('idle');
      return;
    }
    if (generation !== this.generation || this.stopped) return;

    const Impl: WebSocketFactory = this.options.WebSocketImpl ?? WebSocket;
    const ws = new Impl(this.options.url(ticket));
    this.ws = ws;
    this.verified = false;

    ws.onopen = () => {
      if (generation !== this.generation) return;
      this.setStatus('open');
      const topics = [...this.topics.keys()];
      if (topics.length) this.send({ type: 'subscribe', topics });
      // Immediate ping: the pong proves the ticket was accepted.
      this.send({ type: 'ping' });
      this.pingTimer = setInterval(() => this.send({ type: 'ping' }), PING_INTERVAL_MS);
    };
    ws.onmessage = (event: MessageEvent) => {
      if (generation !== this.generation) return;
      this.handleMessage(event.data);
    };
    ws.onerror = () => {
      // A close event always follows; nothing to do here.
    };
    ws.onclose = (event: CloseEvent) => {
      if (generation !== this.generation) return;
      this.handleClose(event.code);
    };
  }

  private markVerified(): void {
    if (this.verified) return;
    this.verified = true;
    this.attempt = 0;
    this.authFailures = 0;
    this.lastError = undefined;
    if (this.everVerified) this.options.onReconnected?.();
    this.everVerified = true;
  }

  private handleMessage(raw: unknown): void {
    let message: unknown;
    try {
      message = JSON.parse(String(raw));
    } catch {
      this.options.logger.debug('realtime: ignored non-JSON message');
      return;
    }
    this.markVerified();
    if (isPong(message)) return;
    if (!isEnvelope(message)) {
      this.options.logger.debug('realtime: ignored message without id/type');
      return;
    }
    if (this.seenIds.has(message.id)) return;
    this.remember(message.id);

    for (const handler of this.anyHandlers) handler(message);
    if (!KNOWN_TYPES.has(message.type)) {
      this.options.logger.debug(`realtime: unknown event type "${message.type}"`);
      return;
    }
    for (const handler of this.handlers.get(message.type) ?? []) handler(message);
  }

  private handleClose(code: number): void {
    this.clearTimers();
    this.ws = undefined;
    if (this.stopped) return;

    switch (code) {
      case WS_CLOSE.normal:
        this.setStatus('closed');
        return;
      case WS_CLOSE.forbidden:
        this.lastError = 'forbidden';
        this.setStatus('closed');
        return;
      case WS_CLOSE.unauthorized:
      case WS_CLOSE.ticketExpired:
        this.authFailures += 1;
        if (this.authFailures >= MAX_AUTH_FAILURES) {
          this.lastError = 'unauthorized';
          this.setStatus('closed');
          return;
        }
        this.scheduleReconnect();
        return;
      case WS_CLOSE.tooManyConnections:
        this.scheduleReconnect(RECONNECT_MAX_MS);
        return;
      default:
        this.scheduleReconnect();
    }
  }

  /** Full jitter: random() × min(30 s, 1 s × 2^attempt). */
  private scheduleReconnect(fixedDelayMs?: number): void {
    this.setStatus('reconnecting');
    const cap = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.attempt);
    const delay = fixedDelayMs ?? Math.round(this.options.random() * cap);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.open();
    }, delay);
  }

  private readonly handleOnline = (): void => {
    if (this.stopped) return;
    const waiting = this.status === 'reconnecting' && this.reconnectTimer !== undefined;
    const ticketFailed = this.status === 'idle' && this.lastError === 'ticket_unavailable';
    if (!waiting && !ticketFailed) return;
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.attempt = 0;
    void this.open();
  };

  private listenOnline(on: boolean): void {
    const target = this.options.eventTarget;
    if (!target || on === this.listeningOnline) return;
    if (on) target.addEventListener('online', this.handleOnline);
    else target.removeEventListener('online', this.handleOnline);
    this.listeningOnline = on;
  }

  private send(message: WsClientMessage): void {
    if (this.ws?.readyState === OPEN) this.ws.send(JSON.stringify(message));
  }

  private remember(id: string): void {
    this.seenIds.add(id);
    this.seenOrder.push(id);
    if (this.seenOrder.length > DEDUPE_WINDOW) {
      const oldest = this.seenOrder.shift();
      if (oldest !== undefined) this.seenIds.delete(oldest);
    }
  }

  private clearTimers(): void {
    if (this.pingTimer !== undefined) clearInterval(this.pingTimer);
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.pingTimer = undefined;
    this.reconnectTimer = undefined;
  }

  private setStatus(status: RealtimeStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener();
  }
}
