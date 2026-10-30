import { useState } from 'react';

import type { Campaign } from '@/services/api/types';

import { formatInZone } from './time';

/** Throughput window (PHASE_8_PLAN §1m: "recent throughput, last 10 min"). */
export const ETA_WINDOW_MS = 10 * 60_000;

export interface Sample {
  at: number;
  attempts: number;
}

/** Dials still to go: contacts not final yet (each at least one more dial). */
export const remainingDials = (stats: Campaign['stats']): number =>
  stats.pending + stats.queued + stats.calling + stats.waiting;

/**
 * "≈ 25 min" from the dials made in the last 10 minutes; "continues <when>"
 * while waiting for the window; `null` when there is nothing to say yet.
 */
export const etaText = (input: {
  samples: readonly Sample[];
  remaining: number;
  now: number;
  waitingUntil: string | null;
  timezone: string;
}): string | null => {
  if (input.remaining === 0) return null;
  if (input.waitingUntil) return `continues ${formatInZone(input.waitingUntil, input.timezone)}`;
  const recent = input.samples.filter((s) => input.now - s.at <= ETA_WINDOW_MS);
  const first = recent[0];
  const last = recent.at(-1);
  if (!first || !last || last.at - first.at < 30_000) return null;
  const perMs = (last.attempts - first.attempts) / (last.at - first.at);
  if (perMs <= 0) return null;
  const minutes = Math.max(1, Math.round(input.remaining / perMs / 60_000));
  if (minutes >= 120) return `≈ ${String(Math.round(minutes / 60))} h`;
  return `≈ ${String(minutes)} min`;
};

/** Samples the attempts while the page is open; the ETA of a running campaign. */
export const useCampaignEta = (
  campaign: Campaign | undefined,
  timezone: string,
  clock: () => number = Date.now,
): string | null => {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [seen, setSeen] = useState<number | null>(null);
  const attempts = campaign?.status === 'running' ? campaign.stats.attempts : null;
  // a new attempts count → one more sample (state adjusted while rendering, no effect)
  if (attempts !== null && attempts !== seen) {
    const now = clock();
    setSeen(attempts);
    setSamples((prev) =>
      [...prev, { at: now, attempts }].filter((x) => now - x.at <= ETA_WINDOW_MS),
    );
  }
  if (!campaign || attempts === null) return null;
  return etaText({
    samples,
    remaining: remainingDials(campaign.stats),
    now: samples.at(-1)?.at ?? 0,
    waitingUntil: campaign.waitingUntil,
    timezone,
  });
};
