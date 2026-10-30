import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router';

import { formatNumber } from '@/utils/format';

import { useCampaignSummary } from './queries';

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <Stack aria-label={label}>
      <Typography variant="h5" component="span">
        {formatNumber(value)}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  );
}

/** Dashboard: running campaigns and today's campaign calls (campaigns.read). */
export function CampaignsCard() {
  const summary = useCampaignSummary();
  const s = summary.data;
  return (
    <Card variant="outlined" sx={{ height: '100%' }} component="section" aria-label="Campaigns">
      <CardContent>
        <Stack
          direction="row"
          sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}
        >
          <Typography variant="subtitle1">Campaigns</Typography>
          <Link component={RouterLink} to="/campaigns" variant="body2">
            All campaigns
          </Link>
        </Stack>
        {summary.isPending && <Skeleton variant="rounded" height={60} />}
        {summary.isError && (
          <Typography variant="body2" color="error">
            Campaigns could not be loaded.
          </Typography>
        )}
        {s && (
          <Stack spacing={1}>
            <Stack direction="row" spacing={3}>
              <Figure label="Running" value={s.running} />
              <Figure label="Calls today" value={s.callsToday} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {formatNumber(s.scheduled)} scheduled · {formatNumber(s.paused)} paused
            </Typography>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
