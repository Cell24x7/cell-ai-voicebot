import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import { useMutation, useQuery } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { DataTable, type Column } from '@/components/DataTable';
import { StatusChip } from '@/components/StatusChip';
import { useAuthStore } from '@/features/auth/store';
import { getErrorMessage } from '@/services/api/errors';
import { invoicesApi } from '@/services/api/invoices';
import type { Invoice } from '@/services/api/types';
import { formatInAccountTz } from '@/utils/datetime';
import { formatCurrencyMicros } from '@/utils/format';

import { invoiceKeys } from './keys';

const STATUS_LABEL: Record<Invoice['status'], string> = {
  rendering: 'Preparing',
  ready: 'Ready',
  failed: 'Failed',
};

/** `/wallet?tab=invoices` — GST invoices of paid recharges; each download gets a fresh link. */
export function InvoicesTab() {
  const timezone = useAuthStore((s) => s.session?.account.timezone ?? 'Asia/Kolkata');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const list = useQuery({
    queryKey: invoiceKeys.list({ page, limit }),
    queryFn: () => invoicesApi.list({ page, limit }),
    // a fresh invoice is rendered within seconds — look again while one is preparing
    refetchInterval: (q) =>
      q.state.data?.data.some((i) => i.status === 'rendering') ? 3000 : false,
  });
  const download = useMutation({
    mutationFn: (id: string) => invoicesApi.download(id),
    meta: { silent: true },
    onSuccess: ({ url }) => {
      window.open(url, '_blank', 'noopener');
    },
    onError: (error) => enqueueSnackbar(getErrorMessage(error), { variant: 'error' }),
  });

  const columns: Column<Invoice>[] = [
    { key: 'number', header: 'Invoice', render: (i) => i.number },
    { key: 'date', header: 'Date', render: (i) => formatInAccountTz(i.issuedAt, timezone) },
    {
      key: 'base',
      header: 'Amount',
      align: 'right',
      render: (i) => formatCurrencyMicros(i.amounts.baseMicros),
    },
    {
      key: 'tax',
      header: 'GST',
      align: 'right',
      render: (i) => formatCurrencyMicros(i.amounts.taxMicros),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (i) => formatCurrencyMicros(i.amounts.totalMicros),
    },
    {
      key: 'status',
      header: 'Status',
      render: (i) => (
        <StatusChip
          status={i.status === 'rendering' ? 'pending' : i.status}
          label={STATUS_LABEL[i.status]}
        />
      ),
    },
    {
      key: 'download',
      header: '',
      align: 'right',
      render: (i) => {
        const button = (
          <Button
            size="small"
            startIcon={<FileDownloadOutlined />}
            disabled={i.status !== 'ready' || (download.isPending && download.variables === i.id)}
            onClick={() => download.mutate(i.id)}
            aria-label={`Download ${i.number}`}
          >
            PDF
          </Button>
        );
        return i.status === 'ready' ? (
          button
        ) : (
          <Tooltip
            title={
              i.status === 'rendering'
                ? 'The PDF is being prepared'
                : 'The PDF could not be made — support has been told'
            }
          >
            <span>{button}</span>
          </Tooltip>
        );
      },
    },
  ];

  return (
    <DataTable
      aria-label="Invoices"
      columns={columns}
      rows={list.data?.data}
      getRowId={(i) => i.id}
      loading={list.isPending}
      error={list.error}
      onRetry={() => void list.refetch()}
      emptyTitle="No invoices yet"
      emptyDescription="Every wallet recharge gets a GST tax invoice here."
      pagination={
        list.data
          ? {
              page,
              limit,
              total: list.data.meta.total,
              onPageChange: setPage,
              onLimitChange: (l) => {
                setLimit(l);
                setPage(1);
              },
            }
          : undefined
      }
    />
  );
}
