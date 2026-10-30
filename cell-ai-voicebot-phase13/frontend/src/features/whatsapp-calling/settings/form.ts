import type { WhatsAppCallingSettings, WhatsAppCallingSettingsPatch } from '@/services/api/types';

import { callHoursFormProblems } from '../call-hours';

/** Meta's limits (same as the server). */
export const CALLING_FORM_LIMITS = {
  ringTimeoutMin: 10,
  ringTimeoutMax: 30,
  ringUsersMax: 50,
  requestBodyMax: 1_024,
} as const;

export type Draft = Pick<
  WhatsAppCallingSettings,
  | 'callIconVisibility'
  | 'iconCountries'
  | 'callHours'
  | 'callbackPermission'
  | 'inbound'
  | 'permissionRequestBody'
>;

export const draftOf = (s: WhatsAppCallingSettings): Draft => ({
  callIconVisibility: s.callIconVisibility,
  iconCountries: s.iconCountries,
  callHours: s.callHours,
  callbackPermission: s.callbackPermission,
  inbound: s.inbound,
  permissionRequestBody: s.permissionRequestBody,
});

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Only the changed fields (the server sends only Meta's changed fields to Meta). */
export const settingsPatch = (draft: Draft, saved: Draft): WhatsAppCallingSettingsPatch => {
  const patch: WhatsAppCallingSettingsPatch = {};
  if (draft.callIconVisibility !== saved.callIconVisibility)
    patch.callIconVisibility = draft.callIconVisibility;
  if (!same(draft.iconCountries, saved.iconCountries)) patch.iconCountries = draft.iconCountries;
  if (!same(draft.callHours, saved.callHours)) patch.callHours = draft.callHours;
  if (draft.callbackPermission !== saved.callbackPermission)
    patch.callbackPermission = draft.callbackPermission;
  if (!same(draft.inbound, saved.inbound)) {
    patch.inbound = {
      route: draft.inbound.route,
      aiProgram: draft.inbound.route === 'team' ? null : draft.inbound.aiProgram,
      ringTimeoutSec: draft.inbound.ringTimeoutSec,
      ringUserIds: draft.inbound.ringUserIds,
    };
  }
  if (draft.permissionRequestBody.trim() !== saved.permissionRequestBody)
    patch.permissionRequestBody = draft.permissionRequestBody.trim();
  return patch;
};

/** Problems of the form (field → message). */
export const settingsProblems = (draft: Draft, today: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const hours = callHoursFormProblems(draft.callHours, today);
  if (hours.length) out.callHours = hours.join(' · ');
  const t = draft.inbound.ringTimeoutSec;
  if (
    !Number.isInteger(t) ||
    t < CALLING_FORM_LIMITS.ringTimeoutMin ||
    t > CALLING_FORM_LIMITS.ringTimeoutMax
  )
    out.ringTimeoutSec = `Between ${String(CALLING_FORM_LIMITS.ringTimeoutMin)} and ${String(CALLING_FORM_LIMITS.ringTimeoutMax)} seconds`;
  if (draft.inbound.route !== 'team' && !draft.inbound.aiProgram?.id)
    out.aiProgram = 'Choose a flow or an AI agent';
  if ((draft.inbound.ringUserIds?.length ?? 0) > CALLING_FORM_LIMITS.ringUsersMax)
    out.ringUserIds = `At most ${String(CALLING_FORM_LIMITS.ringUsersMax)} people`;
  const body = draft.permissionRequestBody.trim();
  if (!body) out.permissionRequestBody = 'Write the request text';
  else if (body.length > CALLING_FORM_LIMITS.requestBodyMax)
    out.permissionRequestBody = `At most ${String(CALLING_FORM_LIMITS.requestBodyMax)} characters`;
  if (draft.iconCountries.some((c) => !/^[A-Z]{2}$/.test(c)))
    out.iconCountries = 'Use 2-letter country codes, e.g. IN';
  return out;
};
