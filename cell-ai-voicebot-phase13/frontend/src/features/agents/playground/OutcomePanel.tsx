import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import type { PlaygroundOutcome } from '@/services/api/types';
import { formatCurrencyMicros, formatDateOnly } from '@/utils/format';

import { DISPOSITION_LABELS } from '../agent-form';

/** What the conversation decided so far (built-in tools, simulated). */
export function OutcomePanel({ outcome, ended }: { outcome: PlaygroundOutcome; ended: boolean }) {
  const rows: [string, string][] = [];
  if (outcome.disposition) rows.push(['Outcome', DISPOSITION_LABELS[outcome.disposition]]);
  if (outcome.promiseToPay) {
    rows.push([
      'Promise to pay',
      `${formatDateOnly(outcome.promiseToPay.date)}${outcome.promiseToPay.amountMicros !== null ? ` · ${formatCurrencyMicros(outcome.promiseToPay.amountMicros)}` : ''}`,
    ]);
  }
  if (outcome.callback) {
    rows.push([
      'Call back',
      `${formatDateOnly(outcome.callback.date)}${outcome.callback.time ? ` at ${outcome.callback.time}` : ''}`,
    ]);
  }
  if (outcome.transferRequested) rows.push(['Transfer', 'Requested']);
  if (outcome.smsTemplate) rows.push(['SMS after the call', outcome.smsTemplate]);
  if (ended || outcome.endRequested) rows.push(['Conversation', 'Ended']);
  return (
    <Paper variant="outlined" sx={{ p: 2 }} role="region" aria-label="Outcome">
      <Typography variant="subtitle2" gutterBottom>
        Outcome
      </Typography>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Nothing recorded yet.
        </Typography>
      ) : (
        <Stack spacing={0.5}>
          {rows.map(([label, value]) => (
            <Stack key={label} direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">
                {label}
              </Typography>
              <Typography variant="body2">{value}</Typography>
            </Stack>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
