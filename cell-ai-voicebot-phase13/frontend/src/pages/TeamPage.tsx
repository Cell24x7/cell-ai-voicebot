import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { RelativeTime } from '@/components/RelativeTime';
import { StatusChip } from '@/components/StatusChip';
import { useCan, useSession } from '@/features/auth/hooks';
import { InviteDialog } from '@/features/team/InviteDialog';
import { teamKeys } from '@/features/team/keys';
import { MemberActions } from '@/features/team/MemberActions';
import type { MemberPermissions } from '@/features/team/permissions';
import { ROLE_LABELS } from '@/features/team/roles';
import { TransferOwnershipDialog } from '@/features/team/TransferOwnershipDialog';
import { teamApi, type TeamQuery } from '@/services/api/team';
import type { TeamMember } from '@/services/api/types';
import { useWsEvent } from '@/services/realtime';

export function TeamPage() {
  const can = useCan();
  const session = useSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<TeamQuery['status'] | ''>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query: TeamQuery = {
    page,
    limit,
    ...(status ? { status } : {}),
    ...(debounced ? { search: debounced } : {}),
  };
  const members = useQuery({
    queryKey: teamKeys.list(query),
    queryFn: () => teamApi.list(query),
    placeholderData: keepPreviousData,
    meta: { silent: true },
  });
  useWsEvent('team.changed', () => void queryClient.invalidateQueries({ queryKey: teamKeys.all }));

  const callerIsOwner = session?.role.key === 'owner';
  const perms: MemberPermissions = {
    canInvite: can('team.invite') && !session?.impersonation,
    canUpdate: can('team.update'),
    canRemove: can('team.remove'),
    callerIsOwner,
    callerId: session?.user.id ?? '',
  };

  const columns: Column<TeamMember>[] = [
    { key: 'name', header: 'Name', render: (m) => m.name },
    { key: 'email', header: 'Email', render: (m) => m.email },
    { key: 'role', header: 'Role', render: (m) => ROLE_LABELS[m.role.key] ?? m.role.name },
    { key: 'status', header: 'Status', render: (m) => <StatusChip status={m.status} /> },
    { key: 'last', header: 'Last sign-in', render: (m) => <RelativeTime value={m.lastLoginAt} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (m) => <MemberActions member={m} perms={perms} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Team"
        subtitle="People who can use this account and what they can do."
        actions={
          <>
            {callerIsOwner && !session?.impersonation && (
              <Button variant="outlined" onClick={() => setTransferOpen(true)}>
                Transfer ownership
              </Button>
            )}
            {perms.canInvite && (
              <Button variant="contained" onClick={() => setInviteOpen(true)}>
                Invite member
              </Button>
            )}
          </>
        }
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          size="small"
          label="Search name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <TextField
          size="small"
          select
          label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as TeamQuery['status'] | '');
            setPage(1);
          }}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="active">Active</MenuItem>
          <MenuItem value="invited">Invited</MenuItem>
          <MenuItem value="disabled">Disabled</MenuItem>
        </TextField>
      </Stack>
      <DataTable
        aria-label="Team members"
        columns={columns}
        rows={members.data?.data}
        getRowId={(m) => m.id}
        loading={members.isPending}
        error={members.error}
        onRetry={() => void members.refetch()}
        emptyTitle="No members match"
        pagination={
          members.data
            ? {
                page,
                limit,
                total: members.data.meta.total,
                onPageChange: setPage,
                onLimitChange: (l) => {
                  setLimit(l);
                  setPage(1);
                },
              }
            : undefined
        }
      />
      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        callerIsOwner={callerIsOwner}
      />
      {transferOpen && (
        <TransferOwnershipDialog
          open
          onClose={() => setTransferOpen(false)}
          admins={(members.data?.data ?? []).filter(
            (m) => m.role.key === 'admin' && m.status === 'active',
          )}
        />
      )}
    </>
  );
}
