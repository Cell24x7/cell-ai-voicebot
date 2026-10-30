import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router';

import { useAuthStore } from '@/features/auth/store';
import { todayInTz } from '@/utils/datetime';

import { KpiTile } from './KpiTile';
import { useReport } from './queries';

const KEYS = ['calls_attempted', 'answer_rate', 'ptp_count', 'messages_sent', 'read_rate', 'spend'];

/** Dashboard: today against yesterday (Phase 14; needs reports.read — the page checks). */
export function DashboardKpis() {
  const timezone = useAuthStore((s) => s.session?.account.timezone ?? 'Asia/Kolkata');
  const today = todayInTz(timezone);
  const report = useReport('overview', { from: today, to: today, compare: true });
  const kpis = (report.data?.kpis ?? []).filter((k) => KEYS.includes(k.key));
  return (
    <Stack spacing={1} component="section" aria-label="Today">
      <Stack direction="row" sx={{ alignItems: 'center' }}>
        <Typography variant="subtitle1" component="h2" sx={{ flex: 1 }}>
          Today (against yesterday)
        </Typography>
        <Button component={RouterLink} to="/reports" size="small">
          View reports
        </Button>
      </Stack>
      {report.isPending && <Skeleton variant="rounded" height={96} />}
      {report.isError && (
        <Typography variant="body2" color="text.secondary">
          Today's numbers are not available right now.
        </Typography>
      )}
      <Grid container spacing={2}>
        {kpis.map((k) => (
          <Grid key={k.key} size={{ xs: 6, sm: 4, lg: 2 }}>
            <KpiTile kpi={k} />
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
}
