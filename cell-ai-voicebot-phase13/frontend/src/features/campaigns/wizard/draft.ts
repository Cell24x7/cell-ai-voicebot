import type {
  CampaignLine,
  CampaignSettingsInput,
  CreateCampaignInput,
  VoiceRetryInterval,
  DryRunOutcome,
  RetryOn,
  ScenarioKey,
  TalkMode,
  UpdateCampaignInput,
} from '@/services/api/campaigns';
import { toApiError } from '@/services/api/errors';
import type { Campaign, CampaignStatus, CampaignWindow, ContactFilter } from '@/services/api/types';

import { scheduleProblems, type ScheduleValue } from '../fields/schedule';
import { remainder } from '../fields/weights';

export const STEPS = [
  'Basics',
  'Audience',
  'Schedule & window',
  'Retries & pacing',
  'Review',
] as const;
export type StepIndex = 0 | 1 | 2 | 3 | 4;

export type AudienceMode = 'lists' | 'segment' | 'filter' | 'pick';

/** CM: seconds after each team call to save the outcome. */
export const TEAM_WRAP_UP = { min: 0, max: 120, default: 15 } as const;

export const DRY_RUN_SPEEDS = [1, 5, 10, 20] as const;
export const MAX_PICKED = 1_000;
export const LIMITS = {
  nameMax: 120,
  attempts: { min: 1, max: 5 },
  interval: { min: 15, max: 1_440 },
  callbackDays: { min: 1, max: 14 },
  promiseDays: { min: 1, max: 14 },
  dialsPerMinute: { min: 1, max: 120 },
  concurrency: { min: 1, max: 200 },
} as const;

/** Everything the wizard edits (one object, saved as create / update bodies). */
export type AmdMode = 'off' | 'hangup' | 'leave_message';

/** Recorded voice (Cell24x7): the account's audio or an assigned IVR, and Cell24x7's redials. */
export interface VoiceDraft {
  kind: 'audio' | 'ivr';
  flowAudioId: string;
  ivrId: number | null;
  retries: number;
  retryIntervalMin: VoiceRetryInterval;
}

export const emptyVoice = (): VoiceDraft => ({
  kind: 'audio',
  flowAudioId: '',
  ivrId: null,
  retries: 0,
  retryIntervalMin: 30,
});

export interface WizardDraft {
  name: string;
  line: CampaignLine;
  /** CM: who talks — the flow / AI agent, or the team in the browser (live only). */
  talkMode: TalkMode;
  /** `agentUserIds: null` = every member who may make calls. */
  team: { agentUserIds: string[] | null; wrapUpSec: number };
  voice: VoiceDraft;
  channelId: string;
  program: { kind: 'flow' | 'agent'; id: string } | null;
  askPermissionTemplateId: string;
  askPermissionFirst: boolean;
  mode: 'dry_run' | 'live';
  flowId: string;
  chosenVersion: number | null;
  audienceMode: AudienceMode;
  listIds: string[];
  segmentId: string | null;
  filter: ContactFilter;
  contactIds: string[];
  excludeActiveCampaigns: boolean;
  skipIfMissing: string[];
  schedule: ScheduleValue;
  timezone: string;
  window: CampaignWindow;
  retry: { maxAttempts: number; intervalMinutes: number; retryOn: RetryOn[] };
  followUps: {
    callbacks: boolean;
    callbackMaxDays: number;
    promiseCheck: { enabled: boolean; daysAfter: number };
  };
  pacing: { concurrency: number; dialsPerMinute: number; priority: 'high' | 'normal' | 'low' };
  autoResume: boolean;
  /** Phase 18: caller number and answering machines (live campaigns). */
  phoneLine: { callerNumberId: string | null; amd: AmdMode; voicemailText: string };
  dryRun: {
    mix: Record<DryRunOutcome, number>;
    scenarios: Record<ScenarioKey, number>;
    speed: number;
  };
}

