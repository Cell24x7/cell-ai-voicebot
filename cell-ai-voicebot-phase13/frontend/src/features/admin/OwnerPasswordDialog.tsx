import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useMutation } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { PASSWORD_MIN } from '@/features/auth/schemas';
import { adminApi } from '@/services/api/admin';
import { getErrorMessage } from '@/services/api/errors';

/** A superadmin sets the account owner's password; the owner's sessions end. */
export function OwnerPasswordDialog({
  accountId,
  ownerEmail,
  onClose,
  onDone,
}: {
  accountId: string;
  ownerEmail: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const change = useMutation({
    mutationFn: () => adminApi.setOwnerPassword(accountId, password),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Password changed', { variant: 'success' });
      onDone();
      onClose();
    },
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="owner-password-title">
      <DialogTitle id="owner-password-title">Change owner password</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {ownerEmail} is signed out everywhere and must use the new password. No e-mail is sent.
        </DialogContentText>
        <Stack spacing={2}>
          {change.error && <Alert severity="error">{getErrorMessage(change.error)}</Alert>}
          <TextField
            label="New password"
            type="password"
            autoFocus
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            helperText={`At least ${PASSWORD_MIN} characters.`}
          />
          <TextField
            label="Repeat password"
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            error={repeat !== '' && repeat !== password}
            helperText={repeat !== '' && repeat !== password ? "Passwords don't match." : ' '}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={password.length < PASSWORD_MIN || password !== repeat || change.isPending}
          onClick={() => change.mutate()}
        >
          Change password
        </Button>
      </DialogActions>
    </Dialog>
  );
}
