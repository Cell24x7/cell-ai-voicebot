import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';

import { DataTable, type Column } from '@/components/DataTable';
import { RelativeTime } from '@/components/RelativeTime';
import { contactKeys } from '@/features/contacts/keys';
import { callsApi } from '@/services/api/calls';
import { contactsApi } from '@/services/api/contacts';
import { getErrorMessage } from '@/services/api/errors';
import type { Call } from '@/services/api/types';
import { formatPhone } from '@/utils/phone';

import { CallMethodDialog } from './CallMethodDialog';
import { callKeys } from './keys';
import { MISSED_REASON_LABELS } from './labels';
import { useCalls, useCanTriggerCalls } from './queries';

const PAGE = 25;

const callerText = (c: Call): string =>
  c.contact?.name || (c.inbound?.callerHidden ? 'Hidden number' : 'Unknown caller');

/** "Call back": the contact's number is loaded only when needed (lists never carry it). */
function CallBack({ call, onDone }: { call: Call; onDone: () => void }) {
  const queryClient = useQueryClient();
  const contactId = call.contact?.id ?? '';
  const contact = useQuery({
    queryKey: contactKeys.detail(contactId),
    queryFn: () => contactsApi.get(contactId),
    enabled: Boolean(contactId),
  });
  if (!contact.data) return null;
  return (
    <CallMethodDialog
      contactId={contactId}
      phoneE164={contact.data.phoneE164}
      label={contact.data.name || formatPhone(contact.data.phoneE164)}
      onStarted={() => void queryClient.invalidateQueries({ queryKey: callKeys.all })}
      onClose={onDone}
    />
  );
}

/**
 * Calls → Missed (Phase 20): incoming phone calls nobody (person or AI) took — the
 * callback list. Call back (any way the contact can be called) or mark it done.
 */
export function MissedCalls() {
  const queryClient = useQueryClient();
  const canTrigger = useCanTriggerCalls();
  const [showDone, setShowDone] = useState(false);
  const [calling, setCalling] = useState<Call | null>(null);
  const calls = useCalls({ limit: PAGE, direction: 'inbound', missed: showDone ? 'all' : 'open' });
  const done = useMutation({
    mutationFn: (id: string) => callsApi.callbackDone(id),
    meta: { silent: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: callKeys.all });
      enqueueSnackbar('Marked as done', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  const columns: Column<Call>[] = [
    {
      key: 'time',
      header: 'When',
      render: (c) => (
        <Link component={RouterLink} to={`/calls/${c.id}`}>
          <RelativeTime value={c.createdAt} />
        </Link>
      ),
    },
    { key: 'caller', header: 'Caller', render: callerText },
    {
      key: 'number',
      header: 'Called',
      render: (c) => c.inbound?.numberLabel || (c.inbound ? formatPhone(c.inbound.did) : '—'),
    },
    {
      key: 'reason',
      header: 'Why missed',
      render: (c) => (c.missed ? MISSED_REASON_LABELS[c.missed.reason] : '—'),
    },
    {
      key: 'state',
      header: 'Callback',
      render: (c) =>
        c.missed?.callback.status === 'done' ? (
          <Chip size="small" label="Done" />
        ) : (
          <Chip size="small" color="warning" variant="outlined" label="To call back" />
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) =>
        c.missed?.callback.status === 'open' && canTrigger ? (
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
            {c.contact?.id && (
              <Button size="small" variant="outlined" onClick={() => setCalling(c)}>
                Call back
              </Button>
            )}
            <Button size="small" disabled={done.isPending} onClick={() => done.mutate(c.id)}>
              Mark done
            </Button>
          </Stack>
        ) : null,
    },
  ];
  return (
    <Stack spacing={2}>
      <FormControlLabel
        control={<Switch checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />}
        label="Show calls already handled"
      />
      <DataTable
        aria-label="Missed calls"
        columns={columns}
        rows={calls.data?.pages.flatMap((p) => p.data)}
        getRowId={(c) => c.id}
        loading={calls.isPending}
        error={calls.error}
        onRetry={() => void calls.refetch()}
        emptyTitle={showDone ? 'No missed calls' : 'Nothing to call back'}
        emptyDescription="Incoming calls nobody answered appear here."
        footer={
          calls.hasNextPage ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 1 }}>
              <Button
                onClick={() => void calls.fetchNextPage()}
                disabled={calls.isFetchingNextPage}
              >
                {calls.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </Box>
          ) : undefined
        }
      />
      {calling?.contact?.id && <CallBack call={calling} onDone={() => setCalling(null)} />}
    </Stack>
  );
}
