import type { WebSocketLike } from '@/services/realtime/ws-client';

/** In-memory WebSocket for RealtimeClient tests. `FakeWebSocket.instances` = every socket created. */
export class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];

  static reset(): void {
    FakeWebSocket.instances = [];
  }

  static last(): FakeWebSocket {
    const ws = FakeWebSocket.instances.at(-1);
    if (!ws) throw new Error('no FakeWebSocket created');
    return ws;
  }

  readonly url: string;
  readyState = 0;
  sent: unknown[] = [];
  closedWith: number | undefined;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(code = 1000): void {
    this.closedWith = code;
    this.readyState = 3;
  }

  // ── server side ──
  serverOpen(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  serverMessage(data: unknown): void {
    this.onmessage?.(
      new MessageEvent('message', { data: typeof data === 'string' ? data : JSON.stringify(data) }),
    );
  }

  serverClose(code: number): void {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close', { code }));
  }

  sentOfType(type: string): unknown[] {
    return this.sent.filter((m) => (m as { type?: string }).type === type);
  }
}