export const DEFAULT_MIX: Record<DryRunOutcome, number> = {
  answered: 6_500,
  no_answer: 2_000,
  busy: 1_000,
  failed: 300,
  invalid_number: 200,
};
export const DEFAULT_SCENARIOS: Record<ScenarioKey, number> = {
  paid: 30,
  promise: 25,
  refuse: 10,
  callback: 10,
  silence: 10,
  wrong_number: 5,
  hangup_early: 5,
  wrong_keys: 5,
};

/** A new campaign (the server fills the same defaults). */
export const emptyDraft = (account: { timezone: string; window: CampaignWindow }): WizardDraft => ({
  name: '',
  line: 'phone',
  talkMode: 'ai',
  team: { agentUserIds: null, wrapUpSec: TEAM_WRAP_UP.default },
  voice: emptyVoice(),
  channelId: '',
  program: null,
  askPermissionTemplateId: '',
  askPermissionFirst: false,
  mode: 'dry_run',
  flowId: '',
  chosenVersion: null,
  audienceMode: 'lists',
  listIds: [],
  segmentId: null,
  filter: {},
  contactIds: [],
  excludeActiveCampaigns: true,
  skipIfMissing: [],
  schedule: { startAt: null, endAt: null, recurrence: null },
  timezone: account.timezone,
  window: { ...account.window, days: [...account.window.days] },
  retry: { maxAttempts: 3, intervalMinutes: 60, retryOn: ['no_answer', 'busy', 'failed'] },
  followUps: {
    callbacks: true,
    callbackMaxDays: 7,
    promiseCheck: { enabled: false, daysAfter: 1 },
  },
  pacing: { concurrency: 5, dialsPerMinute: 30, priority: 'normal' },
  autoResume: true,
  phoneLine: { callerNumberId: null, amd: 'off', voicemailText: '' },
  dryRun: { mix: { ...DEFAULT_MIX }, scenarios: { ...DEFAULT_SCENARIOS }, speed: 10 },
});

const audienceModeOf = (a: Campaign['audience']): AudienceMode => {
  if (a.segmentId) return 'segment';
  if (a.contactIds.length) return 'pick';
  if (a.filter && Object.keys(a.filter).length) return 'filter';
  return 'lists';
};

/** A saved campaign → the wizard's draft. */
export const draftFromCampaign = (c: Campaign): WizardDraft => ({
  name: c.name,
  line: c.line ?? 'phone',
  talkMode: c.talkMode ?? 'ai',
  team: {
    agentUserIds: c.team?.agentUserIds ? [...c.team.agentUserIds] : null,
    wrapUpSec: c.team?.wrapUpSec ?? TEAM_WRAP_UP.default,
  },
  voice: c.voiceApi
    ? {
        kind: c.voiceApi.content?.kind ?? 'audio',
        flowAudioId: c.voiceApi.content?.flowAudioId ?? '',
        ivrId: c.voiceApi.content?.ivrId ?? null,
        retries: c.voiceApi.retries,
        retryIntervalMin: c.voiceApi.retryIntervalMin as VoiceRetryInterval,
      }
    : emptyVoice(),
  channelId: c.channelId ?? '',
  program: c.program ?? null,
  askPermissionTemplateId: c.askPermissionFirst?.templateId ?? '',
  askPermissionFirst: Boolean(c.askPermissionFirst),
  mode: c.mode,
  flowId: c.flow.id,
  chosenVersion: c.chosenVersion,
  audienceMode: audienceModeOf(c.audience),
  listIds: [...c.audience.listIds],
  segmentId: c.audience.segmentId,
  filter: c.audience.filter ?? {},
  contactIds: [...c.audience.contactIds],
  excludeActiveCampaigns: c.audience.excludeActiveCampaigns,
  skipIfMissing: [...c.audience.skipIfMissing],
  schedule: {
    startAt: c.schedule.startAt,
    endAt: c.schedule.endAt,
    recurrence: c.schedule.recurrence ? { ...c.schedule.recurrence } : null,
  },
  timezone: c.schedule.timezone,
  window: { ...c.window, days: [...c.window.days] },
  retry: { ...c.retry, retryOn: [...c.retry.retryOn] },
  followUps: { ...c.followUps, promiseCheck: { ...c.followUps.promiseCheck } },
  pacing: { ...c.pacing },
  autoResume: c.autoResume,
  phoneLine: {
    callerNumberId: c.phoneLine.callerNumberId,
    amd: c.phoneLine.amd,
    voicemailText: c.phoneLine.voicemailText ?? '',
  },
  dryRun: c.dryRun
    ? {
        mix: { ...DEFAULT_MIX, ...(c.dryRun.mix as Record<DryRunOutcome, number>) },
        scenarios: { ...DEFAULT_SCENARIOS, ...(c.dryRun.scenarios as Record<ScenarioKey, number>) },
        speed: c.dryRun.speed,
      }
    : { mix: { ...DEFAULT_MIX }, scenarios: { ...DEFAULT_SCENARIOS }, speed: 10 },
});

