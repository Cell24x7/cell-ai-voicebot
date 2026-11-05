import { describe, expect, it } from 'vitest';

import { fakeWaCampaign } from '@/test/whatsapp-campaigns';

import { draftFromCampaign, emptyDraft, prefill, stepProblems, toCreateInput } from './draft';

describe('campaign draft safety', () => {
  it('serializes only the chosen audience and preserves a preselected source', () => {
    const d = prefill(emptyDraft(), new URLSearchParams('segmentId=s1'));
    d.listIds = ['stale-list'];
    expect(toCreateInput(d).audience).toMatchObject({
      listIds: [],
      segmentId: 's1',
      contactIds: [],
    });
  });
  it('blocks invalid variant shares, duplicate letters and incomplete mappings', () => {
    const d = emptyDraft();
    d.variants = [
      { key: 'A', templateId: 't1', splitPct: 0 },
      { key: 'A', templateId: 't2', splitPct: 100 },
    ];
    expect(stepProblems(1, d).length).toBeGreaterThan(1);
    d.variables = { '1': { kind: 'field', value: '' } };
    expect(stepProblems(2, d)).not.toEqual([]);
  });
  it('requires weekdays, a valid timezone and future end for recurring campaigns', () => {
    const d = emptyDraft();
    d.scheduleMode = 'recurring';
    d.recurrence = { freq: 'weekly', days: [], time: '09:00', until: null };
    expect(stepProblems(4, d)).toEqual(['Choose at least one weekday']);
    d.recurrence.days = [1, 3];
    d.timezone = 'invalid/timezone';
    expect(stepProblems(4, d)).toEqual(['Choose a valid timezone']);
    d.timezone = 'Asia/Kolkata';
    expect(stepProblems(4, d)).toEqual([]);
    expect(toCreateInput(d).schedule).toMatchObject({
      kind: 'recurring',
      timezone: 'Asia/Kolkata',
      recurrence: { days: [1, 3] },
    });
  });
  it('preserves the saved recurrence and does not require a consumed media token on edit', () => {
    const d = draftFromCampaign(fakeWaCampaign());
    expect(toCreateInput(d)).not.toHaveProperty('headerMediaToken');
    d.headerMediaToken = null;
    expect(toCreateInput(d)).toHaveProperty('headerMediaToken', null);
  });
});

it('validates A/B winner bounds, recent-send bounds and recurrence dates before saving', () => {
  const d = emptyDraft();
  d.variants = [
    { key: 'A', templateId: 'a', splitPct: 50 },
    { key: 'B', templateId: 'b', splitPct: 50 },
  ];
  expect(stepProblems(1, d)).toContain('Choose the winner metric for A/B');
  d.abWinner = { metric: 'read', afterHours: 73 };
  expect(stepProblems(1, d)).toContain('Choose a winner after 1–72 whole hours');
  d.excludeRecentDays = 91;
  expect(stepProblems(3, d)).toContain('Skip recent sends must be 0–90 whole days');
  d.scheduleMode = 'recurring';
  d.recurrence.time = '25:00';
  expect(stepProblems(4, d)).toContain('Choose a valid recurring time');
  d.recurrence.time = '09:00';
  d.recurrence.until = '2020-01-01T00:00:00Z';
  expect(stepProblems(4, d)).toContain('The recurrence end must be in the future');
  expect(stepProblems(5, d)).toEqual([]);
});
