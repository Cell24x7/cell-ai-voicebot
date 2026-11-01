import { describe, expect, it } from 'vitest';

import { fakeDelivery, fakeRule, fakeSheetPreview } from '@/test/integrations';

import {
  draftOf,
  emptyDraft,
  inputOf,
  ruleProblem,
  sampleFor,
  timingLabel,
  whenLabel,
} from './after-call/rules';
import { choicesOf, SCHEDULE_LABELS } from './sheets/sheets';
import { canReplay, endpointProblem, endpointState, eventsLabel } from './webhooks/webhooks';

const endpointDraft = { url: 'https://x.test/h', description: '', events: ['*' as const] };

describe('webhook helpers', () => {
  it('checks the address and events', () => {
    const d = { ...endpointDraft, includePersonalData: false };
    expect(endpointProblem(d)).toBeNull();
    expect(endpointProblem({ ...d, url: 'http://x.test/h' })).toBeNull();
    expect(endpointProblem({ ...d, url: 'x.test' })).toMatch(/starting with https/);
    expect(endpointProblem({ ...d, url: 'ftp://x.test' })).toMatch(/starting with https/);
    expect(endpointProblem({ ...d, url: 'https://u:p@x.test' })).toMatch(/user name or password/);
    expect(endpointProblem({ ...d, events: [] })).toBe('Choose at least one event');
  });

  it('states, replay and event labels', () => {
    expect(endpointState({ active: true, disabledReason: null })).toBe('active');
    expect(endpointState({ active: false, disabledReason: 'failing' })).toBe('failing');
    expect(endpointState({ active: false, disabledReason: 'manual' })).toBe('paused');
    expect(canReplay(fakeDelivery())).toBe(true);
    expect(canReplay(fakeDelivery({ status: 'gave_up' }))).toBe(true);
    expect(canReplay(fakeDelivery({ status: 'succeeded' }))).toBe(true);
    expect(canReplay(fakeDelivery({ status: 'pending' }))).toBe(false);
    expect(canReplay(fakeDelivery({ test: true }))).toBe(false);
    expect(eventsLabel(['*'])).toBe('All events');
    expect(eventsLabel(['call.completed'])).toBe('call.completed');
    expect(eventsLabel(['a', 'b'])).toBe('2 events');
  });
});

describe('after-call rule helpers', () => {
  it('round-trips a rule through the draft', () => {
    const rule = fakeRule({ timing: { mode: 'after', delayMinutes: 30 } });
    expect(inputOf(draftOf(rule))).toEqual({
      name: rule.name,
      when: {
        dispositions: ['promise_to_pay'],
        sentiment: [],
        hasPromise: true,
        notAnsweredInARow: null,
        callKinds: [],
      },
      send: { channelId: null, templateId: 'tpl1', params: rule.send.params },
      timing: { mode: 'after', delayMinutes: 30 },
    });
    const noPromise = draftOf(fakeRule({ when: { ...rule.when, hasPromise: false } }));
    expect(inputOf(noPromise).when.hasPromise).toBe(false);
    expect(inputOf({ ...emptyDraft(), delayMinutes: 5 }).timing).toEqual({
      mode: 'now',
      delayMinutes: null,
    });
    expect(inputOf(emptyDraft()).when.hasPromise).toBeNull();
  });

  it('finds what is missing', () => {
    const ok = { ...emptyDraft(), name: 'R', templateId: 't1' };
    expect(ruleProblem(emptyDraft(), 0)).toBe('Give the rule a name');
    expect(ruleProblem({ ...ok, templateId: '' }, 0)).toBe('Choose an approved template');
    expect(ruleProblem({ ...ok, mode: 'after', delayMinutes: null }, 0)).toBe(
      'Choose 1–1440 minutes',
    );
    expect(ruleProblem({ ...ok, mode: 'after', delayMinutes: 2000 }, 0)).toBe(
      'Choose 1–1440 minutes',
    );
    expect(ruleProblem({ ...ok, notAnsweredInARow: 11 }, 0)).toBe('Not answered: 1–10 calls');
    expect(ruleProblem(ok, 1)).toBe('Give every template variable a value');
    expect(ruleProblem({ ...ok, params: [{ from: 'text', key: null, value: '' }] }, 1)).toBe(
      'Fill every value',
    );
    expect(ruleProblem({ ...ok, params: [{ from: 'call', key: null, value: null }] }, 1)).toBe(
      'Fill every value',
    );
    expect(ruleProblem({ ...ok, params: [{ from: 'contact', key: 'name', value: null }] }, 1)).toBe(
      null,
    );
  });

  it('labels and sample values', () => {
    expect(whenLabel(fakeRule().when)).toBe('When outcome promise_to_pay, a promise to pay');
    expect(
      whenLabel({
        ...fakeRule().when,
        dispositions: [],
        sentiment: ['negative'],
        hasPromise: false,
        notAnsweredInARow: 3,
        callKinds: ['whatsapp'],
      }),
    ).toBe('When negative customer, no promise, not answered 3× in a row, whatsapp calls');
    expect(
      whenLabel({ ...fakeRule().when, dispositions: [], hasPromise: null, callKinds: [] }),
    ).toBe('After every call');
    expect(timingLabel({ mode: 'after', delayMinutes: 15 })).toBe('15 min after the call');
    expect(timingLabel({ mode: 'after', delayMinutes: null })).toBe('0 min after the call');
    expect(timingLabel({ mode: 'now', delayMinutes: null })).toBe('Right after the call');
    expect(sampleFor({ from: 'text', key: null, value: 'Hi' })).toBe('Hi');
    expect(sampleFor({ from: 'text', key: null, value: null })).toBe('');
    expect(sampleFor({ from: 'insights', key: 'promise_amount', value: null })).toBe('₹2,500');
    expect(sampleFor({ from: 'contact', key: 'city', value: null })).toBe('[city]');
    expect(sampleFor({ from: 'contact', key: null, value: null })).toBe('[…]');
  });
});

describe('sheet helpers', () => {
  it('turns the suggested mapping into choices', () => {
    const preview = fakeSheetPreview({
      columns: [...fakeSheetPreview().columns, { index: 3, header: 'Note', samples: [] }],
      suggestedMapping: [
        ...fakeSheetPreview().suggestedMapping,
        { index: 3, target: 'new_field', dateFormat: 'MDY' },
      ],
    });
    const choices = choicesOf(preview);
    expect(choices.map((c) => c.target)).toEqual(['name', 'phone', 'field:city', 'ignore']);
    expect(choices[3]?.dateFormat).toBe('MDY');
    expect(choices[0]?.dateFormat).toBe('DMY');
    expect(
      choicesOf(fakeSheetPreview({ suggestedMapping: [{ index: 2, target: 'field' }] })).map(
        (c) => c.target,
      ),
    ).toEqual(['ignore', 'ignore', 'field:']);
    expect(SCHEDULE_LABELS.hourly).toBe('Every hour');
  });
});
