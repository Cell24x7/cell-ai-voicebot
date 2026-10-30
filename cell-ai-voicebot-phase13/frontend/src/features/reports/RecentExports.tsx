import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { DataTable, type Column } from '@/components/DataTable';
import { RelativeTime } from '@/components/RelativeTime';
import { StatusChip } from '@/components/StatusChip';
import { getErrorMessage } from '@/services/api/errors';
import { recordExportsApi } from '@/services/api/record-exports';
import type { RecordExport } from '@/services/api/types';
import { useWsEvent } from '@/services/realtime';
import { formatNumber } from '@/utils/format';

const KIND_LABELS: Record<RecordExport['kind'], string> = {
  contacts: 'Contacts',
  campaign_results: 'Campaign results',
  calls: 'Calls',
  messages: 'WhatsApp messages',
  report: 'Report',
};

const recordExportKeys = {
  all: ['record-exports'] as const,
  list: (query: object) => ['record-exports', 'list', query] as const,
};

function ExportsTable() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const query = { page, limit: 10 };
  const list = useQuery({
    queryKey: recordExportKeys.list(query),
    queryFn: () => recordExportsApi.list(query),
    placeholderData: keepPreviousData,
    meta: { silent: true },
  });
  useWsEvent(
    'export.progress',
    () => void queryClient.invalidateQueries({ queryKey: recordExportKeys.all }),
  );
  const download = useMutation({
    mutationFn: (id: string) => recordExportsApi.get(id),
    meta: { silent: true },
    onSuccess: (job) => {
      if (job.downloadUrl) window.open(job.downloadUrl, '_blank', 'noopener');
      else enqueueSnackbar('This export has expired — make a new one.', { variant: 'info' });
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  const columns: Column<RecordExport>[] = [
    { key: 'kind', header: 'What', render: (e) => KIND_LABELS[e.kind] },
    { key: 'format', header: 'File', render: (e) => e.format.toUpperCase() },
    { key: 'status', header: 'Status', render: (e) => <StatusChip status={e.status} /> },
    {
      key: 'rows',
      header: 'Rows',
      align: 'right',
      render: (e) => formatNumber(e.status === 'ready' ? e.rowCount : e.progress.total),
    },
    { key: 'when', header: 'Made', render: (e) => <RelativeTime value={e.createdAt} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (e) =>
        e.status === 'ready' ? (
          <Button size="small" onClick={() => download.mutate(e.id)}>
            Download
          </Button>
        ) : null,
    },
  ];
  return (
    <DataTable
      aria-label="Recent exports"
      columns={columns}
      rows={list.data?.data}
      getRowId={(e) => e.id}
      loading={list.isPending}
      error={list.error}
      onRetry={() => void list.refetch()}
      emptyTitle="No exports yet"
      emptyDescription="Exports of calls, messages and reports show here for 24 hours."
      pagination={
        list.data
          ? { page, limit: 10, total: list.data.meta.total, onPageChange: setPage }
          : undefined
      }
    />
  );
}

/** "Recent exports" — calls / messages / report files of the last day. */
export function RecentExportsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Recent exports</Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Recent exports</DialogTitle>
        <DialogContent>{open && <ExportsTable />}</DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
