import { create } from 'zustand';

import type { WsEventMap } from '@/services/realtime/events';

export type LivePhase =
  'starting' | 'connecting' | 'ringing' | 'in_call' | 'ending' | 'ended' | 'failed';

/** The WhatsApp call this browser is on (agent) or watching (AI call it placed). */
export interface ActiveWaCall {
  callId: string | null;
  mode: 'human' | 'ai';
  direction: 'outbound' | 'inbound';
  /** Contact name or number (never logged). */
  label: string;
  conversationId: string | null;
  phase: LivePhase;
  /** Epoch ms of the answer (timer). */
  answeredAt: number | null;
  muted: boolean;
  held: boolean;
  /** The agent's microphone level 0–1 (rounded). */
  level: number;
  /** Packets / socket health: `good` | `poor` (frames late) | `lost` (reconnecting). */
  network: 'good' | 'poor' | 'lost';
  recording: boolean;
  failure: string | null;
  walletEndsInSec: number | null;
  ended: { reason: string; durationSec: number } | null;
}

export type IncomingRing = WsEventMap['whatsapp.call.incoming'] & {
  /** Someone else answered — the popup says so, then closes. */
  takenBy: string | null;
  /** This user declined / it stopped ringing. */
  gone: boolean;
};

interface LiveCallState {
  active: ActiveWaCall | null;
  incoming: IncomingRing[];
  setActive: (call: ActiveWaCall | null) => void;
  patchActive: (patch: Partial<ActiveWaCall>) => void;
  ring: (event: WsEventMap['whatsapp.call.incoming']) => void;
  taken: (callId: string, by: string) => void;
  stopRinging: (callId: string) => void;
  dismiss: (callId: string) => void;
}

export const useLiveCallStore = create<LiveCallState>((set) => ({
  active: null,
  incoming: [],
  setActive: (active) => set({ active }),
  patchActive: (patch) => set((s) => (s.active ? { active: { ...s.active, ...patch } } : s)),
  ring: (event) =>
    set((s) =>
      s.incoming.some((r) => r.callId === event.callId)
        ? s
        : { incoming: [...s.incoming, { ...event, takenBy: null, gone: false }] },
    ),
  taken: (callId, by) =>
    set((s) => ({
      incoming: s.incoming.map((r) => (r.callId === callId ? { ...r, takenBy: by } : r)),
    })),
  stopRinging: (callId) =>
    set((s) => ({
      incoming: s.incoming.map((r) => (r.callId === callId ? { ...r, gone: true } : r)),
    })),
  dismiss: (callId) => set((s) => ({ incoming: s.incoming.filter((r) => r.callId !== callId) })),
}));

export const newActiveCall = (input: {
  mode: 'human' | 'ai';
  direction: 'outbound' | 'inbound';
  label: string;
  conversationId: string | null;
  callId?: string | null;
}): ActiveWaCall => ({
  callId: input.callId ?? null,
  mode: input.mode,
  direction: input.direction,
  label: input.label,
  conversationId: input.conversationId,
  phase: 'starting',
  answeredAt: null,
  muted: false,
  held: false,
  level: 0,
  network: 'good',
  recording: false,
  failure: null,
  walletEndsInSec: null,
  ended: null,
});

export const isLive = (call: ActiveWaCall | null): boolean =>
  Boolean(call && call.phase !== 'ended' && call.phase !== 'failed');
