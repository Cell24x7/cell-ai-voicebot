import type { WhatsAppCampaign, WhatsAppCampaignRecipientStatus } from '@/services/api/types';
import type { WaCampaignCreateInput, WaCampaignVariants } from '@/services/api/whatsapp-campaigns';

/** The wizard's steps. */
export const STEPS = [
  'Number',
  'Template',
  'Variables',
  'Audience',
  'Schedule',
  'Cost & review',
] as const;
export type StepIndex = 0 | 1 | 2 | 3 | 4 | 5;

/** How the audience is picked (one mode, `pick` = preselected contacts). */
export type AudienceMode = 'lists' | 'segment' | 'tags' | 'csv' | 'pick';

/** Where a template variable value comes from (mirrors the backend `WA_VARIABLE_KINDS`). */
export type VariableKind = 'field' | 'contact.name' | 'contact.phone' | 'static';

/** The whole wizard, one object. Saved bodies are built from it (`toCreateInput`). */
export interface WaWizardDraft {
  name: string;
  channelId: string;
  variants: WaCampaignVariants[];
  /** For 2+ variants: which metric wins, and after how many hours. */
  abWinner: { metric: 'read' | 'reply'; afterHours: number } | null;
  /** Template variable key → its source (every key needs one). */
  variables: Record<string, { kind: VariableKind; value?: string | null }>;
  audienceMode: AudienceMode;
  listIds: string[];
  segmentId: string | null;
  tagValues: string[];
  tagMode: 'any' | 'all';
  csvUploadId: string | null;
  contactIds: string[];
  excludeRecentDays: number;
  scheduleMode: 'now' | 'at' | 'recurring';
  timezone: string;
  recurrence: NonNullable<WhatsAppCampaign['schedule']['recurrence']>;
  headerLocation?: { latitude: number; longitude: number; name?: string; address?: string } | null;
  headerMediaToken?: string | null | undefined;
  scheduleAt: string | null;
}

/** A new draft (the server fills defaults for what is absent). */
export const emptyDraft = (): WaWizardDraft => ({
  name: '',
  channelId: '',
  variants: [{ key: 'A', templateId: '', splitPct: 100 }],
  abWinner: null,
  variables: {},
  audienceMode: 'lists',
  listIds: [],
  segmentId: null,
  tagValues: [],
  tagMode: 'any',
  csvUploadId: null,
  contactIds: [],
  excludeRecentDays: 0,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  recurrence: { freq: 'daily', days: [], time: '09:00', until: null },
  scheduleMode: 'now',
  scheduleAt: null,
});

/** Prefill from the URL (`?listId` / `?segmentId` / `?contactIds` / `?csvUploadId`). */
export const prefill = (draft: WaWizardDraft, params: URLSearchParams): WaWizardDraft => {
  const next = { ...draft };
  const listId = params.get('listId');
  const segmentId = params.get('segmentId');
  const contactIds = params.get('contactIds');
  const csvUploadId = params.get('csvUploadId');
  if (listId) Object.assign(next, { audienceMode: 'lists', listIds: [listId] });
  if (segmentId) Object.assign(next, { audienceMode: 'segment', segmentId });
  if (contactIds)
    Object.assign(next, {
      audienceMode: 'pick',
      contactIds: contactIds.split(',').filter(Boolean),
    });
  if (csvUploadId) Object.assign(next, { audienceMode: 'csv', csvUploadId });
  return next;
};

/** Only the chosen audience mode is sent (the rest stay empty). */
const audienceOf = (d: WaWizardDraft) => ({
  listIds: d.audienceMode === 'lists' ? d.listIds : [],
  segmentId: d.audienceMode === 'segment' ? d.segmentId : null,
  tags:
    d.audienceMode === 'tags' && d.tagValues.length
      ? { values: d.tagValues, mode: d.tagMode }
      : null,
  contactIds: d.audienceMode === 'pick' ? d.contactIds : [],
  csvUploadId: d.audienceMode === 'csv' ? d.csvUploadId : null,
});

/** The create / update body. */
export const toCreateInput = (d: WaWizardDraft): WaCampaignCreateInput => ({
  name: d.name.trim(),
  ...(d.headerMediaToken !== undefined ? { headerMediaToken: d.headerMediaToken } : {}),
  headerLocation: d.headerLocation ?? null,
  channelId: d.channelId,
  variants: d.variants,
  abWinner: d.variants.length > 1 ? d.abWinner : null,
  ...(Object.keys(d.variables).length ? { variables: d.variables } : {}),
  audience: audienceOf(d),
  excludeRecentDays: d.excludeRecentDays,
  schedule: {
    kind: d.scheduleMode,
    at: d.scheduleMode === 'at' ? d.scheduleAt : null,
    timezone: d.timezone,
    ...(d.scheduleMode === 'recurring' ? { recurrence: d.recurrence } : {}),
  },
});

