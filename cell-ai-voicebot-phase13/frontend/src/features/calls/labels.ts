import { DISPOSITION_LABELS } from '@/features/agents/agent-form';
import type { Call, CallEndReason } from '@/services/api/types';

export const STATUS_LABELS: Record<Call['status'], string> = {
  queued: 'Starting',
  ringing: 'Ringing',
  in_progress: 'In call',
  completed: 'Completed',
  failed: 'Failed',
  busy: 'Busy',
  no_answer: 'No answer',
  canceled: 'Canceled',
};

export const statusColor = (
  status: Call['status'],
): 'default' | 'info' | 'success' | 'warning' | 'error' => {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'queued' || status === 'ringing' || status === 'in_progress') return 'info';
  if (status === 'canceled') return 'default';
  return 'warning';
};

export const END_REASON_LABELS: Record<CallEndReason, string> = {
  hangup_node: 'Flow finished',
  agent_end_call: 'Agent ended the call',
  customer_hangup: 'Customer hung up',
  transferred: 'Transferred',
  max_duration: 'Time limit reached',
  wallet_empty: 'Wallet ran out',
  ai_failed: 'AI unavailable',
  engine_error: 'Flow error',
  media_timeout: 'No audio from the browser',
  media_error: 'Audio connection error',
  server_shutdown: 'Server restarted',
  canceled: 'Not connected',
  limit: 'Limit reached',
  no_answer: 'No answer',
  busy: 'Busy',
  invalid_number: 'Invalid number',
  campaign_canceled: 'Campaign canceled',
  // Phase 12 — WhatsApp calls
  rejected_by_customer: 'Customer declined',
  not_answered: 'Not answered',
  meta_failed: 'WhatsApp could not connect the call',
  permission_missing: 'No call permission',
  calling_restricted: 'Calling paused by WhatsApp',
  no_agent_available: 'Nobody answered',
  outside_call_hours: 'Outside call hours',
};

/** Disposition key → label (unknown keys shown as they are). */
export const dispositionLabel = (value: string | null | undefined): string | null =>
  value ? (DISPOSITION_LABELS[value as keyof typeof DISPOSITION_LABELS] ?? value) : null;

const str = (v: unknown): string =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : '';

/** One timeline line for a call event (events never carry texts, digits or phones). */
export const describeEvent = (type: string, data: Record<string, unknown>): string => {
  switch (type) {
    case 'status':
      return `Status: ${STATUS_LABELS[data.status as Call['status']] ?? str(data.status)}${data.endReason ? ` (${END_REASON_LABELS[data.endReason as CallEndReason] ?? str(data.endReason)})` : ''}`;
    case 'node_entered':
      return `Step ${str(data.nodeId)} (${str(data.type).replace(/_/g, ' ')})`;
    case 'node_exited':
      return `Left ${str(data.nodeId)}${data.handle ? ` → ${str(data.handle).replace(/_/g, ' ')}` : ''}`;
    case 'dtmf':
      return 'Key pressed';
    case 'speech_started':
      return 'Customer started speaking';
    case 'barge_in':
      return `Customer interrupted the bot (after ${str(data.playedMs)} ms)`;
    case 'silence_prompt':
      return `Silence — asked again (${str(data.attempt)})`;
    case 'ai_session_started':
      return 'AI agent took over';
    case 'ai_session_ended':
      return `AI agent finished (${str(data.reason).replace(/_/g, ' ')})`;
    case 'ai_function_call':
      return `AI called ${str(data.name)}`;
    case 'ai_function_result':
      return `${str(data.name)} ${data.ok ? 'answered' : 'failed'}`;
    case 'ai_outcome': {
      const parts = [
        data.disposition ? (dispositionLabel(str(data.disposition)) ?? '') : '',
        data.promiseToPay ? 'promise to pay' : '',
        data.callback ? 'callback' : '',
        data.transfer ? 'transfer' : '',
        data.end ? 'end call' : '',
      ].filter(Boolean);
      return `Outcome: ${parts.join(', ') || 'noted'}`;
    }
    case 'tts':
      return `Voice ${str(data.chars)} characters${data.cached ? ' (cached)' : ''}`;
    case 'latency':
      return `Bot answered in ${str(data.ms)} ms`;
    case 'wallet_extend':
      return data.ok ? 'Wallet hold extended' : 'Wallet hold could not be extended';
    case 'transfer':
      return `Transfer to ••••${str(data.phoneLast4)}`;
    case 'recording_saved':
      return `Recording saved (${str(data.durationSec)} s)`;
    case 'recording_failed':
      return 'Recording could not be saved';
    case 'error':
      return `Error: ${str(data.code).replace(/_/g, ' ')}`;
    default:
      return type.replace(/_/g, ' ');
  }
};

/** mm:ss */
export const clock = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
