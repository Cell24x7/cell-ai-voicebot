import {
  Alert,
  Chip,
  Link,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router';

import { DataTable, type Column } from '@/components/DataTable';
import { STATUS_LABELS } from '@/features/calls/labels';
import { useActiveCalls } from '@/features/calls/queries';
import type { Campaign, CampaignListItem } from '@/services/api/types';

import { CAMPAIGN_STATUS_LABELS, campaignStatusColor, PAUSE_REASON_LABELS } from '../labels';
import { useCampaignRuns } from '../queries';
import { formatInZone } from '../time';

/** Runs of a recurring campaign (newest first). */
export function RunsTab({ campaignId, timezone }: { campaignId: string; timezone: string }) {
  const runs = useCampaignRuns(campaignId);
  const columns: Column<CampaignListItem>[] = [
    {
      key: 'name',
      header: 'Run',
      render: (r) => (
        <Link component={RouterLink} to={`/campaigns/${r.id}`}>
          #{r.runNumber} · {r.name}
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Chip
          size="small"
          color={campaignStatusColor(r.status)}
          label={CAMPAIGN_STATUS_LABELS[r.status]}
        />
      ),
    },
    {
      key: 'counts',
      header: 'Completed / total',
      align: 'right',
      render: (r) => `${String(r.stats.completed)} / ${String(r.stats.total)}`,
    },
    {
      key: 'started',
      header: 'Started',
      render: (r) => (r.startedAt ? formatInZone(r.startedAt, timezone) : '—'),
    },
  ];
  return (
    <DataTable
      aria-label="Runs"
      columns={columns}
      rows={runs.data}
      getRowId={(r) => r.id}
      loading={runs.isPending}
      error={runs.error}
      onRetry={() => void runs.refetch()}
      emptyTitle="No runs yet"
      emptyDescription="A run is created at every scheduled time."
    />
  );
}

/** What happened to the campaign (the detail's own history — no audit permission needed). */
export function ActivityTab({ campaign, timezone }: { campaign: Campaign; timezone: string }) {
  const history = [...campaign.history].reverse();
  if (!history.length) return <Typography color="text.secondary">Nothing yet.</Typography>;
  return (
    <Paper variant="outlined">
      <List aria-label="Activity">
        {history.map((h, i) => (
          <ListItem key={`${h.at}-${String(i)}`} divider>
            <ListItemText
              primary={`${CAMPAIGN_STATUS_LABELS[h.status]}${
                h.status === 'paused' && h.pauseReason
                  ? ` — ${PAUSE_REASON_LABELS[h.pauseReason]}`
                  : ''
              }`}
              secondary={`${formatInZone(h.at, timezone)} · ${h.by?.name ?? 'Automatic'}`}
            />
          </ListItem>
        ))}
      </List>
    </Paper>
  );
}

/** Calls of this campaign live right now → their call pages. */
export function LiveCallsPanel({ campaignId, enabled }: { campaignId: string; enabled: boolean }) {
  const active = useActiveCalls(enabled);
  const mine = (active.data ?? []).filter((c) => c.campaign?.id === campaignId);
  if (!enabled) return null;
  return (
    <Paper variant="outlined" sx={{ p: 2 }} aria-label="Live calls">
      <Typography variant="subtitle2" gutterBottom>
        Live calls ({mine.length})
      </Typography>
      {active.error && <Alert severity="error">Could not load the live calls.</Alert>}
      {!mine.length ? (
        <Typography variant="body2" color="text.secondary">
          No call in progress.
        </Typography>
      ) : (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {mine.map((c) => (
            <Chip
              key={c.id}
              component={RouterLink}
              to={`/calls/${c.id}`}
              clickable
              label={`${c.contact?.name ?? 'Contact'} · ${STATUS_LABELS[c.status]}`}
            />
          ))}
        </Stack>
      )}
    </Paper>
  );
}
