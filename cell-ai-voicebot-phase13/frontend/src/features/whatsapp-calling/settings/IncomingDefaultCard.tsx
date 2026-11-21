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

import { isLimitedImpersonation, usePermission, useSession } from '@/features/auth/hooks';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import type { WhatsAppIncomingDefault } from '@/services/api/types';
import { whatsappCallingApi } from '@/services/api/whatsapp-calling';

import { callingKeys } from '../keys';

import { CALLING_FORM_LIMITS } from './form';
import { IncomingAnswerFields } from './IncomingAnswerFields';

/**
 * SAC-T7: Settings → Calls — who answers incoming WhatsApp calls on numbers connected from
 * now on (each number keeps its own copy on its Calling page).
 */
export function IncomingDefaultCard() {
  const canRead = usePermission('calls.read');
  const query = useQuery({
    queryKey: callingKeys.incomingDefault,
    queryFn: whatsappCallingApi.getIncomingDefault,
    enabled: canRead,
    meta: { silent: true },
    retry: false,
  });
  if (!canRead) return null;
  // WhatsApp off on this install (503) or no access: nothing to show
  if (query.isError) return null;
  return (
    <Paper
      variant="outlined"
      sx={{ p: 3, mt: 3 }}
      component="section"
      aria-label="Incoming WhatsApp calls"
    >
      <Typography variant="h6" gutterBottom>
        Incoming WhatsApp calls
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Numbers you connect from now on start with this. Each number can change it on its Calling
        page.
      </Typography>
      {query.isPending ? (
        <Skeleton variant="rounded" height={120} />
      ) : query.data ? (
        <IncomingDefaultForm key={JSON.stringify(query.data)} saved={query.data} />
      ) : null}
    </Paper>
  );
}

function IncomingDefaultForm({ saved }: { saved: WhatsAppIncomingDefault }) {
  const session = useSession();
  const canEdit = usePermission('whatsapp.calling.manage') && !isLimitedImpersonation(session);
  const client = useQueryClient();
  const [draft, setDraft] = useState<WhatsAppIncomingDefault>(saved);
  const save = useMutation({
    mutationFn: () =>
      whatsappCallingApi.setIncomingDefault({
        ...draft,
        aiProgram: draft.route === 'team' ? null : draft.aiProgram,
      }),
    meta: { silent: true },
    onSuccess: (next) => {
      client.setQueryData(callingKeys.incomingDefault, next);
      enqueueSnackbar('Incoming call default saved', { variant: 'success' });
    },
  });
  const error = save.error ? toApiError(save.error) : null;
  const fieldError = (path: string) => error?.details.find((d) => d.path === path)?.message ?? null;
  const missingProgram = draft.route !== 'team' && !draft.aiProgram;
  const t = draft.ringTimeoutSec;
  const badTimeout =
    !Number.isInteger(t) ||
    t < CALLING_FORM_LIMITS.ringTimeoutMin ||
    t > CALLING_FORM_LIMITS.ringTimeoutMax;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  return (
    <Stack spacing={2} sx={{ maxWidth: 560 }}>
      {!canEdit && (
        <Alert severity="info">Only the owner and admins can change who answers calls.</Alert>
      )}
      {error && !error.details.length && <Alert severity="error">{getErrorMessage(error)}</Alert>}
      {error?.details
        .filter((d) => d.path === 'wallet' || d.path === 'media')
        .map((d) => (
          <Alert key={d.path} severity="error">
            {d.message}
          </Alert>
        ))}
      <IncomingAnswerFields
        value={{ route: draft.route, aiProgram: draft.aiProgram }}
        disabled={!canEdit}
        programError={
          fieldError('aiProgram') ?? (missingProgram ? 'Choose a flow or an AI agent' : null)
        }
        onChange={(next) => setDraft({ ...draft, ...next })}
      />
      {draft.route !== 'ai' && (
        <TextField
          type="number"
          size="small"
          label="Ring the team for (seconds)"
          value={draft.ringTimeoutSec}
          disabled={!canEdit}
          error={badTimeout}
          helperText={
            badTimeout
              ? `Between ${String(CALLING_FORM_LIMITS.ringTimeoutMin)} and ${String(CALLING_FORM_LIMITS.ringTimeoutMax)} seconds`
              : 'Then the call is missed (or the AI answers)'
          }
          onChange={(e) => setDraft({ ...draft, ringTimeoutSec: Number(e.target.value) })}
        />
      )}
      {canEdit && (
        <Button
          variant="contained"
          sx={{ alignSelf: 'flex-start' }}
          disabled={!dirty || missingProgram || badTimeout || save.isPending}
          onClick={() => save.mutate()}
        >
          Save
        </Button>
      )}
    </Stack>
  );
}
