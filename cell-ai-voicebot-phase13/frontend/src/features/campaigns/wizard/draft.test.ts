import { describe, expect, it } from 'vitest';

import { ApiError } from '@/services/api/errors';
import { fakeCampaign } from '@/test/campaigns';

import {
  draftFromCampaign,
  emptyDraft,
  isLocked,
  lockRule,
  previewBody,
  serverErrorsByStep,
  stepOfPath,
  stepProblems,
  toCreateInput,
  toUpdateInput,
  type WizardDraft,
} from './draft';

const ACCOUNT = {
  timezone: 'Asia/Kolkata',
  window: { start: '09:00', end: '19:00', days: [1, 2, 3] },
};
const NOW = new Date('2026-10-21T04:00:00.000Z');
const valid = (): WizardDraft => ({
  ...emptyDraft(ACCOUNT),
  name: 'Oct',
  flowId: 'f1',
  listIds: ['l1'],
});

describe('wizard draft', () => {
  it('a new draft takes the account window and timezone; the create body carries every group', () => {
    const d = emptyDraft(ACCOUNT);
    expect(d.window).toEqual(ACCOUNT.window);
    expect(d.window.days).not.toBe(ACCOUNT.window.days);
    const body = toCreateInput({ ...valid(), name: '  Oct  ' });
    expect(body).toMatchObject({
      name: 'Oct',
      mode: 'dry_run',
      flowId: 'f1',
      audience: { listIds: ['l1'], segmentId: null, filter: null, contactIds: [] },
      schedule: { startAt: null, endAt: null, recurrence: null, timezone: 'Asia/Kolkata' },
      dryRun: { speed: 10 },
    });
    expect(toCreateInput({ ...valid(), mode: 'live' }).dryRun).toBeNull();
  });

  it('only the chosen audience kind is sent; the preview needs a flow and an audience', () => {
    const seg = { ...valid(), audienceMode: 'segment' as const, segmentId: 's1' };
    expect(toCreateInput(seg).audience).toMatchObject({ listIds: [], segmentId: 's1' });
    const filter = { ...valid(), audienceMode: 'filter' as const, filter: { dnd: false } };
    expect(toCreateInput(filter).audience).toMatchObject({ filter: { dnd: false }, listIds: [] });
    const pick = { ...valid(), audienceMode: 'pick' as const, contactIds: ['k1'] };
    expect(toCreateInput(pick).audience).toMatchObject({ contactIds: ['k1'], filter: null });
    expect(previewBody(valid())).toMatchObject({ flowId: 'f1', chosenVersion: null });
    expect(previewBody({ ...valid(), flowId: '' })).toBeNull();
    expect(previewBody({ ...valid(), listIds: [] })).toBeNull();
  });

  it('a saved campaign comes back with the right audience kind and its settings', () => {
    expect(draftFromCampaign(fakeCampaign())).toMatchObject({
      name: 'October recovery',
      audienceMode: 'lists',
      listIds: ['l1'],
      dryRun: { speed: 10 },
    });
    const c = fakeCampaign();
    expect(
      draftFromCampaign({ ...c, audience: { ...c.audience, segmentId: 's1' } }).audienceMode,
    ).toBe('segment');
    expect(
      draftFromCampaign({ ...c, audience: { ...c.audience, contactIds: ['k1'] } }).audienceMode,
    ).toBe('pick');
    expect(
      draftFromCampaign({ ...c, audience: { ...c.audience, filter: { dnd: false } } }).audienceMode,
    ).toBe('filter');
    expect(draftFromCampaign(fakeCampaign({ mode: 'live', dryRun: null })).dryRun.speed).toBe(10);
    expect(
      draftFromCampaign(
        fakeCampaign({
          schedule: {
            startAt: null,
            endAt: null,
            timezone: 'Asia/Kolkata',
            recurrence: { freq: 'daily', days: [], time: '10:00', until: null },
          },
        }),
      ).schedule.recurrence,
    ).toEqual({ freq: 'daily', days: [], time: '10:00', until: null });
  });

  it('updates: drafts send everything (+ mode), scheduled no mode, running / paused only the live groups', () => {
    const d = valid();
    expect(toUpdateInput(d, 2, 'draft')).toMatchObject({
      revision: 2,
      mode: 'dry_run',
      flowId: 'f1',
    });
    const scheduled = toUpdateInput(d, 2, 'scheduled');
    expect(scheduled).not.toHaveProperty('mode');
    expect(scheduled).toHaveProperty('audience');
    expect(Object.keys(toUpdateInput(d, 2, 'running')).sort()).toEqual(
      [
        'autoResume',
        'followUps',
        'name',
        'pacing',
        'retry',
        'revision',
        'schedule',
        'window',
      ].sort(),
    );
    expect(toUpdateInput(d, 2, 'paused').schedule).toEqual({ endAt: null });
  });

  it('locks by status', () => {
    expect(lockRule(null)).toBe('none');
    expect(lockRule('draft')).toBe('none');
    expect(lockRule('scheduled')).toBe('mode');
    expect(lockRule('running')).toBe('live');
    expect(lockRule('paused')).toBe('live');
    expect(lockRule('completed')).toBe('all');
    expect(isLocked('none', 'flow')).toBe(false);
    expect(isLocked('mode', 'mode')).toBe(true);
    expect(isLocked('mode', 'flow')).toBe(false);
    expect(isLocked('live', 'flow')).toBe(true);
    expect(isLocked('live', 'window')).toBe(false);
    expect(isLocked('all', 'name')).toBe(true);
  });

  it('step problems: every rule', () => {
    expect(stepProblems(0, valid())).toEqual([]);
    expect(stepProblems(0, { ...valid(), name: ' ', flowId: '', mode: 'live' })).toEqual([
      'Give the campaign a name',
      'Choose a published flow',
      'Live calls need a phone line (coming with phone numbers)',
    ]);
    expect(stepProblems(0, { ...valid(), name: 'x'.repeat(121) })).toEqual([
      'At most 120 characters',
    ]);
    expect(stepProblems(1, { ...valid(), listIds: [] })).toEqual(['Choose at least one list']);
    expect(stepProblems(1, { ...valid(), audienceMode: 'segment' })).toEqual(['Choose a segment']);
    expect(stepProblems(1, { ...valid(), audienceMode: 'filter' })).toEqual(['Add a filter']);
    expect(stepProblems(1, { ...valid(), audienceMode: 'pick' })).toEqual([
      'Pick at least one contact',
    ]);
    expect(
      stepProblems(1, {
        ...valid(),
        audienceMode: 'pick',
        contactIds: Array.from({ length: 1001 }, (_, i) => String(i)),
      }),
    ).toEqual(['At most 1000 picked contacts']);
    expect(
      stepProblems(2, { ...valid(), window: { start: '19:00', end: '09:00', days: [] } }, NOW),
    ).toEqual(['The window must end after it starts', 'Pick at least one calling day']);
    const bad: WizardDraft = {
      ...valid(),
      retry: { maxAttempts: 9, intervalMinutes: 5, retryOn: [] },
      followUps: {
        callbacks: true,
        callbackMaxDays: 30,
        promiseCheck: { enabled: true, daysAfter: 0 },
      },
      pacing: { concurrency: 0, dialsPerMinute: 500, priority: 'normal' },
      dryRun: {
        ...valid().dryRun,
        mix: { ...valid().dryRun.mix, answered: 0 },
        scenarios: { ...valid().dryRun.scenarios, paid: 0 },
      },
    };
    expect(stepProblems(3, bad)).toEqual([
      'Attempts: 1 to 5',
      'Retry interval: 15 to 1440 minutes',
      'Callbacks within 1 to 14 days',
      'Promise follow-up: 1 to 14 days after',
      'Calls at once: at least 1',
      'Dials per minute: 1 to 120',
      'Call outcomes must add up to 100 %',
      'Simulated customers must add up to 100 %',
    ]);
    expect(stepProblems(3, { ...bad, mode: 'live' })).toHaveLength(6);
    expect(stepProblems(4, valid())).toEqual([]);
  });

  it('server paths map to their steps', () => {
    expect(stepOfPath('body.name')).toBe(0);
    expect(stepOfPath('audience.listIds')).toBe(1);
    expect(stepOfPath('body.window.end')).toBe(2);
    expect(stepOfPath('schedule.startAt')).toBe(2);
    expect(stepOfPath('dryRun.mix')).toBe(3);
    expect(
      serverErrorsByStep(
        new ApiError({
          status: 422,
          code: 'VALIDATION_FAILED',
          message: 'x',
          kind: 'http',
          details: [
            { path: 'body.flowId', message: 'Flow not found' },
            { path: 'body.pacing.concurrency', message: 'At most 10' },
            { path: 'pacing.dialsPerMinute', message: 'At most 60' },
          ],
        }),
      ),
    ).toEqual({
      0: ['flowId: Flow not found'],
      3: ['pacing.concurrency: At most 10', 'pacing.dialsPerMinute: At most 60'],
    });
  });
});
