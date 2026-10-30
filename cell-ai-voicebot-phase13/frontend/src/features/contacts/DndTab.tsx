import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
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
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { dndApi } from '@/services/api/dnd';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import type { DndEntry } from '@/services/api/types';
import { formatPhone, isValidPhone } from '@/utils/phone';

import { contactKeys, dndKeys } from './keys';

const SOURCE: Record<DndEntry['source'], string> = {
  manual: 'Added by hand',
  upload: 'Uploaded file',
  keyword: 'Said "stop" on a call',
  dtmf: 'Pressed a key on a call',
  whatsapp: 'Sent STOP on WhatsApp',
};

function AddDndDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const add = useMutation({
    mutationFn: () => dndApi.add({ phone: phone.trim(), reason: reason.trim() || null }),
    meta: { silent: true },
    onSuccess: ({ created }) => {
      enqueueSnackbar(
        created ? 'Number added to the do-not-call list' : 'That number is already on the list',
        {
          variant: created ? 'success' : 'info',
        },
      );
      void queryClient.invalidateQueries({ queryKey: dndKeys.all });
      void queryClient.invalidateQueries({ queryKey: contactKeys.all });
      onClose();
    },
  });
  const invalid = touched && phone.trim() !== '' && !isValidPhone(phone);
  const serverError = add.error
    ? (toApiError(add.error).details.find((d) => d.path.endsWith('phone'))?.message ??
      getErrorMessage(add.error))
    : undefined;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="dnd-title">
      <DialogTitle id="dnd-title">Add to do-not-call</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => setTouched(true)}
            error={invalid || Boolean(serverError)}
            helperText={
              invalid ? 'Enter a valid phone number' : (serverError ?? 'e.g. 98765 43210')
            }
            slotProps={{ htmlInput: { maxLength: 40, inputMode: 'tel' } }}
            autoFocus
          />
          <TextField
            label="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!isValidPhone(phone) || add.isPending}
          onClick={() => add.mutate()}
        >
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** `/contacts/dnd` — numbers that must never be called. */
export function DndTab() {
  const can = useCan();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const query = { page, limit: 20, ...(q ? { q } : {}) };
  const entries = useQuery({
    queryKey: dndKeys.list(query),
    queryFn: () => dndApi.list(query),
    placeholderData: keepPreviousData,
    meta: { silent: true },
  });
  const remove = useMutation({
    mutationFn: (id: string) => dndApi.remove(id),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Number taken off the do-not-call list', { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: dndKeys.all });
      void queryClient.invalidateQueries({ queryKey: contactKeys.all });
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  const manage = can('dnd.manage');

  const columns: Column<DndEntry>[] = [
    { key: 'phone', header: 'Phone', render: (e) => formatPhone(e.phoneE164) },
    { key: 'reason', header: 'Reason', render: (e) => e.reason ?? '—' },
    { key: 'source', header: 'How', render: (e) => SOURCE[e.source] },
    { key: 'added', header: 'Added', render: (e) => <RelativeTime value={e.createdAt} /> },
    ...(manage
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            render: (e: DndEntry) => (
              <Button
                size="small"
                color="error"
                onClick={() =>
                  void confirm({
                    title: `Remove ${formatPhone(e.phoneE164)} from do-not-call?`,
                    message: 'Campaigns will be able to call this number again.',
                    confirmText: 'Remove',
                    destructive: true,
                  }).then((ok) => ok && remove.mutate(e.id))
                }
              >
                Remove
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          size="small"
          label="Search numbers"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          sx={{ minWidth: 240 }}
        />
        <Stack sx={{ flexGrow: 1 }} />
        {can('contacts.import') && (
          <Button component={RouterLink} to="/contacts/import?kind=dnd">
            Upload a file
          </Button>
        )}
        {can('contacts.write') && (
          <Button variant="outlined" onClick={() => setAdding(true)}>
            Add number
          </Button>
        )}
      </Stack>
      {!manage && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Only an owner or admin can take numbers off this list.
        </Alert>
      )}
      <DataTable
        aria-label="Do-not-call numbers"
        columns={columns}
        rows={entries.data?.data}
        getRowId={(e) => e.id}
        loading={entries.isPending}
        error={entries.error}
        onRetry={() => void entries.refetch()}
        emptyTitle={q ? 'No numbers match' : 'The do-not-call list is empty'}
        emptyDescription={
          q ? undefined : 'Numbers here are never called, even if they are in a list or segment.'
        }
        pagination={
          entries.data
            ? { page, limit: 20, total: entries.data.meta.total, onPageChange: setPage }
            : undefined
        }
      />
      {adding && <AddDndDialog onClose={() => setAdding(false)} />}
    </>
  );
}
