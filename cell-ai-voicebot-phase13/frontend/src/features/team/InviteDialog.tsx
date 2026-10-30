import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { emailField } from '@/features/auth/schemas';
import { applyFieldErrors, getErrorMessage, toApiError } from '@/services/api/errors';
import { teamApi } from '@/services/api/team';

import { teamKeys } from './keys';
import { assignableRoles, ROLE_LABELS } from './roles';

const schema = z.object({
  email: emailField,
  name: z.string().trim().min(1, 'Enter a name').max(80),
  roleKey: z.enum(['admin', 'manager', 'agent', 'viewer']),
});
type Values = z.infer<typeof schema>;

export function InviteDialog({
  open,
  onClose,
  callerIsOwner,
}: {
  open: boolean;
  onClose: () => void;
  callerIsOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', name: '', roleKey: 'agent' },
  });
  const invite = useMutation({
    mutationFn: (v: Values) => teamApi.invite({ ...v, roleKey: v.roleKey }),
    meta: { silent: true },
    onSuccess: (member) => {
      enqueueSnackbar(`Invitation sent to ${member.email}`, { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: teamKeys.all });
      form.reset();
      onClose();
    },
    onError: (error) => {
      applyFieldErrors(form.setError, error);
    },
  });
  const error = invite.error ? toApiError(invite.error) : null;
  const { errors } = form.formState;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="invite-title">
      <form noValidate onSubmit={(e) => void form.handleSubmit((v) => invite.mutate(v))(e)}>
        <DialogTitle id="invite-title">Invite a team member</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && error.code !== 'VALIDATION_FAILED' && (
              <Alert severity="error">{getErrorMessage(error)}</Alert>
            )}
            <TextField
              label="Email"
              type="email"
              autoFocus
              {...form.register('email')}
              error={Boolean(errors.email)}
              helperText={errors.email?.message}
            />
            <TextField
              label="Name"
              {...form.register('name')}
              error={Boolean(errors.name)}
              helperText={errors.name?.message}
            />
            <Controller
              control={form.control}
              name="roleKey"
              render={({ field }) => (
                <TextField select label="Role" {...field}>
                  {assignableRoles(callerIsOwner).map((r) => (
                    <MenuItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={invite.isPending}>
            Send invitation
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
