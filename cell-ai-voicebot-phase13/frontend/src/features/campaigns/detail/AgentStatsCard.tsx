import {
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import { campaignsApi } from '@/services/api/campaigns';

const minutes = (sec: number) =>
  sec < 60 ? `${String(sec)} s` : `${String(Math.floor(sec / 60))} min ${String(sec % 60)} s`;

/** CM (D17): who talked on the campaign — per member (and the AI) calls and outcomes. */
export function AgentStatsCard({ campaignId, live }: { campaignId: string; live: boolean }) {
  const stats = useQuery({
    queryKey: ['campaigns', 'agents', campaignId],
    queryFn: () => campaignsApi.agentStats(campaignId),
    refetchInterval: live ? 30_000 : false,
    meta: { silent: true },
  });
  if (stats.isPending) return <Skeleton variant="rounded" height={80} />;
  const rows = stats.data ?? [];
  return (
    <Paper variant="outlined" sx={{ p: 2 }} component="section" aria-label="Who talked">
      <Stack spacing={1}>
        <Typography variant="subtitle1" component="h2">
          Who talked
        </Typography>
        {!rows.length ? (
          <Typography variant="body2" color="text.secondary">
            No calls yet.
          </Typography>
        ) : (
          <Table size="small" aria-label="Calls per team member">
            <TableHead>
              <TableRow>
                <TableCell>Talked by</TableCell>
                <TableCell align="right">Calls</TableCell>
                <TableCell align="right">Connected</TableCell>
                <TableCell align="right">Talk time</TableCell>
                <TableCell>Outcomes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.userId ?? 'ai'}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell align="right">{r.calls}</TableCell>
                  <TableCell align="right">{r.connected}</TableCell>
                  <TableCell align="right">{minutes(r.talkSec)}</TableCell>
                  <TableCell>
                    {Object.entries(r.outcomes)
                      .map(([k, n]) => `${k.replace(/_/g, ' ')} ${String(n)}`)
                      .join(', ') || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Stack>
    </Paper>
  );
}
