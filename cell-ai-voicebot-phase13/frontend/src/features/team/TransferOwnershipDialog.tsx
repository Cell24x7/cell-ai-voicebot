import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { PasswordField } from '@/features/auth/PasswordField';
import { reloadMe } from '@/features/auth/session';
import { getErrorMessage } from '@/services/api/errors';
import { teamApi } from '@/services/api/team';
import type { TeamMember } from '@/services/api/types';

import { teamKeys } from './keys';

export function TransferOwnershipDialog({
  open,
  onClose,
  admins,
}: {
  open: boolean;
  onClose: () => void;
  admins: TeamMember[];
}) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const transfer = useMutation({
    mutationFn: () => teamApi.transferOwnership({ userId, password }),
    meta: { silent: true },
    onSuccess: async () => {
      enqueueSnackbar('Ownership transferred. You are now an admin.', { variant: 'success' });
      await reloadMe().catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: teamKeys.all });
      onClose();
    },
  });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="transfer-title">
      <DialogTitle id="transfer-title">Transfer ownership</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <DialogContentText>
            The new owner must be an active admin. You will become an admin.
          </DialogContentText>
          {transfer.error && <Alert severity="error">{getErrorMessage(transfer.error)}</Alert>}
          {admins.length === 0 ? (
            <Alert severity="info">Make someone an admin first.</Alert>
          ) : (
            <TextField
              select
              label="New owner"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              {admins.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.name} ({a.email})
                </MenuItem>
              ))}
            </TextField>
          )}
          <PasswordField
            label="Your password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          color="error"
          variant="contained"
          disabled={!userId || !password || transfer.isPending}
          onClick={() => transfer.mutate()}
        >
          Transfer
        </Button>
      </DialogActions>
    </Dialog>
  );
}
