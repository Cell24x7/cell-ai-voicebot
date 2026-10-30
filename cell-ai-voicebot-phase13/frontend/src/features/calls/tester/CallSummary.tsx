import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router';

import { formatCurrencyMicros } from '@/utils/format';

import { dispositionLabel, END_REASON_LABELS } from '../labels';
import { LIVE_STATUSES, useCall, useCallLiveUpdates } from '../queries';

import type { WebCallState } from './useWebCall';

/** After the call: why it ended, the outcome and what it cost (from the saved call). */
export function CallSummary({ state, onNew }: { state: WebCallState; onNew: () => void }) {
  // the media socket says "ended" before the call is saved: call.ended (or polling) refreshes it
  useCallLiveUpdates();
  const call = useCall(state.callId ?? '', { untilSettled: true });
  const c = call.data;
  const settled = c && !LIVE_STATUSES.includes(c.status);
  return (
    <Paper variant="outlined" sx={{ p: 2 }} component="section" aria-label="Call result">
      <Stack spacing={1}>
        <Typography variant="subtitle1" component="h2">
          {state.phase === 'failed' ? 'Call failed' : 'Call ended'}
        </Typography>
        {state.failure && <Alert severity="error">{state.failure.message}</Alert>}
        {state.callId && !settled && <Skeleton variant="rounded" height={60} />}
        {c && settled && (
          <>
            <Typography variant="body2">
              {c.endReason ? END_REASON_LABELS[c.endReason] : 'Ended'} · {c.durationSec} s
              {dispositionLabel(c.disposition) ? ` · ${dispositionLabel(c.disposition) ?? ''}` : ''}
            </Typography>
            <Typography variant="body2">
              Cost {formatCurrencyMicros(c.cost.totalMicros)} (voice{' '}
              {formatCurrencyMicros(c.cost.ttsMicros)}, AI {formatCurrencyMicros(c.cost.aiMicros)},
              no phone line)
            </Typography>
            <Link component={RouterLink} to={`/calls/${c.id}`}>
              Open call details — recording, transcript, timeline
            </Link>
          </>
        )}
        <Stack direction="row">
          <Button variant="contained" onClick={onNew}>
            New call
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
