import {
  Box,
  Grid,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';

import type { Campaign } from '@/services/api/types';
import { formatCurrencyMicros } from '@/utils/format';

import { dispositionLabel, skipReasonLabel } from '../labels';

type Counter =
  | 'total'
  | 'pending'
  | 'queued'
  | 'calling'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'canceled';

const COUNTERS: { key: Counter; label: string }[] = [
  { key: 'total', label: 'Total' },
  { key: 'pending', label: 'Pending' },
  { key: 'queued', label: 'Queued' },
  { key: 'calling', label: 'Calling' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Not reached' },
  { key: 'skipped', label: 'Skipped' },
  { key: 'canceled', label: 'Canceled' },
];

/** Counters, progress, ETA, answered %, outcomes chart, skips and money. */
export function ProgressPanel({ campaign, eta }: { campaign: Campaign; eta: string | null }) {
  const s = campaign.stats;
  const answered = s.attempts > 0 ? Math.round((s.answered / s.attempts) * 100) : 0;
  const outcomes = Object.entries(s.dispositions).filter(([, n]) => n > 0);
  const skipped = Object.entries(s.skippedBy).filter(([, n]) => n > 0);
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Grid container spacing={2} aria-label="Counters">
        {COUNTERS.map(({ key, label }) => (
          <Grid key={key} size={{ xs: 4, sm: 3, md: 'grow' }}>
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
            <Typography variant="h6" aria-label={label}>
              {String(s[key])}
            </Typography>
          </Grid>
        ))}
      </Grid>
      <Box sx={{ my: 2 }}>
        <LinearProgress variant="determinate" value={campaign.progressPct} aria-label="Progress" />
        <Stack direction="row" spacing={3} sx={{ mt: 1 }} useFlexGap>
          <Typography variant="body2">{campaign.progressPct} % done</Typography>
          {eta && <Typography variant="body2">Finishes {eta}</Typography>}
          <Typography variant="body2">
            {answered} % answered · {s.attempts} calls
          </Typography>
          <Typography variant="body2">
            {campaign.mode === 'dry_run'
              ? `Would have cost ${formatCurrencyMicros(s.virtualCostMicros)}`
              : `Spent ${formatCurrencyMicros(s.spentMicros)}`}
          </Typography>
        </Stack>
      </Box>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Typography variant="subtitle2">Outcomes</Typography>
          {outcomes.length ? (
            <BarChart
              height={220}
              layout="horizontal"
              yAxis={[
                {
                  scaleType: 'band',
                  data: outcomes.map(([k]) => dispositionLabel(k) ?? k),
                  width: 140,
                },
              ]}
              series={[{ data: outcomes.map(([, n]) => n), label: 'Contacts' }]}
            />
          ) : (
            <Typography variant="body2" color="text.secondary">
              No outcomes yet.
            </Typography>
          )}
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Typography variant="subtitle2">Skipped</Typography>
          {skipped.length ? (
            <List dense aria-label="Skipped by reason">
              {skipped.map(([reason, n]) => (
                <ListItem key={reason} disableGutters>
                  <ListItemText primary={skipReasonLabel(reason)} secondary={String(n)} />
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Nobody skipped.
            </Typography>
          )}
        </Grid>
      </Grid>
    </Paper>
  );
}
