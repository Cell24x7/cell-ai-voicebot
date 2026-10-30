import BuildOutlined from '@mui/icons-material/BuildOutlined';
import CallEndOutlined from '@mui/icons-material/CallEndOutlined';
import EventOutlined from '@mui/icons-material/EventOutlined';
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import SmsOutlined from '@mui/icons-material/SmsOutlined';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactElement } from 'react';

import type { PlaygroundToolCall, PlaygroundTurn } from '@/services/api/types';
import { formatCurrencyMicros, formatNumber } from '@/utils/format';

const BUILT_IN: Record<string, { label: string; icon: ReactElement }> = {
  end_call: { label: 'End conversation', icon: <CallEndOutlined fontSize="small" /> },
  transfer_to_human: { label: 'Transfer to a person', icon: <PersonOutlined fontSize="small" /> },
  set_disposition: { label: 'Set outcome', icon: <FlagOutlined fontSize="small" /> },
  schedule_callback: { label: 'Schedule call back', icon: <EventOutlined fontSize="small" /> },
  save_promise_to_pay: { label: 'Promise to pay', icon: <HandshakeOutlined fontSize="small" /> },
  send_sms_after_call: { label: 'SMS after the call', icon: <SmsOutlined fontSize="small" /> },
};

const argsText = (args: Record<string, unknown>): string =>
  Object.entries(args)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' · ');

const GUARDRAIL_LABELS: Record<string, string> = {
  never_say: 'used a never-say phrase',
  secret_request: 'asked for a secret (OTP, PIN, card…)',
  long_number: 'contained an unknown long number',
  threat: 'contained a threat',
};

function ToolCard({ call }: { call: PlaygroundToolCall }) {
  const builtIn = call.kind === 'built_in' ? BUILT_IN[call.name] : undefined;
  return (
    <Paper
      variant="outlined"
      sx={{ p: 1, borderColor: call.ok ? 'divider' : 'error.main' }}
      role="group"
      aria-label={`Tool ${call.name}`}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        {builtIn?.icon ?? <BuildOutlined fontSize="small" />}
        <Typography variant="body2" sx={{ fontFamily: builtIn ? undefined : 'monospace' }}>
          {builtIn?.label ?? call.name}
        </Typography>
        {call.simulated && <Chip size="small" label="Simulated" color="info" variant="outlined" />}
        <Chip
          size="small"
          label={call.ok ? 'OK' : (call.error ?? 'Failed')}
          color={call.ok ? 'success' : 'error'}
          variant="outlined"
        />
        {call.kind === 'custom' && (
          <Typography variant="caption" color="text.secondary">
            {call.durationMs} ms
          </Typography>
        )}
      </Stack>
      {Object.keys(call.args).length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {argsText(call.args)}
        </Typography>
      )}
      {call.resultPreview && (
        <Typography
          variant="caption"
          sx={{ display: 'block', fontFamily: 'monospace', mt: 0.5, wordBreak: 'break-word' }}
        >
          {call.resultPreview}
        </Typography>
      )}
    </Paper>
  );
}

/** One chat turn: bubble, tool cards, knowledge references, cost. */
export function TurnView({
  turn,
  pending,
}: {
  turn: PlaygroundTurn;
  pending?: 'sending' | 'failed';
}) {
  const mine = turn.role === 'user';
  return (
    <Stack
      sx={{ alignItems: mine ? 'flex-end' : 'flex-start' }}
      spacing={0.5}
      role="listitem"
      aria-label={mine ? 'You' : 'Agent'}
    >
      {turn.toolCalls.length > 0 && (
        <Stack spacing={0.5} sx={{ maxWidth: '85%', width: '100%' }}>
          {turn.toolCalls.map((c, i) => (
            <ToolCard key={i} call={c} />
          ))}
        </Stack>
      )}
      <Box
        sx={{
          maxWidth: '85%',
          px: 1.5,
          py: 1,
          borderRadius: 2,
          bgcolor: mine ? 'primary.main' : turn.fallback ? 'warning.light' : 'action.hover',
          color: mine ? 'primary.contrastText' : 'text.primary',
          opacity: pending === 'sending' ? 0.7 : 1,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        <Typography variant="body2">{turn.text}</Typography>
      </Box>
      {turn.knowledge.length > 0 && (
        <Accordion disableGutters variant="outlined" sx={{ maxWidth: '85%', width: '100%' }}>
          <AccordionSummary expandIcon={<ExpandMoreOutlined />}>
            <Typography variant="caption">From knowledge ({turn.knowledge.length})</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1}>
              {turn.knowledge.map((k, i) => (
                <div key={i}>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {k.title} · {k.score.toFixed(2)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {k.snippet}
                  </Typography>
                </div>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}
      {!mine && (turn.costMicros > 0 || turn.inputTokens > 0 || turn.guardrail) && (
        <Typography variant="caption" color="text.secondary">
          {turn.costMicros > 0 ? formatCurrencyMicros(turn.costMicros) : 'No charge'}
          {turn.inputTokens + turn.outputTokens > 0
            ? ` · ${formatNumber(turn.inputTokens)} + ${formatNumber(turn.outputTokens)} tokens`
            : ''}
          {turn.billing === 'failed' ? ' · charge failed (wallet empty)' : ''}
          {turn.guardrail
            ? ` · reply blocked once: ${GUARDRAIL_LABELS[turn.guardrail] ?? turn.guardrail}`
            : ''}
        </Typography>
      )}
    </Stack>
  );
}
