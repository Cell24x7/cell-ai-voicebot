import { describe, expect, it } from 'vitest';

import {
  clock,
  describeEvent,
  dispositionLabel,
  END_REASON_LABELS,
  statusColor,
  STATUS_LABELS,
} from './labels';

describe('call labels', () => {
  it('statuses, colours, end reasons, dispositions, clock', () => {
    expect(STATUS_LABELS.in_progress).toBe('In call');
    expect(statusColor('completed')).toBe('success');
    expect(statusColor('failed')).toBe('error');
    expect(statusColor('ringing')).toBe('info');
    expect(statusColor('canceled')).toBe('default');
    expect(statusColor('no_answer')).toBe('warning');
    expect(END_REASON_LABELS.wallet_empty).toBe('Wallet ran out');
    expect(dispositionLabel('promise_to_pay')).toBe('Promise to pay');
    expect(dispositionLabel('custom_one')).toBe('custom_one');
    expect(dispositionLabel(null)).toBeNull();
    expect(clock(65)).toBe('01:05');
    expect(clock(-3)).toBe('00:00');
  });

  it('timeline lines never need texts, digits or phones', () => {
    const cases: [string, Record<string, unknown>, string][] = [
      [
        'status',
        { status: 'completed', endReason: 'hangup_node' },
        'Status: Completed (Flow finished)',
      ],
      ['status', { status: 'weird', endReason: 'odd' }, 'Status: weird (odd)'],
      ['status', { status: 'ringing' }, 'Status: Ringing'],
      ['node_entered', { nodeId: 'menu', type: 'gather_dtmf' }, 'Step menu (gather dtmf)'],
      ['node_exited', { nodeId: 'menu', handle: 'key_k1' }, 'Left menu → key k1'],
      ['node_exited', { nodeId: 'greet' }, 'Left greet'],
      ['dtmf', {}, 'Key pressed'],
      ['speech_started', {}, 'Customer started speaking'],
      ['barge_in', { playedMs: 900 }, 'Customer interrupted the bot (after 900 ms)'],
      ['silence_prompt', { attempt: 2 }, 'Silence — asked again (2)'],
      ['ai_session_started', {}, 'AI agent took over'],
      ['ai_session_ended', { reason: 'no_response' }, 'AI agent finished (no response)'],
      ['ai_function_call', { name: 'check_payment_status' }, 'AI called check_payment_status'],
      ['ai_function_result', { name: 'x', ok: true }, 'x answered'],
      ['ai_function_result', { name: 'x', ok: false }, 'x failed'],
      [
        'ai_outcome',
        { disposition: 'paid', promiseToPay: true, callback: true, transfer: true, end: true },
        'Outcome: Paid, promise to pay, callback, transfer, end call',
      ],
      ['ai_outcome', {}, 'Outcome: noted'],
      ['tts', { chars: 40, cached: true }, 'Voice 40 characters (cached)'],
      ['tts', { chars: 40 }, 'Voice 40 characters'],
      ['latency', { ms: 820 }, 'Bot answered in 820 ms'],
      ['wallet_extend', { ok: true }, 'Wallet hold extended'],
      ['wallet_extend', { ok: false }, 'Wallet hold could not be extended'],
      ['transfer', { phoneLast4: '3210' }, 'Transfer to ••••3210'],
      ['recording_saved', { durationSec: 6 }, 'Recording saved (6 s)'],
      ['recording_failed', {}, 'Recording could not be saved'],
      ['error', { code: 'engine_error' }, 'Error: engine error'],
      ['something_new', { x: { nested: true } }, 'something new'],
    ];
    for (const [type, data, text] of cases) expect(describeEvent(type, data)).toBe(text);
  });
});
