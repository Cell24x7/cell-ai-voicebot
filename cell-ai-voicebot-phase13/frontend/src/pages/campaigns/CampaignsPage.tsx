import AddOutlined from '@mui/icons-material/AddOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  InputAdornment,
  LinearProgress,
  Link,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Tabs,
  Tab,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router';

import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { usePermission } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';
import { CAMPAIGN_TYPES, type CampaignType } from '@/features/calls/capabilities';
import { CampaignActions } from '@/features/campaigns/CampaignActions';
import {
  CAMPAIGN_STATUS_LABELS,
  campaignStatusColor,
  PAUSE_REASON_LABELS,
} from '@/features/campaigns/labels';
import { NewCampaignDialog } from '@/features/campaigns/NewCampaignDialog';
import {
  useCampaignLiveUpdates,
  useCampaigns,
  useCanWriteCampaigns,
} from '@/features/campaigns/queries';
import { formatInZone } from '@/features/campaigns/time';
import { useFlows } from '@/features/flows/queries';
import { CampaignList } from '@/features/whatsapp-campaigns/CampaignList';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { ListCampaignsQuery } from '@/services/api/campaigns';
import type { CampaignListItem, CampaignStatus } from '@/services/api/types';
import { formatCurrencyMicros } from '@/utils/format';

const PAGE = 25;
const STATUSES = Object.keys(CAMPAIGN_STATUS_LABELS) as CampaignStatus[];

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function StatusCell({ c, timezone }: { c: CampaignListItem; timezone: string }) {
  return (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
      <Tooltip
        title={c.status === 'paused' && c.pauseReason ? PAUSE_REASON_LABELS[c.pauseReason] : ''}
      >
        <Chip
          size="small"
          color={campaignStatusColor(c.status)}
          label={CAMPAIGN_STATUS_LABELS[c.status]}
        />
      </Tooltip>
      {c.waitingUntil && (
        <Chip
          size="small"
          variant="outlined"
          label={`Waiting · ${formatInZone(c.waitingUntil, timezone)}`}
        />
      )}
    </Stack>
  );
}

/** `/campaigns` — every campaign, filters in the URL, live counters. */
export function CampaignsPage() {
  const [params, setParams] = useSearchParams();
  const canPhone = usePermission('campaigns.read');
  const canWhatsApp = usePermission('whatsapp.campaigns.read');
  const raw = params.get('line');
  const line: CampaignType = !canPhone
    ? 'whatsapp'
    : raw === 'whatsapp' || raw === 'whatsapp-call'
      ? raw
      : 'phone';
  return (
    <>
      <Tabs
        value={line}
        aria-label="Campaign line"
        onChange={(_e, value: string) => setParams({ line: value })}
        sx={{ mb: 2 }}
      >
        {CAMPAIGN_TYPES.filter((type) => (type.value === 'whatsapp' ? canWhatsApp : canPhone)).map(
          (type) => (
            <Tab key={type.value} value={type.value} label={type.label} />
          ),
        )}
      </Tabs>
      {line === 'whatsapp' ? (
        canWhatsApp ? (
          <>
            <PageHeader
              title="WhatsApp campaigns"
              subtitle="Send approved templates and track delivery and replies"
            />
            <CampaignList />
          </>
        ) : (
          <Typography>You do not have access to WhatsApp campaigns.</Typography>
        )
      ) : (
        <PhoneCampaignsPage key={line} whatsapp={line === 'whatsapp-call'} />
      )}
    </>
  );
}

