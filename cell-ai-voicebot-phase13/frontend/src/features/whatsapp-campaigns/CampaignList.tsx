import {
  Button,
  Chip,
  LinearProgress,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Link as RouterLink, useSearchParams } from 'react-router';

import { DataTable, type Column } from '@/components/DataTable';
import { RelativeTime } from '@/components/RelativeTime';
import { useChannels } from '@/features/whatsapp/queries';
import type { WhatsAppCampaign, WhatsAppCampaignStatus } from '@/services/api/types';
import { formatCurrencyMicros } from '@/utils/format';

import { WA_CAMPAIGN_STATUS_LABELS, waCampaignStatusColor } from './labels';
import { useCanWriteWaCampaigns } from './permissions';
import { useWaCampaignLiveUpdates, useWaCampaigns } from './queries';

export function CampaignList() {
  const [params, setParams] = useSearchParams();
  const canWrite = useCanWriteWaCampaigns();
  const channels = useChannels();
  const raw = params.get('status') ?? '';
  const status = Object.hasOwn(WA_CAMPAIGN_STATUS_LABELS, raw)
    ? (raw as WhatsAppCampaignStatus)
    : undefined;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const campaigns = useWaCampaigns({ page, limit: 25, ...(status ? { status } : {}) });
  useWaCampaignLiveUpdates();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  const columns: Column<WhatsAppCampaign>[] = [
    {
      key: 'name',
      header: 'Campaign',
      render: (c) => (
        <Link component={RouterLink} to={`/campaigns/whatsapp/${c.id}`}>
          {c.name}
        </Link>
      ),
    },
    {
      key: 'number',
      header: 'Number',
      render: (c) => {
        const number = channels.data?.items.find((n) => n.id === c.channelId);
        return number?.displayPhoneNumber ?? number?.label ?? 'WhatsApp';
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <Chip
          size="small"
          label={WA_CAMPAIGN_STATUS_LABELS[c.status]}
          color={waCampaignStatusColor(c.status)}
        />
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
      width: 160,
      render: (c) => {
        const done = c.counters.sent + c.counters.failedTotal + c.counters.skippedTotal;
        return (
          <>
            <LinearProgress
              aria-label={`${c.name} progress`}
              variant="determinate"
              value={c.counters.total ? Math.min(100, (done / c.counters.total) * 100) : 0}
            />
            <Typography variant="caption">
              {done} / {c.counters.total}
            </Typography>
          </>
        );
      },
    },
    ...(['sent', 'delivered', 'read', 'replied'] as const).map((key) => ({
      key,
      header: key.charAt(0).toUpperCase() + key.slice(1),
      render: (c: WhatsAppCampaign) => c.counters[key],
    })),
    { key: 'cost', header: 'Cost', render: (c) => formatCurrencyMicros(c.cost.chargedMicros) },
    { key: 'created', header: 'Created', render: (c) => <RelativeTime value={c.createdAt} /> },
  ];
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
        <TextField
          select
          size="small"
          label="Status"
          value={status ?? ''}
          onChange={(e) => set('status', e.target.value)}
          slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">All</MenuItem>
          {Object.entries(WA_CAMPAIGN_STATUS_LABELS).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        {canWrite && (
          <Button component={RouterLink} to="/campaigns/whatsapp/new" variant="contained">
            New WhatsApp campaign
          </Button>
        )}
      </Stack>
      <DataTable
        aria-label="WhatsApp campaigns"
        columns={columns}
        rows={campaigns.data?.data}
        getRowId={(c) => c.id}
        loading={campaigns.isPending}
        error={campaigns.error}
        onRetry={() => void campaigns.refetch()}
        emptyTitle="No WhatsApp campaigns yet"
        pagination={{
          page,
          limit: 25,
          total: campaigns.data?.meta.total ?? 0,
          onPageChange: (p) => set('page', String(p)),
        }}
      />
    </Stack>
  );
}
