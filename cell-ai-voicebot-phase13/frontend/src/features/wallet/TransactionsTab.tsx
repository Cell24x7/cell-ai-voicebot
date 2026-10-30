import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { useAuthStore } from '@/features/auth/store';
import type { LedgerEntry } from '@/services/api/types';
import {
  walletApi,
  type LedgerQuery,
  type LedgerStatus,
  type LedgerType,
} from '@/services/api/wallet';
import { shiftYmd, startOfDayIso, todayInTz } from '@/utils/datetime';

import { walletKeys } from './keys';
import { LEDGER_STATUS_LABELS, LEDGER_TYPE_LABELS } from './ledger-format';
import { LedgerDetailDrawer } from './LedgerDetailDrawer';
import { LedgerExportDialog } from './LedgerExportDialog';
import { LedgerTable } from './LedgerTable';

const PAGE = 25;
const TYPES = Object.keys(LEDGER_TYPE_LABELS) as LedgerType[];
const STATUSES = Object.keys(LEDGER_STATUS_LABELS) as LedgerStatus[];
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** `/wallet?tab=transactions` — ledger with filters in the URL, cursor "Load more", CSV export. */
export function TransactionsTab() {
  const timezone = useAuthStore((s) => s.session?.account.timezone ?? 'Asia/Kolkata');
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<LedgerEntry | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const types = (params.get('type') ?? '')
    .split(',')
    .filter((t): t is LedgerType => (TYPES as string[]).includes(t));
  const statusParam = params.get('status');
  const status = STATUSES.find((s) => s === statusParam);
  const from = YMD.test(params.get('from') ?? '') ? (params.get('from') ?? '') : '';
  const to = YMD.test(params.get('to') ?? '') ? (params.get('to') ?? '') : '';
  const badRange = Boolean(from && to && from > to);

  const query: Omit<LedgerQuery, 'cursor'> = {
    limit: PAGE,
    ...(types.length ? { type: types } : {}),
    ...(status ? { status } : {}),
    ...(from ? { from: startOfDayIso(from, timezone) } : {}),
    ...(to ? { to: startOfDayIso(shiftYmd(to, 1), timezone) } : {}),
  };
  const ledger = useInfiniteQuery({
    queryKey: walletKeys.ledger(query),
    queryFn: ({ pageParam }) =>
      walletApi.ledger({ ...query, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '',
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
    enabled: !badRange,
  });

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const today = todayInTz(timezone);

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ alignItems: { md: 'center' } }}
      >
        <TextField
          select
          label="Type"
          size="small"
          sx={{ minWidth: 200 }}
          value={types}
          slotProps={{
            select: {
              multiple: true,
              renderValue: (v) =>
                (v as LedgerType[]).length
                  ? (v as LedgerType[]).map((t) => LEDGER_TYPE_LABELS[t]).join(', ')
                  : 'All',
              displayEmpty: true,
            },
            inputLabel: { shrink: true },
          }}
          onChange={(e) => {
            const v = e.target.value as unknown as LedgerType[];
            set('type', v.join(','));
          }}
        >
          {TYPES.map((t) => (
            <MenuItem key={t} value={t}>
              <Checkbox size="small" checked={types.includes(t)} />
              <ListItemText primary={LEDGER_TYPE_LABELS[t]} />
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Status"
          size="small"
          sx={{ minWidth: 150 }}
          value={status ?? ''}
          onChange={(e) => set('status', e.target.value)}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
        >
          <MenuItem value="">All</MenuItem>
          {STATUSES.map((s) => (
            <MenuItem key={s} value={s}>
              {LEDGER_STATUS_LABELS[s]}
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
        <Stack direction="row" spacing={1} sx={{ ml: { md: 'auto' } }}>
          {(types.length > 0 || status || from || to) && (
            <Button onClick={() => setParams({ tab: 'transactions' }, { replace: true })}>
              Clear filters
            </Button>
          )}
          <Button startIcon={<FileDownloadOutlined />} onClick={() => setExporting(true)}>
            Export
          </Button>
        </Stack>
      </Stack>
      <LedgerTable
        rows={ledger.data?.pages.flatMap((p) => p.data)}
        timezone={timezone}
        loading={ledger.isPending && !badRange}
        error={ledger.error}
        onRetry={() => void ledger.refetch()}
        onOpen={(e) => {
          setSelected(e);
          setDrawerOpen(true);
        }}
        hasMore={ledger.hasNextPage}
        loadingMore={ledger.isFetchingNextPage}
        onLoadMore={() => void ledger.fetchNextPage()}
        emptyTitle={
          types.length || status || from || to
            ? 'Nothing matches these filters'
            : 'No transactions yet'
        }
      />
      <LedgerDetailDrawer
        entry={selected}
        open={drawerOpen}
        timezone={timezone}
        onClose={() => setDrawerOpen(false)}
      />
      {exporting && (
        <LedgerExportDialog
          defaultFrom={from || `${today.slice(0, 8)}01`}
          defaultTo={to || today}
          timezone={timezone}
          onClose={() => setExporting(false)}
        />
      )}
    </Stack>
  );
}