/** A saved campaign → the wizard's draft (edit / review). */
export const draftFromCampaign = (c: WhatsAppCampaign): WaWizardDraft => ({
  name: c.name,
  headerLocation: c.headerLocation ?? null,
  channelId: c.channelId,
  variants: c.variants.map((v) => ({ ...v })),
  abWinner: c.abWinner ? { metric: c.abWinner.metric, afterHours: c.abWinner.afterHours } : null,
  variables: c.variables,
  audienceMode: audienceModeOf(c),
  listIds: c.audience.listIds,
  segmentId: c.audience.segmentId,
  tagValues: c.audience.tags?.values ?? [],
  tagMode: c.audience.tags?.mode ?? 'any',
  csvUploadId: c.audience.csvUploadId,
  contactIds: c.audience.contactIds,
  excludeRecentDays: c.excludeRecentDays,
  scheduleMode: c.schedule.kind,
  scheduleAt: c.schedule.at,
  timezone: c.schedule.timezone,
  recurrence: c.schedule.recurrence ?? { freq: 'daily', days: [], time: '09:00', until: null },
});

const audienceModeOf = (c: WhatsAppCampaign): AudienceMode => {
  if (c.audience.csvUploadId) return 'csv';
  if (c.audience.segmentId) return 'segment';
  if (c.audience.tags?.values.length) return 'tags';
  if (c.audience.contactIds.length) return 'pick';
  return 'lists';
};

/** Problems that keep a step from "Next" (empty = valid). */
export const stepProblems = (step: StepIndex, d: WaWizardDraft): string[] => {
  if (step === 0) {
    const p: string[] = [];
    if (!d.name.trim() || d.name.trim().length > 120)
      p.push('Give the campaign a name (1–120 characters)');
    if (!d.channelId) p.push('Pick a WhatsApp number');
    return p;
  }
  if (step === 1) {
    const p: string[] = [];
    if (!d.variants.length || d.variants.some((v) => !v.templateId))
      p.push('Pick at least one approved template');
    const sum = d.variants.reduce((a, v) => a + v.splitPct, 0);
    if (sum !== 100) p.push('The splits must add up to 100 %');
    if (d.variants.some((v) => !Number.isInteger(v.splitPct) || v.splitPct < 1 || v.splitPct > 100))
      p.push('Each share must be a whole number from 1 to 100');
    if (new Set(d.variants.map((v) => v.key)).size !== d.variants.length)
      p.push('Each variant must have a different key');
    if (d.variants.length > 1 && !d.abWinner) p.push('Choose the winner metric for A/B');
    if (
      d.abWinner &&
      (!Number.isInteger(d.abWinner.afterHours) ||
        d.abWinner.afterHours < 1 ||
        d.abWinner.afterHours > 72)
    )
      p.push('Choose a winner after 1–72 whole hours');
    return p;
  }
  if (step === 2) {
    // every required variable must have a usable source
    const missing = Object.entries(d.variables).filter(([, v]) =>
      v.kind === 'static' ? !v.value?.trim() : v.kind === 'field' ? !v.value : false,
    );
    return missing.length
      ? [`${String(missing.length)} variable${missing.length > 1 ? 's' : ''} still need a value`]
      : [];
  }
  if (step === 3) {
    if (
      !Number.isInteger(d.excludeRecentDays) ||
      d.excludeRecentDays < 0 ||
      d.excludeRecentDays > 90
    )
      return ['Skip recent sends must be 0–90 whole days'];
    const a = audienceOf(d);
    const has =
      (a.listIds?.length ?? 0) ||
      a.segmentId ||
      (a.tags?.values.length ?? 0) ||
      (a.contactIds?.length ?? 0) ||
      a.csvUploadId;
    return has ? [] : ['Pick who gets the message (a list, segment, tag, CSV or contacts)'];
  }
  if (step === 4) {
    if (d.scheduleMode === 'recurring') {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.recurrence.time))
        return ['Choose a valid recurring time'];
      if (d.recurrence.freq === 'weekly' && !d.recurrence.days.length)
        return ['Choose at least one weekday'];
      if (d.recurrence.until && Date.parse(d.recurrence.until) <= Date.now())
        return ['The recurrence end must be in the future'];
      try {
        new Intl.DateTimeFormat('en', { timeZone: d.timezone });
      } catch {
        return ['Choose a valid timezone'];
      }
    }
    if (
      d.scheduleMode === 'at' &&
      (!d.scheduleAt ||
        !Number.isFinite(Date.parse(d.scheduleAt)) ||
        Date.parse(d.scheduleAt) <= Date.now())
    )
      return ['"Start at" must be in the future'];
    return [];
  }
  return [];
};

/** Recipient table statuses (backend `WA_RECIPIENT_STATUSES`). */
export type { WhatsAppCampaignRecipientStatus };
