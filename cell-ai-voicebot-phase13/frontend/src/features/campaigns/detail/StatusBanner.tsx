import { Alert, AlertTitle, Button } from '@mui/material';
import { Link as RouterLink } from 'react-router';

import type { Campaign } from '@/services/api/types';

import { PAUSE_REASON_HINTS, PAUSE_REASON_LABELS, waitingText } from '../labels';
import { formatInZone } from '../time';

/** Paused (why + what to do), waiting for the window, scheduled, finished, failed. */
export function StatusBanner({ campaign, timezone }: { campaign: Campaign; timezone: string }) {
  const c = campaign;
  if (c.status === 'paused' && c.pauseReason) {
    return (
      <Alert
        severity="warning"
        action={
          c.pauseReason === 'wallet_empty' ? (
            <Button color="inherit" size="small" component={RouterLink} to="/wallet">
              Add money
            </Button>
          ) : undefined
        }
      >
        <AlertTitle>
          {c.pauseReason === 'wallet_empty' && c.mode === 'dry_run'
            ? 'Paused — the wallet would run out (dry run)'
            : `Paused — ${PAUSE_REASON_LABELS[c.pauseReason].toLowerCase()}`}
        </AlertTitle>
        {PAUSE_REASON_HINTS[c.pauseReason] ?? 'Resume when you are ready.'}
      </Alert>
    );
  }
  if (c.status === 'running' && c.waitingUntil) {
    return <Alert severity="info">{waitingText(c.waitingUntil, timezone)}</Alert>;
  }
  if (c.status === 'scheduled') {
    const at = c.nextRunAt ?? c.schedule.startAt;
    return (
      <Alert severity="info">
        {c.recurring ? 'Repeats' : 'Scheduled'}
        {at ? ` — next ${formatInZone(at, timezone)}` : ''}.
      </Alert>
    );
  }
  if (c.status === 'completed') {
    const s = c.stats;
    return (
      <Alert severity="success">
        Finished{c.completedAt ? ` ${formatInZone(c.completedAt, timezone)}` : ''} — {s.completed}{' '}
        completed, {s.failed} not reached, {s.skipped} skipped.
      </Alert>
    );
  }
  if (c.status === 'failed') {
    return (
      <Alert severity="error">
        This campaign could not start{c.error ? ` (${c.error.code})` : ''} — check its flow and
        audience, then duplicate it.
      </Alert>
    );
  }
  return null;
}
