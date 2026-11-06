import { callHoursProblems } from '@/features/whatsapp-calling/call-hours';
import type { InboundNumber, InboundSettings } from '@/services/api/types';

/** Settings → Phone numbers (Phase 20): the incoming-call form's value and its checks. */

/** Mirrors the backend INBOUND_LIMITS. */
export const INBOUND_FORM_LIMITS = {
  greetingMax: 200,
  messageMax: 200,
  ringMinSec: 10,
  ringMaxSec: 120,
} as const;

/** The form value for a number (its saved settings). */
export const draftOf = (n: InboundNumber): InboundSettings => ({
  enabled: n.inbound.enabled,
  route: n.inbound.route,
  program: n.inbound.program,
  greeting: n.inbound.greeting,
  ringUserIds: n.inbound.ringUserIds,
  ringTimeoutSec: n.inbound.ringTimeoutSec,
  callHours: n.inbound.callHours,
  afterHours: n.inbound.afterHours,
});

export const needsProgram = (d: InboundSettings) =>
  d.route !== 'team' || (d.callHours.enabled && d.afterHours.action === 'ai');

/** Field problems of the form (empty = can be saved). */
export const inboundProblems = (d: InboundSettings): Record<string, string> => {
  const p: Record<string, string> = {};
  if (needsProgram(d) && !d.program) p.program = 'Choose a flow or an AI agent';
  if (d.greeting.length > INBOUND_FORM_LIMITS.greetingMax)
    p.greeting = `At most ${String(INBOUND_FORM_LIMITS.greetingMax)} characters`;
  const t = d.ringTimeoutSec;
  if (
    !Number.isInteger(t) ||
    t < INBOUND_FORM_LIMITS.ringMinSec ||
    t > INBOUND_FORM_LIMITS.ringMaxSec
  )
    p.ringTimeoutSec = `Between ${String(INBOUND_FORM_LIMITS.ringMinSec)} and ${String(INBOUND_FORM_LIMITS.ringMaxSec)} seconds`;
  if (d.ringUserIds?.length === 0 && d.route !== 'ai') p.ringUserIds = 'Choose at least one person';
  const msg = d.afterHours.message.trim();
  if (!msg || msg.length > INBOUND_FORM_LIMITS.messageMax)
    p.afterHours = `1 to ${String(INBOUND_FORM_LIMITS.messageMax)} characters`;
  const hours = callHoursProblems(d.callHours);
  if (hours.length) p.callHours = hours.join(' · ');
  return p;
};
