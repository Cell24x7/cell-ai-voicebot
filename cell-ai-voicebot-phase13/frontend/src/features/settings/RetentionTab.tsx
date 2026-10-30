import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { useConfirm } from '@/components/confirm-context';
import { usePermission } from '@/features/auth/hooks';
import { getErrorMessage } from '@/services/api/errors';
import { retentionApi } from '@/services/api/retention';
import type { Retention } from '@/services/api/types';

import { settingsKeys } from './keys';
import {
  bodyOf,
  daysText,
  defaultOf,
  draftOf,
  effectiveOf,
  fieldProblem,
  RETENTION_KINDS,
  shorteningOf,
  type RetentionDraft,
} from './retention';

function RetentionForm({ retention, canEdit }: { retention: Retention; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<RetentionDraft>(() => draftOf(retention));
  const save = useMutation({
    mutationFn: () => retentionApi.update(bodyOf(draft)),
    meta: { silent: true },
    onSuccess: (next) => {
      queryClient.setQueryData(settingsKeys.retention, next);
      enqueueSnackbar('Data retention saved', { variant: 'success' });
    },
  });
  const problems = Object.fromEntries(
    RETENTION_KINDS.map((k) => [k.key, fieldProblem(retention, draft, k.key)]),
  );
  const invalid = Object.values(problems).some(Boolean);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(retention));
  const next = effectiveOf(retention, draft);
  const capped = retention.cap.callsDays !== null || retention.cap.inboxDays !== null;

  const submit = async () => {
    const lines = shorteningOf(retention, draft);
    if (lines.length) {
      const ok = await confirm({
        title: 'Delete older data?',
        message: `${lines.join(' ')} This can't be undone. Report numbers are kept.`,
        confirmText: 'Save and delete',
        destructive: true,
      });
      if (!ok) return;
    }
    save.mutate();
  };

  return (
    <Stack spacing={2}>
      {save.error && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
      {capped && (
        <Alert severity="info">
          The platform team set a limit for this account: call records at most{' '}
          {daysText(retention.bounds.callsDays.max)}, WhatsApp chats at most{' '}
          {daysText(defaultOf(retention, 'inboxDays'))}.
        </Alert>
      )}
      {RETENTION_KINDS.map((k) => {
        const fallback = k.key === 'recordingsDays' ? next.callsDays : defaultOf(retention, k.key);
        return (
          <Stack key={k.key} spacing={0.5}>
            <TextField
              label={`${k.label} (days)`}
              type="number"
              size="small"
              sx={{ maxWidth: 320 }}
              value={draft[k.key]}
              disabled={!canEdit || save.isPending}
              placeholder={
                k.key === 'recordingsDays'
                  ? 'Same as call records'
                  : `Platform default (${daysText(fallback)})`
              }
              onChange={(e) => setDraft({ ...draft, [k.key]: e.target.value })}
              error={Boolean(problems[k.key])}
              helperText={
                problems[k.key] ??
                `Now: ${daysText(next[k.key])}. Leave empty for the default. ${k.what}`
              }
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { min: retention.bounds[k.key].min, step: 1 },
              }}
            />
          </Stack>
        );
      })}
      <Typography variant="body2" color="text.secondary">
        Older data is deleted automatically every night. Report numbers (daily totals) are not
        affected. A shorter period deletes older data on the next run and can't be undone.
      </Typography>
      {canEdit ? (
        <div>
          <Button
            variant="contained"
            disabled={!dirty || invalid || save.isPending}
            onClick={() => void submit()}
          >
            Save
          </Button>
        </div>
      ) : (
        <Alert severity="info">Only the owner or an admin can change this.</Alert>
      )}
    </Stack>
  );
}

/** Settings → Data retention (Phase 14): how long recordings, calls and chats are kept. */
export function RetentionTab() {
  const canEdit = usePermission('account.update');
  const query = useQuery({
    queryKey: settingsKeys.retention,
    queryFn: retentionApi.get,
    meta: { silent: true },
  });
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <div>
          <Typography variant="h6" component="h2">
            Data retention
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Choose how long this account keeps call recordings, call records and WhatsApp chats.
          </Typography>
        </div>
        {query.isError && (
          <Alert
            severity="error"
            action={<Button onClick={() => void query.refetch()}>Retry</Button>}
          >
            {getErrorMessage(query.error)}
          </Alert>
        )}
        {query.isPending && <Skeleton variant="rounded" height={240} />}
        {query.data && (
          <RetentionForm
            key={JSON.stringify(query.data.settings)}
            retention={query.data}
            canEdit={canEdit}
          />
        )}
      </Stack>
    </Paper>
  );
}
