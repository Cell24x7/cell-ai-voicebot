import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router';

import { RelativeTime } from '@/components/RelativeTime';
import { formatCurrencyMicros } from '@/utils/format';

import { STATUS_LABELS, statusColor } from './labels';
import { useCalls, useCanTriggerCalls } from './queries';

/** Dashboard: the last five calls with status and cost. */
export function RecentCallsCard() {
  const calls = useCalls({ limit: 5 });
  const canTrigger = useCanTriggerCalls();
  const rows = calls.data?.pages[0]?.data ?? [];
  return (
    <Card variant="outlined" sx={{ height: '100%' }} component="section" aria-label="Recent calls">
      <CardContent>
        <Stack
          direction="row"
          sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}
        >
          <Typography variant="subtitle1">Recent calls</Typography>
          <Link component={RouterLink} to="/calls" variant="body2">
            All calls
          </Link>
        </Stack>
        {calls.isPending && <Skeleton variant="rounded" height={80} />}
        {calls.isError && (
          <Typography variant="body2" color="error">
            Calls could not be loaded.
          </Typography>
        )}
        {calls.isSuccess && rows.length === 0 && (
          <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
            <Typography variant="body2" color="text.secondary">
              No calls yet.
            </Typography>
            {canTrigger && (
              <Button size="small" component={RouterLink} to="/calls/test">
                Make a test call
              </Button>
            )}
          </Stack>
        )}
        <Stack spacing={1}>
          {rows.map((c) => (
            <Stack key={c.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Link
                component={RouterLink}
                to={`/calls/${c.id}`}
                variant="body2"
                sx={{ flex: 1, minWidth: 0 }}
                noWrap
              >
                {c.source.name ?? 'Call'} · {c.contact?.name || 'typed values'}
              </Link>
              <Chip size="small" color={statusColor(c.status)} label={STATUS_LABELS[c.status]} />
              <Typography variant="caption" color="text.secondary">
                {formatCurrencyMicros(c.cost.totalMicros)} · <RelativeTime value={c.createdAt} />
              </Typography>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
