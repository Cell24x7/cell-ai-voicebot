import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router';

import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { RelativeTime } from '@/components/RelativeTime';
import { StatusChip } from '@/components/StatusChip';
import { adminKeys } from '@/features/admin/keys';
import { adminApi, type AdminAccountsQuery } from '@/services/api/admin';
import type { AdminAccountRow } from '@/services/api/types';

const columns: Column<AdminAccountRow>[] = [
  {
    key: 'name',
    header: 'Account',
    render: (a) => (
      <Link component={RouterLink} to={`/admin/accounts/${a.id}`}>
        {a.name}
      </Link>
    ),
  },
  { key: 'owner', header: 'Owner', render: (a) => a.ownerEmail ?? '—' },
  { key: 'users', header: 'Users', align: 'right', render: (a) => a.usersCount },
  { key: 'status', header: 'Status', render: (a) => <StatusChip status={a.status} /> },
  { key: 'created', header: 'Created', render: (a) => <RelativeTime value={a.createdAt} /> },
];

/** Superadmin: every customer account. */
export function AdminAccountsPage() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<AdminAccountsQuery['status'] | ''>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query: AdminAccountsQuery = {
    page,
    limit,
    ...(status ? { status } : {}),
    ...(debounced ? { search: debounced } : {}),
  };
  const accounts = useQuery({
    queryKey: adminKeys.accounts(query),
    queryFn: () => adminApi.accounts(query),
    placeholderData: keepPreviousData,
    meta: { silent: true },
  });

  return (
    <>
      <PageHeader title="Accounts" subtitle="All customer accounts on the platform." />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          size="small"
          label="Search name, slug or owner email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 280 }}
        />
        <TextField
          size="small"
          select
          label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as AdminAccountsQuery['status'] | '');
            setPage(1);
          }}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="active">Active</MenuItem>
          <MenuItem value="suspended">Suspended</MenuItem>
        </TextField>
      </Stack>
      <DataTable
        aria-label="Accounts"
        columns={columns}
        rows={accounts.data?.data}
        getRowId={(a) => a.id}
        loading={accounts.isPending}
        error={accounts.error}
        onRetry={() => void accounts.refetch()}
        emptyTitle="No accounts match"
        pagination={
          accounts.data
            ? {
                page,
                limit,
                total: accounts.data.meta.total,
                onPageChange: setPage,
                onLimitChange: (l) => {
                  setLimit(l);
                  setPage(1);
                },
              }
            : undefined
        }
      />
    </>
  );
}
