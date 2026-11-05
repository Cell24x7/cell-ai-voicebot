/** Recorded-voice (Cell24x7) helpers shared by the wizard and the detail page. */
export const voiceIvrKeys = { list: ['campaigns', 'voice-ivrs'] as const };

/** "about 2 h 10 min" for the provider's dialing time. */
export const durationText = (sec: number): string => {
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `about ${String(min)} min`;
  const h = Math.floor(min / 60);
  return `about ${String(h)} h${min % 60 ? ` ${String(min % 60)} min` : ''}`;
};
