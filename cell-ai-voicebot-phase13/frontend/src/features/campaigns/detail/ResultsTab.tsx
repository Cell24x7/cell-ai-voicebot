import SearchOutlined from '@mui/icons-material/SearchOutlined';
import { Box, Button, Chip, InputAdornment, Link, MenuItem, Stack, TextField } from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';

import { DataTable, type Column } from '@/components/DataTable';
import { RelativeTime } from '@/components/RelativeTime';
import { DISPOSITION_LABELS } from '@/features/agents/agent-form';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { ListCampaignContactsQuery } from '@/services/api/campaigns';
import type { CampaignContactRow, CampaignContactStatus } from '@/services/api/types';
import { formatCurrencyMicros } from '@/utils/format';

import {
  CONTACT_STATUS_LABELS,
  contactStatusColor,
  dispositionLabel,
  RESULT_LABELS,
  SKIP_REASON_LABELS,
  skipReasonLabel,
  WAIT_REASON_LABELS,
} from '../labels';
import { useCampaignContacts } from '../queries';

const PAGE = 50;

const promiseText = (r: CampaignContactRow) =>
  r.promiseToPay
    ? `${r.promiseToPay.date}${r.promiseToPay.amountMicros !== null ? ` · ${formatCurrencyMicros(r.promiseToPay.amountMicros)}` : ''}`
    : '—';
const callbackText = (r: CampaignContactRow) =>
  r.callback ? [r.callback.date, r.callback.time].filter(Boolean).join(' ') : '—';

/** Per-contact results: filters, last 4 digits only, call links, Load more. */
export function ResultsTab({ campaignId, live = false }: { campaignId: string; live?: boolean }) {
  const [status, setStatus] = useState<CampaignContactStatus | ''>('');
  const [lastResult, setLastResult] = useState<NonNullable<CampaignContactRow['lastResult']> | ''>(
    '',
  );
  const [disposition, setDisposition] = useState('');
  const [skipReason, setSkipReason] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const query: Omit<ListCampaignContactsQuery, 'cursor'> = {
    limit: PAGE,
    ...(status ? { status: [status] } : {}),
    ...(lastResult ? { lastResult } : {}),
    ...(disposition ? { disposition } : {}),
    ...(skipReason ? { skipReason } : {}),
    ...(q ? { q } : {}),
  };
  const rows = useCampaignContacts(campaignId, query, live);
  const filtered = Boolean(status || lastResult || disposition || skipReason || q);
  const columns: Column<CampaignContactRow>[] = [
    {
      key: 'contact',
      header: 'Contact',
      render: (r) => (
        <Stack>
          <Link component={RouterLink} to={`/contacts/c/${r.contact.id}`}>
            {r.contact.name ?? 'No name'}
          </Link>
          <span>••••{r.phoneLast4}</span>
        </Stack>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Stack spacing={0.5}>
          <Chip
            size="small"
            color={contactStatusColor(r.status)}
            label={CONTACT_STATUS_LABELS[r.status]}
          />
          {r.skipReason && <span>{skipReasonLabel(r.skipReason)}</span>}
          {r.waitReason && (r.status === 'pending' || r.status === 'retry_wait') && (
            <span>{WAIT_REASON_LABELS[r.waitReason]}</span>
          )}
        </Stack>
      ),
    },
    { key: 'attempts', header: 'Attempts', align: 'right', render: (r) => String(r.attempts) },
    {
      key: 'result',
      header: 'Last result',
      render: (r) => (r.lastResult ? RESULT_LABELS[r.lastResult] : '—'),
    },
    {
      key: 'disposition',
      header: 'Outcome',
      render: (r) => dispositionLabel(r.disposition) ?? '—',
    },
    { key: 'promise', header: 'Promise', render: promiseText },
    { key: 'callback', header: 'Callback', render: callbackText },
    {
      key: 'next',
      header: 'Next attempt',
      render: (r) => (r.nextAttemptAt ? <RelativeTime value={r.nextAttemptAt} /> : '—'),
    },
    {
      key: 'cost',
      header: 'Cost',
      align: 'right',
      render: (r) => formatCurrencyMicros(r.costMicros),
    },
    {
      key: 'call',
      header: '',
      render: (r) =>
        r.lastCallId ? (
          <Link component={RouterLink} to={`/calls/${r.lastCallId}`}>
            Call
          </Link>
        ) : null,
    },
  ];
  const clear = () => {
    setStatus('');
    setLastResult('');
    setDisposition('');
    setSkipReason('');
    setSearch('');
  };
  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ alignItems: { md: 'center' } }}
      >
        <TextField
          size="small"
          label="Name"
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
          }}
        />
        <TextField
          select
          size="small"
          label="Status"
          value={status}
          sx={{ minWidth: 150 }}
          onChange={(e) => setStatus(e.target.value as CampaignContactStatus | '')}
        >
          <MenuItem value="">All</MenuItem>
          {(Object.keys(CONTACT_STATUS_LABELS) as CampaignContactStatus[]).map((s) => (
            <MenuItem key={s} value={s}>
              {CONTACT_STATUS_LABELS[s]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Last result"
          value={lastResult}
          sx={{ minWidth: 150 }}
          onChange={(e) => setLastResult(e.target.value as typeof lastResult)}
        >
          <MenuItem value="">All</MenuItem>
          {(Object.keys(RESULT_LABELS) as (keyof typeof RESULT_LABELS)[]).map((s) => (
            <MenuItem key={s} value={s}>
              {RESULT_LABELS[s]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Outcome"
          value={disposition}
          sx={{ minWidth: 160 }}
          onChange={(e) => setDisposition(e.target.value)}
        >
          <MenuItem value="">All</MenuItem>
          {Object.entries(DISPOSITION_LABELS).map(([k, label]) => (
            <MenuItem key={k} value={k}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Skip reason"
          value={skipReason}
          sx={{ minWidth: 160 }}
          onChange={(e) => setSkipReason(e.target.value)}
        >
          <MenuItem value="">All</MenuItem>
          {Object.entries(SKIP_REASON_LABELS).map(([k, label]) => (
            <MenuItem key={k} value={k}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        {filtered && <Button onClick={clear}>Clear filters</Button>}
      </Stack>
      <DataTable
        aria-label="Campaign results"
        columns={columns}
        rows={rows.data?.pages.flatMap((p) => p.data)}
        getRowId={(r) => r.id}
        loading={rows.isPending}
        error={rows.error}
        onRetry={() => void rows.refetch()}
        emptyTitle={filtered ? 'Nothing matches these filters' : 'No contacts yet'}
        emptyDescription={filtered ? undefined : 'Contacts appear once the campaign starts.'}
        footer={
          rows.hasNextPage ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 1 }}>
              <Button onClick={() => void rows.fetchNextPage()} disabled={rows.isFetchingNextPage}>
                {rows.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </Box>
          ) : undefined
        }
      />
    </Stack>
  );
}
