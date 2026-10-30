import AddIcCallOutlined from '@mui/icons-material/AddIcCallOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router';

import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { RelativeTime } from '@/components/RelativeTime';
import { useCan, usePermission } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';
import { END_REASON_LABELS, STATUS_LABELS, statusColor } from '@/features/calls/labels';
import { useCallLiveUpdates, useCalls, useCanTriggerCalls } from '@/features/calls/queries';
import { useCampaigns } from '@/features/campaigns/queries';
import { SENTIMENT_LABELS, sentimentColor, type SentimentLabel } from '@/features/insights/labels';
import { outcomeLabel, useDispositions } from '@/features/insights/queries';
import { RecordExportButton } from '@/features/reports/RecordExportButton';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { ListCallsQuery } from '@/services/api/calls';
import { recordExportsApi } from '@/services/api/record-exports';
import type { Call } from '@/services/api/types';
import { shiftYmd, startOfDayIso } from '@/utils/datetime';
import { formatCurrencyMicros } from '@/utils/format';

const PAGE = 25;
const STATUSES = ['in_progress', 'completed', 'failed', 'canceled'] as const;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const PROVIDER_LABELS: Record<NonNullable<Call['provider']>, string> = {
  webcall: 'Browser',
  dryrun: 'Simulated',
  sip: 'Phone line',
  notifynow: 'NotifyNow',
  whatsapp: 'WhatsApp',
};
const isProvider = (v: string | null): v is NonNullable<Call['provider']> =>
  v !== null && v in PROVIDER_LABELS;

const sourceText = (c: Call) => {
  // Phase 12: a WhatsApp call by a team member has no program
  if (c.source.kind === null) return 'Team member';
  const name = c.source.name ?? (c.source.kind === 'flow' ? 'Deleted flow' : 'Deleted agent');
  if (c.source.kind === 'agent') return `${name} (agent)`;
  const v = c.source.flowVersionRef;
  return `${name} · ${v === 'draft' ? 'draft' : `v${String(v)}`}`;
};

