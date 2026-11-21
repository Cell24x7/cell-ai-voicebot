import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';

import { useConfirm } from '@/components/confirm-context';
import { useAuthStore } from '@/features/auth/store';
import { getErrorMessage } from '@/services/api/errors';
import type { WhatsAppScheduledCall } from '@/services/api/types';

import { SCHEDULED_SKIP_LABELS, SCHEDULED_STATUS_LABELS } from '../labels';
import { dueText, instantOf, localInputOf } from '../live/schedule-time';
import { useCanCall } from '../permissions';
import { useCancelScheduledCall, useRescheduleCall, useScheduledCalls } from '../queries';

const statusColor = (s: string) =>
  s === 'done'
    ? 'success'
    : s === 'skipped' || s === 'failed'
      ? 'error'
      : s === 'cancelled'
        ? 'default'
        : 'info';

function RescheduleDialog({
  row,
  timeZone,
  onClose,
}: {
  row: WhatsAppScheduledCall;
  timeZone: string;
  onClose: () => void;
}) {
  const [when, setWhen] = useState(localInputOf(new Date(row.dueAt), timeZone));
  const move = useRescheduleCall();
  const at = instantOf(when, timeZone);
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Reschedule AI call</DialogTitle>
      <DialogContent>
        <TextField
          type="datetime-local"
          label={`Kab (${timeZone})`}
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          sx={{ mt: 1 }}
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
          error={Boolean(move.error)}
          helperText={move.error ? getErrorMessage(move.error) : ' '}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="contained"
          disabled={!at || move.isPending}
          onClick={() =>
            at &&
            move.mutate(
              { id: row.id, dueAt: at.toISOString() },
              {
                onSuccess: () => {
                  enqueueSnackbar('AI call rescheduled', { variant: 'success' });
                  onClose();
                },
              },
            )
          }
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** SAC-T10: the contact's scheduled AI calls (upcoming first) with Reschedule / Cancel. */
export function ScheduledCallsList({ contactId }: { contactId: string }) {
  const timeZone = useAuthStore((s) => s.session?.account.timezone ?? 'Asia/Kolkata');
  const canCall = useCanCall();
  const confirm = useConfirm();
  const list = useScheduledCalls({ contactId, limit: 10 });
  const cancel = useCancelScheduledCall();
  const [moving, setMoving] = useState<WhatsAppScheduledCall | null>(null);
  const rows = [...(list.data?.data ?? [])].sort((a, b) => {
    const open = (r: WhatsAppScheduledCall) => (r.status === 'scheduled' ? 0 : 1);
    return open(a) - open(b) || a.dueAt.localeCompare(b.dueAt);
  });
  if (!rows.length) return null;
  const onCancel = async (row: WhatsAppScheduledCall) => {
    const ok = await confirm({
      title: 'Cancel this AI call?',
      message: `The AI will not call at ${dueText(row.dueAt, timeZone)}.`,
      confirmText: 'Cancel AI call',
      destructive: true,
    });
    if (ok)
      cancel.mutate(row.id, {
        onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: 'error' }),
      });
  };
  return (
    <Stack spacing={0.5} aria-label="Scheduled calls">
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        Scheduled calls
      </Typography>
      {rows.map((r) => (
        <Stack
          key={r.id}
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', flexWrap: 'wrap' }}
        >
          <Typography variant="body2">{dueText(r.dueAt, timeZone)}</Typography>
          <Chip
            size="small"
            color={statusColor(r.status)}
            label={SCHEDULED_STATUS_LABELS[r.status] ?? r.status}
          />
          {r.origin === 'ai_callback' && (
            <Chip size="small" variant="outlined" label="AI callback" />
          )}
          {r.skipReason && (
            <Typography variant="caption" color="text.secondary">
              {SCHEDULED_SKIP_LABELS[r.skipReason] ?? r.skipReason}
            </Typography>
          )}
          {r.callIds.at(-1) && (
            <Link component={RouterLink} to={`/calls/${r.callIds.at(-1) ?? ''}`} variant="body2">
              Open call
            </Link>
          )}
          {canCall && r.status === 'scheduled' && (
            <>
              <Button size="small" onClick={() => setMoving(r)}>
                Reschedule
              </Button>
              <Button size="small" color="error" onClick={() => void onCancel(r)}>
                Cancel
              </Button>
            </>
          )}
        </Stack>
      ))}
      {moving && (
        <RescheduleDialog row={moving} timeZone={timeZone} onClose={() => setMoving(null)} />
      )}
    </Stack>
  );
}