const audienceOf = (d: WizardDraft): NonNullable<CampaignSettingsInput['audience']> => ({
  listIds: d.audienceMode === 'lists' ? d.listIds : [],
  segmentId: d.audienceMode === 'segment' ? d.segmentId : null,
  filter: d.audienceMode === 'filter' ? d.filter : null,
  contactIds: d.audienceMode === 'pick' ? d.contactIds : [],
  excludeActiveCampaigns: d.excludeActiveCampaigns,
  skipIfMissing: d.skipIfMissing,
});

/** The voice content the API takes (`null` until chosen). */
export const voiceContentOf = (v: VoiceDraft) =>
  v.kind === 'audio'
    ? v.flowAudioId
      ? { kind: 'audio' as const, flowAudioId: v.flowAudioId }
      : null
    : v.ivrId
      ? { kind: 'ivr' as const, ivrId: v.ivrId }
      : null;

/** The audience preview body (`null` when nothing is chosen yet). */
export const previewBody = (d: WizardDraft) =>
  d.line === 'voice_api'
    ? audienceProblems(d).length
      ? null
      : { line: 'voice_api' as const, audience: audienceOf(d) }
    : (isTeam(d)
          ? d.line !== 'whatsapp' || d.channelId
          : d.line === 'whatsapp'
            ? d.channelId && d.program?.id
            : d.flowId) && !audienceProblems(d).length
      ? {
          ...(isTeam(d) ? { talkMode: 'team' as const } : {}),
          ...(d.flowId && !isTeam(d) ? { flowId: d.flowId } : {}),
          ...(d.line === 'whatsapp'
            ? {
                line: d.line,
                channelId: d.channelId,
                program: isTeam(d) ? null : d.program,
                askPermissionFirst: d.askPermissionFirst,
              }
            : {}),
          chosenVersion: d.chosenVersion,
          audience: audienceOf(d),
        }
      : null;

/** Recorded voice: Cell24x7 plays the audio — no flow, dry run, caller ID or our retries. */
const voiceSettingsOf = (d: WizardDraft): CampaignSettingsInput => ({
  line: 'voice_api',
  voiceApi: {
    content: voiceContentOf(d.voice),
    retries: d.voice.retries,
    retryIntervalMin: d.voice.retryIntervalMin,
  },
  audience: audienceOf(d),
  schedule: { ...d.schedule, timezone: d.timezone },
  window: d.window,
  autoResume: d.autoResume,
});

const settingsOf = (d: WizardDraft): CampaignSettingsInput =>
  d.line === 'voice_api' ? voiceSettingsOf(d) : phoneSettingsOf(d);

const phoneSettingsOf = (d: WizardDraft): CampaignSettingsInput => ({
  talkMode: d.talkMode,
  team: isTeam(d) ? { agentUserIds: d.team.agentUserIds, wrapUpSec: d.team.wrapUpSec } : null,
  ...(d.line === 'whatsapp'
    ? {
        line: 'whatsapp',
        channelId: d.channelId,
        program: isTeam(d) ? null : d.program,
        askPermissionFirst:
          d.askPermissionFirst && d.askPermissionTemplateId
            ? { templateId: d.askPermissionTemplateId }
            : null,
      }
    : {}),
  chosenVersion: d.chosenVersion,
  audience: audienceOf(d),
  schedule: { ...d.schedule, timezone: d.timezone },
  window: d.window,
  retry: d.retry,
  followUps: d.followUps,
  pacing: d.pacing,
  autoResume: d.autoResume,
  phoneLine: {
    callerNumberId: d.phoneLine.callerNumberId,
    amd: d.phoneLine.amd,
    voicemailText:
      d.phoneLine.amd === 'leave_message' ? d.phoneLine.voicemailText.trim() || null : null,
  },
  dryRun: d.mode === 'dry_run' ? d.dryRun : null,
});

