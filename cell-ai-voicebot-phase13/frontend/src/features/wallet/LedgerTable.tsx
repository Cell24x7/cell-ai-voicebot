import InfoOutlined from '@mui/icons-material/InfoOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';

import { DataTable, type Column } from '@/components/DataTable';
import type { LedgerEntry } from '@/services/api/types';
import { formatInAccountTz } from '@/utils/datetime';
import { formatCurrencyMicros } from '@/utils/format';

import {
  ledgerDescription,
  LEDGER_STATUS_LABELS,
  LEDGER_TYPE_LABELS,
  signedAmount,
} from './ledger-format';

const STATUS_COLOR = { held: 'warning', captured: 'success', released: 'default' } as const;

/** Ledger rows (newest first) with "Load more" and a details button per row. */
export function LedgerTable({
  rows,
  timezone,
  loading,
  error,
  onRetry,
  onOpen,
  hasMore,
  loadingMore,
  onLoadMore,
  emptyTitle = 'No transactions yet',
}: {
  rows: LedgerEntry[] | undefined;
  timezone: string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onOpen: (entry: LedgerEntry) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  emptyTitle?: string;
}) {
  const columns: Column<LedgerEntry>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (e) => formatInAccountTz(e.createdAt, timezone),
      width: 170,
    },
    { key: 'description', header: 'Description', render: (e) => ledgerDescription(e) },
    { key: 'type', header: 'Type', render: (e) => LEDGER_TYPE_LABELS[e.type] },
    {
      key: 'status',
      header: 'Status',
      render: (e) => (
        <Chip
          size="small"
          variant="outlined"
          color={STATUS_COLOR[e.status]}
          label={LEDGER_STATUS_LABELS[e.status]}
        />
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (e) => (
        <Box
          component="span"
          sx={{
            fontStyle: e.status === 'held' ? 'italic' : undefined,
            color:
              e.status === 'released'
                ? 'text.disabled'
                : e.direction === 'credit'
                  ? 'success.main'
                  : undefined,
            whiteSpace: 'nowrap',
          }}
        >
          {signedAmount(e)}
        </Box>
      ),
    },
    {
      key: 'balance',
      header: 'Balance after',
      align: 'right',
      render: (e) =>
        e.balanceAfterMicros === null ? '—' : formatCurrencyMicros(e.balanceAfterMicros),
    },
    {
      key: 'details',
      header: '',
      align: 'right',
      width: 56,
      render: (e) => (
        <Tooltip title="Details">
          <IconButton
            size="small"
            aria-label={`Details of ${ledgerDescription(e)}`}
            onClick={() => onOpen(e)}
          >
            <InfoOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ];
  return (
    <DataTable
      aria-label="Transactions"
      columns={columns}
      rows={rows}
      getRowId={(e) => e.id}
      loading={loading}
      error={error}
      onRetry={onRetry}
      emptyTitle={emptyTitle}
      emptyDescription="Recharges, call charges and adjustments appear here."
      footer={
        hasMore ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 1 }}>
            <Button onClick={onLoadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          </Box>
        ) : undefined
      }
    />
  );
}
