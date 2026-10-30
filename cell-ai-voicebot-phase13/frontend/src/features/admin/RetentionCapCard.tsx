import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { adminApi } from '@/services/api/admin';
import { getErrorMessage } from '@/services/api/errors';
import type { AdminAccountDetail } from '@/services/api/types';

import { adminKeys } from './keys';

type CapKey = 'callsDays' | 'inboxDays';
/** Mirrors the backend RETENTION_LIMITS minimums. */
const MIN: Record<CapKey, number> = { callsDays: 7, inboxDays: 30 };

const text = (v: number | null) => (v === null ? '' : String(v));

/** Superadmin: the most an account may keep (Phase 14); empty = the platform default. */
export function RetentionCapCard({ detail }: { detail: AdminAccountDetail }) {
  const id = detail.account.id;
  const r = detail.retention;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({
    callsDays: text(r.cap.callsDays),
    inboxDays: text(r.cap.inboxDays),
  });
  const max: Record<CapKey, number> = {
    callsDays: r.platform.callsDays,
    inboxDays: r.platform.inboxDays ?? 3650,
  };
  const valueOf = (k: CapKey) => (draft[k].trim() === '' ? null : Number(draft[k]));
  const problem = (k: CapKey) => {
    const v = valueOf(k);
    if (v === null) return null;
    return Number.isInteger(v) && v >= MIN[k] && v <= max[k]
      ? null
      : `Between ${String(MIN[k])} and ${String(max[k])} days`;
  };
  const save = useMutation({
    mutationFn: () =>
      adminApi.setRetentionCap(id, {
        callsDays: valueOf('callsDays'),
        inboxDays: valueOf('inboxDays'),
      }),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Retention limit saved', { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: adminKeys.account(id) });
    },
  });
  const dirty =
    draft.callsDays !== text(r.cap.callsDays) || draft.inboxDays !== text(r.cap.inboxDays);
  const field = (k: CapKey, label: string) => (
    <TextField
      label={label}
      type="number"
      size="small"
      value={draft[k]}
      onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
      placeholder={`Platform default (${String(max[k])})`}
      error={Boolean(problem(k))}
      helperText={problem(k) ?? 'Empty = platform default'}
      slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: MIN[k], max: max[k] } }}
    />
  );
  return (
    <Card variant="outlined" component="section" aria-label="Data retention limit">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="subtitle1" component="h2">
            Data retention limit
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The account keeps now: recordings {r.effective.recordingsDays} days, call records{' '}
            {r.effective.callsDays} days, WhatsApp chats{' '}
            {r.effective.inboxDays === null ? 'forever' : `${String(r.effective.inboxDays)} days`}.
          </Typography>
          {save.error && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {field('callsDays', 'Call records at most (days)')}
            {field('inboxDays', 'WhatsApp chats at most (days)')}
          </Stack>
          <div>
            <Button
              variant="contained"
              disabled={
                !dirty || Boolean(problem('callsDays') ?? problem('inboxDays')) || save.isPending
              }
              onClick={() => save.mutate()}
            >
              Save limit
            </Button>
          </div>
        </Stack>
      </CardContent>
    </Card>
  );
}