export const toCreateInput = (d: WizardDraft): CreateCampaignInput => ({
  name: d.name.trim(),
  mode: d.line === 'voice_api' ? 'live' : d.mode,
  ...(d.flowId && d.line !== 'voice_api' && !isTeam(d) ? { flowId: d.flowId } : {}),
  ...settingsOf(d),
});

/** Only what the campaign's status lets change (running / paused: the live-editable groups). */
export const toUpdateInput = (
  d: WizardDraft,
  revision: number,
  status: CampaignStatus,
): UpdateCampaignInput => {
  if (status === 'running' || status === 'paused') {
    return {
      revision,
      name: d.name.trim(),
      schedule: { endAt: d.schedule.endAt ?? null },
      window: d.window,
      ...(d.line === 'voice_api'
        ? {}
        : { retry: d.retry, followUps: d.followUps, pacing: d.pacing }),
      autoResume: d.autoResume,
    };
  }
  const { mode: _mode, ...rest } = toCreateInput(d);
  return {
    revision,
    ...rest,
    ...(status === 'draft' && d.line !== 'voice_api' ? { mode: d.mode } : {}),
  };
};

/** Which fields a status locks (plan §1e): `null` = all editable. */
export type LockRule = 'none' | 'mode' | 'live' | 'all';
export const lockRule = (status: CampaignStatus | null): LockRule => {
  if (!status || status === 'draft') return 'none';
  if (status === 'scheduled') return 'mode';
  if (status === 'running' || status === 'paused') return 'live';
  return 'all';
};
/** Groups a running / paused campaign may still change. */
export const LIVE_EDITABLE = new Set([
  'name',
  'endAt',
  'window',
  'retry',
  'followUps',
  'pacing',
  'autoResume',
]);
export const isLocked = (rule: LockRule, group: string): boolean =>
  rule === 'all' ||
  (rule === 'mode' && group === 'mode') ||
  (rule === 'live' && !LIVE_EDITABLE.has(group));

/** CM: the team talks (no flow / AI program). */
export const isTeam = (d: Pick<WizardDraft, 'line' | 'talkMode'>): boolean =>
  d.talkMode === 'team' && d.line !== 'voice_api';

const intIn = (v: number, r: { min: number; max: number }) =>
  Number.isInteger(v) && v >= r.min && v <= r.max;

export const audienceProblems = (d: WizardDraft): string[] => {
  if (d.audienceMode === 'lists' && !d.listIds.length) return ['Choose at least one list'];
  if (d.audienceMode === 'segment' && !d.segmentId) return ['Choose a segment'];
  if (d.audienceMode === 'filter' && !Object.keys(d.filter).length) return ['Add a filter'];
  if (d.audienceMode === 'pick' && !d.contactIds.length) return ['Pick at least one contact'];
  if (d.audienceMode === 'pick' && d.contactIds.length > MAX_PICKED) {
    return [`At most ${String(MAX_PICKED)} picked contacts`];
  }
  return [];
};

