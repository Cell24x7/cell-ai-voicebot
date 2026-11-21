import type { WhatsAppInboundRoute } from '@/services/api/types';

/** "Abhi: …" — who answers right now. */
export const incomingStatusText = (route: WhatsAppInboundRoute): string => {
  if (route === 'team') return 'Abhi: team uthayegi';
  if (route === 'ai') return 'Abhi: AI har call uthayega';
  if (route === 'ai_then_team') return 'Abhi: AI uthayega (AI na mile to team)';
  return 'Abhi: pehle team, koi na uthaye to AI';
};
