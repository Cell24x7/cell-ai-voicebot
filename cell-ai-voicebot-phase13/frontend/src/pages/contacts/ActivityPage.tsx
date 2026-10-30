import ArrowBack from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';

import { useConfirm } from '@/components/confirm-context';
import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { RelativeTime } from '@/components/RelativeTime';
import { StatusChip } from '@/components/StatusChip';
import { useCan } from '@/features/auth/hooks';
import { STATUS_LABEL } from '@/features/contact-imports/import-text';
import { exportKeys, importKeys } from '@/features/contacts/keys';
import { contactExportsApi } from '@/services/api/contact-exports';
import { contactImportsApi } from '@/services/api/contact-imports';
import { getErrorMessage } from '@/services/api/errors';
import type { ExportJob, ImportJob } from '@/services/api/types';
import { useWsEvent } from '@/services/realtime';
import { formatNumber } from '@/utils/format';

const RESUMABLE = ['uploaded', 'mapped', 'validated', 'validating', 'importing'];
const CANCELABLE = ['uploaded', 'mapped', 'validated', 'importing'];
const SCOPE: Record<string, string> = {
  ids: 'Selected contacts',
  filter: 'Filtered contacts',
  list: 'A list',
  segment: 'A segment',
};

function Imports() {
  const can = useCan();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const query = { page, limit: 20 };
  const imports = useQuery({
    queryKey: importKeys.list(query),
    queryFn: () => contactImportsApi.list(query),
    placeholderData: keepPreviousData,
    meta: { silent: true },
  });
  useWsEvent(
    'import.progress',
    () => void queryClient.invalidateQueries({ queryKey: importKeys.all }),
  );
  const fail = (err: unknown) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' });
  const cancel = useMutation({
    mutationFn: (id: string) => contactImportsApi.cancel(id),
    meta: { silent: true },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: importKeys.all }),
    onError: fail,
  });
  const report = useMutation({
    mutationFn: (id: string) => contactImportsApi.errorReport(id),
    meta: { silent: true },
    onSuccess: ({ url }) => void window.open(url, '_blank', 'noopener'),
    onError: fail,
  });
  const columns: Column<ImportJob>[] = [
    { key: 'file', header: 'File', render: (j) => j.fileName },
    { key: 'kind', header: 'Type', render: (j) => (j.kind === 'dnd' ? 'Do-not-call' : 'Contacts') },
    {
      key: 'status',
      header: 'Status',
      render: (j) => <StatusChip status={j.status} label={STATUS_LABEL[j.status] ?? j.status} />,
    },
    {
      key: 'rows',
      header: 'Rows',
      align: 'right',
      render: (j) =>
        j.status === 'completed'
          ? `${formatNumber(j.totals.created + j.totals.updated)} of ${formatNumber(j.totals.rows)}`
          : formatNumber(j.rowCount),
    },
    {
      key: 'invalid',
      header: 'Skipped',
      align: 'right',
      render: (j) => formatNumber(j.totals.invalid + j.totals.duplicates),
    },
    { key: 'when', header: 'Started', render: (j) => <RelativeTime value={j.createdAt} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (j) => (
        <>
          {RESUMABLE.includes(j.status) && can('contacts.import') && (
            <Button size="small" component={RouterLink} to={`/contacts/import/${j.id}`}>
              Open
            </Button>
          )}
          {j.hasErrorReport && (
            <Button size="small" onClick={() => report.mutate(j.id)}>
              Error report
            </Button>
          )}
          {CANCELABLE.includes(j.status) && can('contacts.import') && (
            <Button
              size="small"
              color="error"
              onClick={() =>
                void confirm({
                  title: `Cancel ${j.fileName}?`,
                  confirmText: 'Cancel import',
                  destructive: true,
                }).then((ok) => ok && cancel.mutate(j.id))
              }
            >
              Cancel
            </Button>
          )}
        </>
      ),
    },
  ];
  return (
    <DataTable
      aria-label="Imports"
      columns={columns}
      rows={imports.data?.data}
      getRowId={(j) => j.id}
      loading={imports.isPending}
      error={imports.error}
      onRetry={() => void imports.refetch()}
      emptyTitle="No imports yet"
      pagination={
        imports.data
          ? { page, limit: 20, total: imports.data.meta.total, onPageChange: setPage }
          : undefined
      }
    />
  );
}

function Exports() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const query = { page, limit: 20 };
  const exportsQuery = useQuery({
    queryKey: exportKeys.list(query),
    queryFn: () => contactExportsApi.list(query),
    placeholderData: keepPreviousData,
    meta: { silent: true },
  });
  useWsEvent(
    'export.progress',
    () => void queryClient.invalidateQueries({ queryKey: exportKeys.all }),
  );
  const download = useMutation({
    mutationFn: (id: string) => contactExportsApi.get(id),
    meta: { silent: true },
    onSuccess: (job) => {
      if (job.downloadUrl) window.open(job.downloadUrl, '_blank', 'noopener');
      else enqueueSnackbar('This export has expired — make a new one.', { variant: 'info' });
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  const columns: Column<ExportJob>[] = [
    { key: 'scope', header: 'What', render: (e) => SCOPE[e.scope] ?? e.scope },
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
      aria-label="Exports"
      columns={columns}
      rows={exportsQuery.data?.data}
      getRowId={(e) => e.id}
      loading={exportsQuery.isPending}
      error={exportsQuery.error}
      onRetry={() => void exportsQuery.refetch()}
      emptyTitle="No exports yet"
      emptyDescription="Export contacts from the Contacts tab. Files are kept for 24 hours."
      pagination={
        exportsQuery.data
          ? { page, limit: 20, total: exportsQuery.data.meta.total, onPageChange: setPage }
          : undefined
      }
    />
  );
}

/** `/contacts/activity` — import and export history. */
export function ActivityPage() {
  const can = useCan();
  const [tab, setTab] = useState<'imports' | 'exports'>('imports');
  return (
    <>
      <Button component={RouterLink} to="/contacts/all" startIcon={<ArrowBack />} sx={{ mb: 2 }}>
        Contacts
      </Button>
      <PageHeader
        title="Imports & exports"
        subtitle={
          <>
            Uploaded files and error reports are kept for 30 days, exports for 24 hours.{' '}
            {can('contacts.import') && (
              <Link component={RouterLink} to="/contacts/import">
                Import a file
              </Link>
            )}
          </>
        }
      />
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={tab}
          onChange={(_e, v: 'imports' | 'exports') => setTab(v)}
          aria-label="Activity"
        >
          <Tab value="imports" label="Imports" />
          {can('contacts.export') && <Tab value="exports" label="Exports" />}
        </Tabs>
      </Box>
      {tab === 'imports' ? <Imports /> : <Exports />}
    </>
  );
}