/** `/calls` — every call of the account, newest first, filters in the URL. */
export function CallsPage() {
  const timezone = useAuthStore((s) => s.session?.account.timezone ?? 'Asia/Kolkata');
  const canTrigger = useCanTriggerCalls();
  const canCampaigns = usePermission('campaigns.read');
  const [params, setParams] = useSearchParams();
  const campaignOptions = useCampaigns({ limit: 50 }, canCampaigns);
  useCallLiveUpdates();

  const status = (params.get('status') ?? '')
    .split(',')
    .filter((s): s is (typeof STATUSES)[number] => (STATUSES as readonly string[]).includes(s));
  const testOnly = params.get('test') === '1';
  const from = YMD.test(params.get('from') ?? '') ? (params.get('from') ?? '') : '';
  const to = YMD.test(params.get('to') ?? '') ? (params.get('to') ?? '') : '';
  const badRange = Boolean(from && to && from > to);
  const provider = params.get('provider');
  const direction = params.get('direction');
  const mode = params.get('mode');
  const whatsapp = provider === 'whatsapp';
  const campaignId = params.get('campaignId') ?? '';
  // Phase 14 record filters
  const outcomes = (params.get('disposition') ?? '')
    .split(',')
    .filter((d) => /^[a-z0-9_]{1,40}$/.test(d));
  const sentiment = params.get('sentiment');
  const isSentiment = (v: string | null): v is SentimentLabel =>
    v !== null && v in SENTIMENT_LABELS;
  const promiseOnly = params.get('promise') === '1';
  const dispositions = useDispositions();
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

  const query: Omit<ListCallsQuery, 'cursor'> = {
    limit: PAGE,
    ...(status.length ? { status: [...status] } : {}),
    ...(testOnly ? { isTest: true } : {}),
    ...(params.get('q') ? { q: params.get('q') ?? '' } : {}),
    ...(params.get('flowId') ? { flowId: params.get('flowId') ?? '' } : {}),
    ...(params.get('agentId') ? { agentId: params.get('agentId') ?? '' } : {}),
    ...(params.get('contactId') ? { contactId: params.get('contactId') ?? '' } : {}),
    ...(campaignId ? { campaignId } : {}),
    ...(outcomes.length ? { disposition: outcomes } : {}),
    ...(isSentiment(sentiment) ? { sentiment } : {}),
    ...(promiseOnly ? { hasPromise: true } : {}),
    ...(isProvider(provider) ? { provider } : {}),
    ...(whatsapp && (direction === 'inbound' || direction === 'outbound') ? { direction } : {}),
    ...(whatsapp && (mode === 'human' || mode === 'ai') ? { mode } : {}),
    ...(from ? { from: startOfDayIso(from, timezone) } : {}),
    ...(to ? { to: startOfDayIso(shiftYmd(to, 1), timezone) } : {}),
  };
  const calls = useCalls(query);
  const can = useCan();
  // the export takes the same filters, with days instead of instants
  const { limit: _limit, from: _from, to: _to, ...exportFilters } = query;
  const filtered =
    status.length > 0 ||
    testOnly ||
    Boolean(params.get('q')) ||
    Boolean(from) ||
    Boolean(to) ||
    Boolean(campaignId) ||
    outcomes.length > 0 ||
    isSentiment(sentiment) ||
    promiseOnly ||
    isProvider(provider);

  const columns: Column<Call>[] = [
    {
      key: 'time',
      header: 'When',
      render: (c) => (
        <Link component={RouterLink} to={`/calls/${c.id}`}>
          <RelativeTime value={c.createdAt} />
        </Link>
      ),
    },
    {
      key: 'source',
      header: 'Flow / agent',
      render: (c) => (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <span>{sourceText(c)}</span>
          {c.isTest && <Chip size="small" variant="outlined" label="Test" />}
          {c.provider === 'dryrun' && <Chip size="small" variant="outlined" label="Simulated" />}
          {c.provider === 'whatsapp' && (
            <Chip size="small" color="success" variant="outlined" label="WhatsApp" />
          )}
          {c.campaign && (
            <Link component={RouterLink} to={`/campaigns/${c.campaign.id}`} variant="body2">
              {c.campaign.name}
            </Link>
          )}
        </Stack>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (c) =>
        `${c.direction === 'inbound' ? 'Incoming' : 'Outgoing'} · ${c.mode === 'human' ? 'Team member' : 'AI'}`,
    },
    { key: 'contact', header: 'Contact', render: (c) => c.contact?.name || 'Typed values' },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <Chip size="small" color={statusColor(c.status)} label={STATUS_LABELS[c.status]} />
      ),
    },
    {
      key: 'result',
      header: 'Result',
      render: (c) => (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <span>
            {outcomeLabel(c.disposition, dispositions.data) ??
              (c.endReason ? END_REASON_LABELS[c.endReason] : '—')}
          </span>
          {c.insights?.hasPromise && (
            <Chip size="small" color="success" variant="outlined" label="Promise" />
          )}
          {c.insights?.sentiment && c.insights.sentiment !== 'neutral' && (
            <Chip
              size="small"
              variant="outlined"
              color={sentimentColor(c.insights.sentiment)}
              label={SENTIMENT_LABELS[c.insights.sentiment]}
            />
          )}
        </Stack>
      ),
    },
    {
      key: 'duration',
      header: 'Length',
      align: 'right',
      render: (c) => `${String(c.durationSec)} s`,
    },
    {
      key: 'cost',
      header: 'Cost',
      align: 'right',
      render: (c) => formatCurrencyMicros(c.cost.totalMicros),
    },
  ];

  return (
    <>
      <PageHeader
        title="Calls"
        subtitle="Test calls and their recordings, transcripts and costs"
        actions={
          <Stack direction="row" spacing={1}>
            {can('calls.export') && (
              <RecordExportButton
                title="Export calls"
                note="Exports the calls matching the filters on this page (up to 200,000)."
                options={[
                  {
                    key: 'includePhone',
                    label: 'Full phone numbers',
                    disabled: !can('contacts.export'),
                    help: can('contacts.export')
                      ? undefined
                      : 'Numbers are shortened — full numbers need the contacts export permission.',
                  },
                  { key: 'includeSummary', label: 'AI summaries' },
                ]}
                start={(format, chosen) =>
                  recordExportsApi.calls({
                    ...exportFilters,
                    format,
                    ...(from ? { from } : {}),
                    ...(to ? { to } : {}),
                    includePhone: Boolean(chosen.includePhone),
                    includeSummary: Boolean(chosen.includeSummary),
                  })
                }
              />
            )}
            {canTrigger && (
              <Button
                variant="contained"
                startIcon={<AddIcCallOutlined />}
                component={RouterLink}
                to="/calls/test"
              >
                New test call
              </Button>
            )}
          </Stack>
        }
      />
      <Stack spacing={2}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ alignItems: { md: 'center' } }}
        >
          <TextField
            size="small"
            label="Contact name"
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
              htmlInput: { maxLength: 80 },
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
                  (v as string[]).length
                    ? (v as Call['status'][]).map((s) => STATUS_LABELS[s]).join(', ')
                    : 'All',
              },
              inputLabel: { shrink: true },
            }}
            onChange={(e) => set('status', (e.target.value as unknown as string[]).join(','))}
          >
            {STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                <Checkbox size="small" checked={status.includes(s)} />
                <ListItemText primary={STATUS_LABELS[s]} />
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="From"
            type="date"
            size="small"
            value={from}
            onChange={(e) => set('from', e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="To"
            type="date"
            size="small"
            value={to}
            onChange={(e) => set('to', e.target.value)}
            error={badRange}
            helperText={badRange ? 'Must be after From' : undefined}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            select
            label="Line"
            size="small"
            sx={{ minWidth: 140 }}
            value={isProvider(provider) ? provider : ''}
            onChange={(e) => set('provider', e.target.value)}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value="">All</MenuItem>
            {(Object.keys(PROVIDER_LABELS) as NonNullable<Call['provider']>[]).map((p) => (
              <MenuItem key={p} value={p}>
                {PROVIDER_LABELS[p]}
              </MenuItem>
            ))}
          </TextField>
          {whatsapp && (
            <>
              <TextField
                select
                label="Direction"
                size="small"
                sx={{ minWidth: 140 }}
                value={direction === 'inbound' || direction === 'outbound' ? direction : ''}
                onChange={(e) => set('direction', e.target.value)}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="inbound">Incoming</MenuItem>
                <MenuItem value="outbound">Outgoing</MenuItem>
              </TextField>
              <TextField
                select
                label="Answered by"
                size="small"
                sx={{ minWidth: 150 }}
                value={mode === 'human' || mode === 'ai' ? mode : ''}
                onChange={(e) => set('mode', e.target.value)}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              >
                <MenuItem value="">Anyone</MenuItem>
                <MenuItem value="human">Team member</MenuItem>
                <MenuItem value="ai">AI</MenuItem>
              </TextField>
            </>
          )}
          {canCampaigns && (
            <TextField
              select
              label="Campaign"
              size="small"
              sx={{ minWidth: 180 }}
              value={
                campaignOptions.data?.pages[0]?.data.some((cp) => cp.id === campaignId)
                  ? campaignId
                  : ''
              }
              onChange={(e) => set('campaignId', e.target.value)}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            >
              <MenuItem value="">All</MenuItem>
              {(campaignOptions.data?.pages[0]?.data ?? []).map((cp) => (
                <MenuItem key={cp.id} value={cp.id}>
                  {cp.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            select
            label="Outcome"
            size="small"
            sx={{ minWidth: 180 }}
            value={outcomes}
            slotProps={{
              select: {
                multiple: true,
                displayEmpty: true,
                renderValue: (v) =>
                  (v as string[]).length
                    ? (v as string[]).map((k) => outcomeLabel(k, dispositions.data)).join(', ')
                    : 'All',
              },
              inputLabel: { shrink: true },
            }}
            onChange={(e) => set('disposition', (e.target.value as unknown as string[]).join(','))}
          >
            {(dispositions.data ?? []).map((d) => (
              <MenuItem key={d.key} value={d.key}>
                <Checkbox size="small" checked={outcomes.includes(d.key)} />
                <ListItemText primary={d.label} />
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Customer mood"
            size="small"
            sx={{ minWidth: 150 }}
            value={isSentiment(sentiment) ? sentiment : ''}
            onChange={(e) => set('sentiment', e.target.value)}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value="">Any</MenuItem>
            {(Object.keys(SENTIMENT_LABELS) as SentimentLabel[]).map((k) => (
              <MenuItem key={k} value={k}>
                {SENTIMENT_LABELS[k]}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={
              <Switch
                checked={promiseOnly}
                onChange={(e) => set('promise', e.target.checked ? '1' : null)}
              />
            }
            label="Promise to pay"
          />
          <FormControlLabel
            control={
              <Switch
                checked={testOnly}
                onChange={(e) => set('test', e.target.checked ? '1' : null)}
              />
            }
            label="Test calls only"
          />
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
        {(params.get('flowId') || params.get('agentId') || params.get('contactId')) && (
          <Typography variant="body2" color="text.secondary">
            Showing the calls of one{' '}
            {params.get('flowId') ? 'flow' : params.get('agentId') ? 'agent' : 'contact'}.{' '}
            <Link
              component="button"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete('flowId');
                next.delete('agentId');
                next.delete('contactId');
                setParams(next, { replace: true });
              }}
            >
              Show all
            </Link>
          </Typography>
        )}
        <DataTable
          aria-label="Calls"
          columns={columns}
          rows={badRange ? [] : calls.data?.pages.flatMap((p) => p.data)}
          getRowId={(c) => c.id}
          loading={calls.isPending && !badRange}
          error={calls.error}
          onRetry={() => void calls.refetch()}
          emptyTitle={filtered ? 'Nothing matches these filters' : 'No calls yet'}
          emptyDescription={
            filtered
              ? undefined
              : 'Start a test call from here, a flow or an agent — it appears in this list.'
          }
          footer={
            calls.hasNextPage ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 1 }}>
                <Button
                  onClick={() => void calls.fetchNextPage()}
                  disabled={calls.isFetchingNextPage}
                >
                  {calls.isFetchingNextPage ? 'Loading…' : 'Load more'}
                </Button>
              </Box>
            ) : undefined
          }
        />
      </Stack>
    </>
  );
}
