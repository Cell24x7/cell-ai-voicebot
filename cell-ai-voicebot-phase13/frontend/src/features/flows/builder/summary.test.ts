import { describe, expect, it } from 'vitest';

import type { DraftNode } from '@/services/api/types';

import { nodeSummary } from './summary';

const names = {
  agents: new Map([['a1', 'Recovery Bot']]),
  audios: new Map([['au1', 'Welcome tone']]),
};
const s = (type: DraftNode['type'], config: Record<string, unknown> = {}) =>
  nodeSummary({ type, config }, names);

describe('nodeSummary', () => {
  it.each<[DraftNode['type'], Record<string, unknown>, string]>([
    ['start', { triggers: ['campaign', 'test'] }, 'Starts on: campaign, test'],
    ['start', {}, 'Starts every call'],
    ['speak', { text: 'Namaste' }, 'Namaste'],
    ['speak', { text: 'x'.repeat(70) }, `${'x'.repeat(59)}…`],
    ['speak', {}, 'Nothing to say yet'],
    ['play_audio', { audioId: 'au1' }, 'Welcome tone'],
    ['play_audio', { audioId: 'gone' }, 'Pick an audio file'],
    ['gather_dtmf', { keys: [{ key: '1' }, { key: '2' }] }, 'Press 1 / 2'],
    ['gather_dtmf', { mode: 'digits', minDigits: 2, maxDigits: 6 }, 'Collect 2–6 digits'],
    ['gather_dtmf', { mode: 'digits' }, 'Collect 1–4 digits'],
    ['gather_dtmf', { prompt: { kind: 'speak', text: 'Press now' } }, 'Press now'],
    ['gather_dtmf', { prompt: { kind: 'audio', audioId: 'au1' } }, '▶ Welcome tone'],
    ['gather_dtmf', { prompt: { kind: 'audio', audioId: 'x' } }, '▶ audio'],
    ['gather_dtmf', {}, 'Add keys'],
    ['gather_speech', { intents: [{ label: 'Pay' }, { label: 'Agent' }] }, 'Intents: Pay, Agent'],
    ['gather_speech', { prompt: { kind: 'speak', text: 'Say' } }, 'Say'],
    ['gather_speech', {}, 'Listen'],
    ['ai_agent', { agentId: 'a1' }, 'Recovery Bot'],
    ['ai_agent', {}, 'Pick an AI agent'],
    [
      'api_request',
      { method: 'POST', url: 'https://api.example.com/x?y=1' },
      'POST api.example.com',
    ],
    ['api_request', { url: '{{base}}/x' }, 'GET {{base}}/x'],
    ['api_request', {}, 'Set the address'],
    ['condition_router', { rules: [{}] }, '1 rule + else'],
    ['condition_router', { rules: [{}, {}] }, '2 rules + else'],
    [
      'set_variable',
      {
        assignments: [
          { variable: 'n', op: 'increment', value: '1' },
          { variable: 'm', op: 'clear' },
          { op: 'set', value: 'x' },
        ],
      },
      'n += 1, m ∅, ? = x',
    ],
    ['set_variable', {}, 'Add an assignment'],
    ['set_disposition', { disposition: 'promise_to_pay' }, 'promise to pay'],
    ['set_disposition', {}, 'Pick a disposition'],
    ['transfer_to_agent', { phone: '+919000000000' }, 'To +919000000000'],
    ['transfer_to_agent', {}, 'Set the phone number'],
    ['send_sms', { text: 'Link' }, 'Link'],
    ['send_sms', {}, 'Write the SMS'],
    ['send_whatsapp', { templateName: 'pay_link' }, 'pay_link'],
    ['send_whatsapp', {}, 'Pick a template'],
    ['wait', { seconds: 9 }, '9 s pause'],
    ['wait', {}, '5 s pause'],
    ['hangup', { text: 'Bye' }, 'Bye'],
    ['hangup', {}, 'End the call'],
  ])('%s %j → %s', (type, config, expected) => {
    expect(s(type, config)).toBe(expected);
  });
});