/** Problems that keep a step from "Next" (empty = valid). */
export const stepProblems = (step: StepIndex, d: WizardDraft, now = new Date()): string[] => {
  if (step === 0) {
    const p: string[] = [];
    if (!d.name.trim()) p.push('Give the campaign a name');
    if (d.name.trim().length > LIMITS.nameMax)
      p.push(`At most ${String(LIMITS.nameMax)} characters`);
    if (d.line === 'whatsapp' && !d.channelId) p.push('Choose a WhatsApp calling number');
    if (d.line === 'whatsapp' && d.askPermissionFirst && !d.askPermissionTemplateId)
      p.push('Choose an approved call permission template');
    if (d.line === 'voice_api') {
      if (!voiceContentOf(d.voice))
        p.push(d.voice.kind === 'audio' ? 'Choose or upload the audio' : 'Choose an IVR menu');
      return p;
    }
    if (isTeam(d)) {
      if (d.mode !== 'live') p.push('Team calling needs live calls');
      if (d.team.agentUserIds?.length === 0) p.push('Choose at least one team member');
      if (!intIn(d.team.wrapUpSec, TEAM_WRAP_UP)) p.push('Wrap-up time: 0 to 120 seconds');
      return p;
    }
    if (!d.flowId && !(d.line === 'whatsapp' && d.program?.id)) p.push('Choose a published flow');
    if (
      d.mode === 'live' &&
      d.phoneLine.amd === 'leave_message' &&
      !d.phoneLine.voicemailText.trim()
    )
      p.push('Write the message for answering machines');
    return p;
  }
  if (step === 1) return audienceProblems(d);
  if (step === 2) {
    const p = scheduleProblems(d.schedule, now);
    if (d.window.start >= d.window.end) p.push('The window must end after it starts');
    if (!d.window.days.length) p.push('Pick at least one calling day');
    return p;
  }
  if (step === 3 && d.line === 'voice_api') {
    return Number.isInteger(d.voice.retries) && d.voice.retries >= 0 && d.voice.retries <= 3
      ? []
      : ['Redials: 0 to 3'];
  }
  if (step === 3) {
    const p: string[] = [];
    if (!intIn(d.retry.maxAttempts, LIMITS.attempts)) p.push('Attempts: 1 to 5');
    if (!intIn(d.retry.intervalMinutes, LIMITS.interval))
      p.push('Retry interval: 15 to 1440 minutes');
    if (d.followUps.callbacks && !intIn(d.followUps.callbackMaxDays, LIMITS.callbackDays)) {
      p.push('Callbacks within 1 to 14 days');
    }
    if (
      d.followUps.promiseCheck.enabled &&
      !intIn(d.followUps.promiseCheck.daysAfter, LIMITS.promiseDays)
    ) {
      p.push('Promise follow-up: 1 to 14 days after');
    }
    if (!intIn(d.pacing.concurrency, LIMITS.concurrency)) p.push('Calls at once: at least 1');
    if (!intIn(d.pacing.dialsPerMinute, LIMITS.dialsPerMinute))
      p.push('Dials per minute: 1 to 120');
    if (d.mode === 'dry_run') {
      const mixLeft = remainder(
        Object.fromEntries(Object.entries(d.dryRun.mix).map(([k, v]) => [k, v / 100])),
      );
      if (mixLeft !== 0) p.push('Call outcomes must add up to 100 %');
      if (remainder(d.dryRun.scenarios) !== 0) p.push('Simulated customers must add up to 100 %');
    }
    return p;
  }
  return [];
};

/** The step a server path belongs to (`body.audience.listIds` → Audience). */
export const stepOfPath = (path: string): StepIndex => {
  const p = path.replace(/^(body|query|params)\./, '');
  if (/^(audience|skipIfMissing)/.test(p)) return 1;
  if (/^(schedule|window)/.test(p)) return 2;
  if (/^voiceApi\.(retries|retryIntervalMin)/.test(p)) return 3;
  if (/^(retry|followUps|pacing|dryRun|autoResume)/.test(p)) return 3;
  return 0;
};

/** Server validation details grouped by step (messages with their field path). */
export const serverErrorsByStep = (err: unknown): Partial<Record<StepIndex, string[]>> => {
  const out: Partial<Record<StepIndex, string[]>> = {};
  for (const { path, message } of toApiError(err).details) {
    const step = stepOfPath(path);
    const field = path.replace(/^(body|query|params)\./, '');
    (out[step] ??= []).push(field ? `${field}: ${message}` : message);
  }
  return out;
};
