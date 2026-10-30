import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { enqueueSnackbar } from 'notistack';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { applyFieldErrors, toApiError } from '@/services/api/errors';
import type { WhatsAppChannel } from '@/services/api/types';

import { whatsappErrorMessage } from '../labels';
import { useRegisterPin, useRenameChannel } from '../queries';

const renameSchema = z.object({ label: z.string().trim().min(1, 'Enter a name').max(60) });
const pinSchema = z.object({ pin: z.string().regex(/^\d{6}$/, 'The PIN has 6 digits') });

export function RenameDialog({
  channel,
  onClose,
}: {
  channel: WhatsAppChannel;
  onClose: () => void;
}) {
  const rename = useRenameChannel();
  const form = useForm<z.infer<typeof renameSchema>>({
    resolver: zodResolver(renameSchema),
    defaultValues: { label: channel.label },
  });
  const error = rename.error ? toApiError(rename.error) : null;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="wa-rename-title">
      <form
        noValidate
        onSubmit={(e) =>
          void form.handleSubmit((v) =>
            rename.mutate(
              { id: channel.id, label: v.label },
              {
                onSuccess: () => {
                  enqueueSnackbar('Number renamed', { variant: 'success' });
                  onClose();
                },
                onError: (err) => applyFieldErrors(form.setError, err),
              },
            ),
          )(e)
        }
      >
        <DialogTitle id="wa-rename-title">Rename number</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && error.code !== 'VALIDATION_FAILED' && (
              <Alert severity="error">{whatsappErrorMessage(error)}</Alert>
            )}
            <TextField
              label="Name in this app"
              autoFocus
              {...form.register('label')}
              error={Boolean(form.formState.errors.label)}
              helperText={form.formState.errors.label?.message}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={rename.isPending}>
            Save
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** The number already has a two-step verification PIN: Meta needs it to register. */
export function PinDialog({ channel, onClose }: { channel: WhatsAppChannel; onClose: () => void }) {
  const register = useRegisterPin();
  const form = useForm<z.infer<typeof pinSchema>>({
    resolver: zodResolver(pinSchema),
    defaultValues: { pin: '' },
  });
  const error = register.error ? toApiError(register.error) : null;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="wa-pin-title">
      <form
        noValidate
        onSubmit={(e) =>
          void form.handleSubmit((v) =>
            register.mutate(
              { id: channel.id, pin: v.pin },
              {
                onSuccess: (r) => {
                  enqueueSnackbar(r.outcome === 'connected' ? 'Number connected' : 'PIN saved', {
                    variant: 'success',
                  });
                  onClose();
                },
                onError: (err) => applyFieldErrors(form.setError, err),
              },
            ),
          )(e)
        }
      >
        <DialogTitle id="wa-pin-title">Enter PIN</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info">
              This number already has a two-step verification PIN (set in the WhatsApp app or
              WhatsApp Manager). Enter it to finish connecting.
            </Alert>
            {error && error.code !== 'VALIDATION_FAILED' && (
              <Alert severity="error">{whatsappErrorMessage(error)}</Alert>
            )}
            <TextField
              label="6-digit PIN"
              type="password"
              autoFocus
              slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6, autoComplete: 'off' } }}
              {...form.register('pin')}
              error={Boolean(form.formState.errors.pin)}
              helperText={form.formState.errors.pin?.message}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={register.isPending}>
            Finish
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
