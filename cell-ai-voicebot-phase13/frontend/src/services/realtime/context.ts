import { createContext } from 'react';

import type { RealtimeClient } from './ws-client';

/** `null` while realtime is disabled (no ticket provider yet — Phase 2). */
export const RealtimeContext = createContext<RealtimeClient | null>(null);
