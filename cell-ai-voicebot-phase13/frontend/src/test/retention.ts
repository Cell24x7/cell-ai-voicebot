import type { Retention } from '@/services/api/types';

/** Platform defaults (calls 180, chats 90), no settings, no cap. */
export const fakeRetention = (over: Partial<Retention> = {}): Retention => ({
  settings: { recordingsDays: null, callsDays: null, inboxDays: null },
  effective: { recordingsDays: 180, callsDays: 180, inboxDays: 90 },
  platform: { callsDays: 180, inboxDays: 90 },
  cap: { callsDays: null, inboxDays: null },
  bounds: {
    recordingsDays: { min: 1, max: 180 },
    callsDays: { min: 7, max: 180 },
    inboxDays: { min: 30, max: 90 },
  },
  ...over,
});