function PhoneCampaignsPage({ whatsapp }: { whatsapp: boolean }) {
  const timezone = useAuthStore((s) => s.session?.account.timezone ?? 'Asia/Kolkata');
  const canWrite = useCanWriteCampaigns();
  const [params, setParams] = useSearchParams();
  const [choosing, setChoosing] = useState(false);
  useCampaignLiveUpdates();
  const flows = useFlows({ limit: 100 });

  const status = (params.get('status') ?? '')
    .split(',')
    .filter((s): s is CampaignStatus => (STATUSES as string[]).includes(s));
  const mode =
    params.get('mode') === 'dry_run' || params.get('mode') === 'live' ? params.get('mode') : '';
  const flowId = params.get('flowId') ?? '';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebouncedValue(search.trim(), 300);
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  useEffect(() => {
    if ((params.get('q') ?? '') === q) return;
    const next = new URLSearchParams(params);
    if (q) next.set('q', q);
    else next.delete('q');
    setParams(next, { replace: true });
  }, [q, params, setParams]);

  const query: Omit<ListCampaignsQuery, 'cursor'> = {
    limit: PAGE,
    line: whatsapp ? 'whatsapp' : 'phone',
    ...(status.length ? { status } : {}),
    ...(mode ? { mode: mode as 'dry_run' | 'live' } : {}),
    ...(flowId ? { flowId } : {}),
    ...(params.get('q') ? { q: params.get('q') ?? '' } : {}),
  };
  const campaigns = useCampaigns(query);
  const filtered =
    status.length > 0 || Boolean(mode) || Boolean(flowId) || Boolean(params.get('q'));

  const columns: Column<CampaignListItem>[] = [
    {
      key: 'name',
      header: 'Campaign',
      render: (c) => (
        <Stack spacing={0.25}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Link component={RouterLink} to={`/campaigns/${c.id}`}>
              {c.name}
            </Link>
            {c.mode === 'dry_run' && <Chip size="small" variant="outlined" label="Dry run" />}
            {c.line === 'voice_api' && (
              <Chip size="small" variant="outlined" label="Recorded voice" />
            )}
            {c.recurring && <Chip size="small" variant="outlined" label="Repeats" />}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {c.line === 'voice_api'
              ? `${c.voice?.kind === 'ivr' ? 'IVR' : 'Audio'}: ${c.voice?.name || '—'}`
              : c.program?.kind === 'agent'
                ? c.program.name || 'AI agent'
                : c.flow.name || 'Deleted flow'}
            {c.flow.version ? ` · v${String(c.flow.version)}` : ''}
          </Typography>
        </Stack>
      ),
    },
    { key: 'status', header: 'Status', render: (c) => <StatusCell c={c} timezone={timezone} /> },
    {
      key: 'progress',
      header: 'Progress',
      width: 180,
      render: (c) => {
        const done = c.stats.completed + c.stats.failed + c.stats.skipped + c.stats.canceled;
        return (
          <Box>
            <LinearProgress
              variant="determinate"
              value={c.progressPct}
              aria-label={`${c.name} progress`}
            />
            <Typography variant="caption" color="text.secondary">
              {done} / {c.stats.total}
            </Typography>
          </Box>
        );
      },
    },
    {
      key: 'answered',
      header: 'Answered',
      align: 'right',
      render: (c) => `${String(pct(c.stats.answered, c.stats.attempts))} %`,
    },
    {
      key: 'cost',
      header: 'Spend',
      align: 'right',
      render: (c) =>
        c.mode === 'dry_run' ? (
          <Tooltip title="Would have cost (dry run — nothing charged)">
            <span>{formatCurrencyMicros(c.virtualCostMicros)}*</span>
          </Tooltip>
        ) : (
          formatCurrencyMicros(c.spentMicros)
        ),
    },
    {
      key: 'next',
      header: 'Next run',
      render: (c) => (c.nextRunAt ? formatInZone(c.nextRunAt, timezone) : '—'),
    },
    { key: 'actions', header: '', align: 'right', render: (c) => <CampaignActions campaign={c} /> },
  ];

  return (
    <>
      <PageHeader
        title={whatsapp ? 'WhatsApp call campaigns' : 'Campaigns'}
        subtitle={
          whatsapp
            ? 'WhatsApp calls with a flow or AI agent, inside your calling window'
            : 'Phone calls with a flow or AI agent, or a recorded voice / IVR message'
        }
        actions={
          canWrite ? (
            <Button
              variant="contained"
              startIcon={<AddOutlined />}
              onClick={() => setChoosing(true)}
            >
              New campaign
            </Button>
          ) : undefined
        }
      />
      <NewCampaignDialog open={choosing} onClose={() => setChoosing(false)} />
      <Stack spacing={2}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ alignItems: { md: 'center' } }}
        >
          <TextField
            size="small"
            label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined fontSize="small" />
                  </InputAdornment>
                ),
              },
              htmlInput: { maxLength: 100 },
            }}
          />
          <TextField
            select
            label="Status"
            size="small"
            sx={{ minWidth: 180 }}
            value={status}
            slotProps={{
              select: {
                multiple: true,
                displayEmpty: true,
                renderValue: (v) =>
                  (v as CampaignStatus[]).length
                    ? (v as CampaignStatus[]).map((s) => CAMPAIGN_STATUS_LABELS[s]).join(', ')
                    : 'All',
              },
              inputLabel: { shrink: true },
            }}
            onChange={(e) => set('status', (e.target.value as unknown as string[]).join(','))}
          >
            {STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                <Checkbox size="small" checked={status.includes(s)} />
                <ListItemText primary={CAMPAIGN_STATUS_LABELS[s]} />
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Mode"
            size="small"
            sx={{ minWidth: 140 }}
            value={mode ?? ''}
            onChange={(e) => set('mode', e.target.value || null)}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="dry_run">Dry run</MenuItem>
            <MenuItem value="live">Live</MenuItem>
          </TextField>
          <TextField
            select
            label="Flow"
            size="small"
            sx={{ minWidth: 180 }}
            value={flowId}
            onChange={(e) => set('flowId', e.target.value || null)}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value="">All</MenuItem>
            {(flows.data?.data ?? []).map((f) => (
              <MenuItem key={f.id} value={f.id}>
                {f.name}
              </MenuItem>
            ))}
          </TextField>
          {filtered && (
            <Button
              sx={{ ml: { md: 'auto' } }}
              onClick={() => {
                setSearch('');
                setParams({}, { replace: true });
              }}
            >
              Clear filters
            </Button>
          )}
        </Stack>
        <DataTable
          aria-label="Campaigns"
          columns={columns}
          rows={campaigns.data?.pages.flatMap((p) => p.data)}
          getRowId={(c) => c.id}
          loading={campaigns.isPending}
          error={campaigns.error}
          onRetry={() => void campaigns.refetch()}
          emptyTitle={filtered ? 'Nothing matches these filters' : 'No campaigns yet'}
          emptyDescription={
            filtered
              ? undefined
              : canWrite
                ? 'Create a campaign — start with a dry run to see how it goes.'
                : 'Campaigns your team creates appear here.'
          }
          footer={
            campaigns.hasNextPage ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 1 }}>
                <Button
                  onClick={() => void campaigns.fetchNextPage()}
                  disabled={campaigns.isFetchingNextPage}
                >
                  {campaigns.isFetchingNextPage ? 'Loading…' : 'Load more'}
                </Button>
              </Box>
            ) : undefined
          }
        />
        {(campaigns.data?.pages[0]?.data ?? []).some((c) => c.mode === 'dry_run') && (
          <Typography variant="caption" color="text.secondary">
            * Dry runs: what the calls would have cost — nothing was charged.
          </Typography>
        )}
      </Stack>
    </>
  );
}
