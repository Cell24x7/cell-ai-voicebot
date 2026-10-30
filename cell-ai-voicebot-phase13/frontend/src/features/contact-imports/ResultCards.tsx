import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';

import type { ImportJob } from '@/services/api/types';
import { formatNumber } from '@/utils/format';

/** Totals as cards — wording depends on "will" (checked) vs "did" (imported). */
export function ResultCards({ job, done }: { job: ImportJob; done: boolean }) {
  const t = job.totals;
  const dnd = job.kind === 'dnd';
  const cards = [
    { label: 'Rows', value: t.rows },
    {
      label: dnd ? (done ? 'Added' : 'Will add') : done ? 'Created' : 'Will create',
      value: t.created,
    },
    ...(dnd ? [] : [{ label: done ? 'Updated' : 'Will update', value: t.updated }]),
    { label: dnd ? 'Already listed' : 'Unchanged', value: t.unchanged },
    { label: 'Invalid', value: t.invalid, warn: true },
    { label: 'Duplicates in file', value: t.duplicates, warn: true },
    ...(dnd ? [] : [{ label: 'On do-not-call list', value: t.dnd, warn: true }]),
  ];
  return (
    <Grid container spacing={1.5}>
      {cards.map((c) => (
        <Grid key={c.label} size={{ xs: 6, sm: 4, md: 'grow' }}>
          <Card variant="outlined" component="section" aria-label={c.label}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">
                {c.label}
              </Typography>
              <Typography variant="h6" color={c.warn && c.value > 0 ? 'warning.main' : undefined}>
                {formatNumber(c.value)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}
