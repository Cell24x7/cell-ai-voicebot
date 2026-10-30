import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { DataTable } from '@/components/DataTable';
import { useAuthStore } from '@/features/auth/store';
import { auditApi } from '@/services/api/audit';
import { auditActorText, auditMetaText } from '@/utils/audit-format';
import { formatInAccountTz } from '@/utils/datetime';

import { settingsKeys } from './keys';

const GROUPS = [
  { value: '', label: 'All activity' },
  { value: 'auth.*', label: 'Sign-ins & passwords' },
  { value: 'team.*', label: 'Team' },
  { value: 'account.*', label: 'Account' },
  { value: 'apikey.*', label: 'API keys' },
  { value: 'admin.*', label: 'Support access' },
];

export function AuditTab() {
  const timezone = useAuthStore((s) => s.session?.account.timezone ?? 'Asia/Kolkata');
  const [action, setAction] = useState('');
  const filter = action ? { action } : {};
  const audit = useInfiniteQuery({
    queryKey: settingsKeys.audit(filter),
    queryFn: ({ pageParam }) =>
      auditApi.list({ ...filter, limit: 50, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '',
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    meta: { silent: true },
  });
  const rows = audit.data?.pages.flatMap((p) => p.data);
  return (
    <Stack spacing={2}>
      <TextField
        select
        size="small"
        label="Show"
        value={action}
        onChange={(e) => setAction(e.target.value)}
        sx={{ maxWidth: 260 }}
      >
        {GROUPS.map((g) => (
          <MenuItem key={g.value} value={g.value}>
            {g.label}
          </MenuItem>
        ))}
      </TextField>
      <DataTable
        aria-label="Audit log"
        columns={[
          {
            key: 'at',
            header: `Time (${timezone})`,
            render: (e) => formatInAccountTz(e.at, timezone),
            width: 170,
          },
          { key: 'actor', header: 'Who', render: auditActorText },
          { key: 'action', header: 'What', render: (e) => <code>{e.action}</code> },
          { key: 'meta', header: 'Details', render: (e) => auditMetaText(e.meta) },
          { key: 'ip', header: 'IP', render: (e) => e.ip ?? '—' },
        ]}
        rows={rows}
        getRowId={(e) => e.id}
        loading={audit.isPending}
        error={audit.error}
        onRetry={() => void audit.refetch()}
        emptyTitle="No activity yet"
        footer={
          audit.hasNextPage ? (
            <Stack sx={{ p: 1, alignItems: 'center' }}>
              <Button
                onClick={() => void audit.fetchNextPage()}
                disabled={audit.isFetchingNextPage}
              >
                {audit.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </Stack>
          ) : null
        }
      />
    </Stack>
  );
}
