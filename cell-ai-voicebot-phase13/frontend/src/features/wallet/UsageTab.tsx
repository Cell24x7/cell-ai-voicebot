import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';

import { EmptyState } from '@/components/EmptyState';
import { useAuthStore } from '@/features/auth/store';
import { getErrorMessage } from '@/services/api/errors';
import { walletApi } from '@/services/api/wallet';
import { daysBetween, shiftYmd, todayInTz } from '@/utils/datetime';
import { formatCurrencyMicros } from '@/utils/format';

import { walletKeys } from './keys';

const UsageChart = lazy(() => import('./UsageChart'));
const MAX_DAYS = 366;
type Preset = 'month' | '7' | '30' | 'custom';

/** `/wallet?tab=usage` — daily spend by kind for a date range (account timezone). */
export function UsageTab() {
  const timezone = useAuthStore((s) => s.session?.account.timezone ?? 'Asia/Kolkata');
  const today = todayInTz(timezone);
  const [preset, setPreset] = useState<Preset>('month');
  const [range, setRange] = useState({ from: `${today.slice(0, 8)}01`, to: today });
  const choose = (p: Preset) => {
    setPreset(p);
    if (p === 'month') setRange({ from: `${today.slice(0, 8)}01`, to: today });
    if (p === '7') setRange({ from: shiftYmd(today, -6), to: today });
    if (p === '30') setRange({ from: shiftYmd(today, -29), to: today });
  };
  const problem =
    !range.from || !range.to
      ? 'Choose both dates'
      : range.from > range.to
        ? 'The start date must be before the end date'
        : daysBetween(range.from, range.to) > MAX_DAYS
          ? 'At most one year at a time'
          : null;
  const usage = useQuery({
    queryKey: walletKeys.usage(range),
    queryFn: () => walletApi.usage(range),
    enabled: !problem,
  });
  const totals = usage.data?.totals;
  const empty = usage.data && usage.data.totals.totalMicros === 0;

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ alignItems: { md: 'center' } }}
      >
        <ToggleButtonGroup
          exclusive
          size="small"
          value={preset}
          onChange={(_e, v: Preset | null) => v && choose(v)}
          aria-label="Period"
        >
          <ToggleButton value="month">This month</ToggleButton>
          <ToggleButton value="7">Last 7 days</ToggleButton>
          <ToggleButton value="30">Last 30 days</ToggleButton>
        </ToggleButtonGroup>
        <TextField
          label="From"
          type="date"
          size="small"
          value={range.from}
          onChange={(e) => {
            setPreset('custom');
            setRange({ ...range, from: e.target.value });
          }}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="To"
          type="date"
          size="small"
          value={range.to}
          onChange={(e) => {
            setPreset('custom');
            setRange({ ...range, to: e.target.value });
          }}
          error={Boolean(problem)}
          helperText={problem ?? undefined}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>
      {usage.isError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void usage.refetch()}>
              Retry
            </Button>
          }
        >
          {getErrorMessage(usage.error)}
        </Alert>
      )}
      <Grid container spacing={2}>
        {(
          [
            ['Total', totals?.totalMicros],
            ['Calls', totals?.callMicros],
            ['AI', totals?.aiMicros],
            ['Voice (TTS)', totals?.ttsMicros],
            ['WhatsApp', totals?.whatsappMicros],
          ] as const
        ).map(([label, value]) => (
          <Grid key={label} size={{ xs: 6, md: 'grow' }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  {label}
                </Typography>
                <Typography variant="h6">
                  {value === undefined ? <Skeleton width={80} /> : formatCurrencyMicros(value)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      <Paper variant="outlined" sx={{ p: 2 }}>
        {usage.isPending && !problem && (
          <Skeleton variant="rounded" height={320} aria-label="Loading usage" />
        )}
        {empty && (
          <EmptyState
            title="No usage in this period"
            description="Call and AI charges show up here by day."
          />
        )}
        {usage.data && !empty && (
          <Suspense fallback={<Skeleton variant="rounded" height={320} />}>
            <UsageChart series={usage.data.series} />
          </Suspense>
        )}
        {usage.data && (
          <Typography variant="caption" color="text.secondary">
            Days in {usage.data.timezone}. Holds of running calls are not counted until the call
            ends.
          </Typography>
        )}
      </Paper>
    </Stack>
  );
}
