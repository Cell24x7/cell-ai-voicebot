import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';

import { useConfirm } from '@/components/confirm-context';
import { DataTable, type Column } from '@/components/DataTable';
import { RelativeTime } from '@/components/RelativeTime';
import { useCan } from '@/features/auth/hooks';
import { useCanWriteCampaigns } from '@/features/campaigns/permissions';
import { ExportDialog } from '@/features/contact-exports/ExportDialog';
import { useCanExport } from '@/features/contact-exports/useExportJob';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { contactListsApi } from '@/services/api/contact-lists';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import type { ContactList } from '@/services/api/types';
import { formatNumber } from '@/utils/format';

import { contactKeys, listKeys } from './keys';

const SOURCE: Record<ContactList['source']['type'], string> = {
  upload: 'Upload',
  api: 'API',
  manual: 'Manual',
};

function ListDialog({ list, onClose }: { list?: ContactList; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(list?.name ?? '');
  const [description, setDescription] = useState(list?.description ?? '');
  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim() || null };
      return list ? contactListsApi.update(list.id, body) : contactListsApi.create(body);
    },
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar(list ? 'List saved' : 'List created', { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: listKeys.all });
      onClose();
    },
  });
  const error = save.error ? toApiError(save.error) : null;
  const nameError =
    error?.code === 'CONFLICT_DUPLICATE'
      ? 'A list with this name already exists.'
      : error
        ? getErrorMessage(save.error)
        : undefined;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="list-title">
      <DialogTitle id="list-title">{list ? 'Rename list' : 'New list'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="List name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={Boolean(nameError)}
            helperText={nameError}
            slotProps={{ htmlInput: { maxLength: 100 } }}
            autoFocus
          />
          <TextField
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={2}
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!name.trim() || save.isPending}
          onClick={() => save.mutate()}
        >
          {list ? 'Save' : 'Create list'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** `/contacts/lists` — named groups of contacts. */
export function ListsTab() {
  const can = useCan();
  const canExport = useCanExport();
  const canCampaign = useCanWriteCampaigns();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ContactList | 'new' | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const query = { page, limit: 20, ...(q ? { q } : {}) };
  const lists = useQuery({
    queryKey: listKeys.list(query),
    queryFn: () => contactListsApi.list(query),
    placeholderData: keepPreviousData,
    meta: { silent: true },
  });
  const remove = useMutation({
    mutationFn: (id: string) => contactListsApi.remove(id),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('List deleted', { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: listKeys.all });
      void queryClient.invalidateQueries({ queryKey: contactKeys.all });
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  const write = can('contacts.write');

  const columns: Column<ContactList>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (l) => (
        <Link component={RouterLink} to={`/contacts/all?listId=${l.id}`}>
          {l.name}
        </Link>
      ),
    },
    { key: 'description', header: 'Description', render: (l) => l.description ?? '—' },
    {
      key: 'source',
      header: 'Source',
      render: (l) =>
        l.source.fileName
          ? `${SOURCE[l.source.type]} · ${l.source.fileName}`
          : SOURCE[l.source.type],
    },
    {
      key: 'count',
      header: 'Contacts',
      align: 'right',
      render: (l) => formatNumber(l.contactCount),
    },
    { key: 'created', header: 'Created', render: (l) => <RelativeTime value={l.createdAt} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (l) => (
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
          {canCampaign && (
            <Button size="small" component={RouterLink} to={`/campaigns/new?listId=${l.id}`}>
              Create campaign
            </Button>
          )}
          {canExport && (
            <Button size="small" onClick={() => setExporting(l.id)}>
              Export
            </Button>
          )}
          {write && (
            <Button size="small" onClick={() => setEditing(l)}>
              Rename
            </Button>
          )}
          {write && (
            <Button
              size="small"
              color="error"
              onClick={() =>
                void confirm({
                  title: `Delete list "${l.name}"?`,
                  message: `The ${formatNumber(l.contactCount)} contacts stay in your contacts — they are only taken out of this list.`,
                  confirmText: 'Delete list',
                  destructive: true,
                }).then((ok) => ok && remove.mutate(l.id))
              }
            >
              Delete
            </Button>
          )}
        </Stack>
      ),
    },
  ];

  return (
    <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          size="small"
          label="Search lists"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          sx={{ minWidth: 240 }}
        />
        <Stack sx={{ flexGrow: 1 }} />
        {write && (
          <Button variant="outlined" onClick={() => setEditing('new')}>
            New list
          </Button>
        )}
      </Stack>
      <DataTable
        aria-label="Lists"
        columns={columns}
        rows={lists.data?.data}
        getRowId={(l) => l.id}
        loading={lists.isPending}
        error={lists.error}
        onRetry={() => void lists.refetch()}
        emptyTitle={q ? 'No lists match' : 'No lists yet'}
        emptyDescription={
          q ? undefined : 'Every import makes a list. You can also create one here.'
        }
        pagination={
          lists.data
            ? { page, limit: 20, total: lists.data.meta.total, onPageChange: setPage }
            : undefined
        }
      />
      {editing && (
        <ListDialog
          list={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {exporting && <ExportDialog open onClose={() => setExporting(null)} listId={exporting} />}
    </>
  );
}
