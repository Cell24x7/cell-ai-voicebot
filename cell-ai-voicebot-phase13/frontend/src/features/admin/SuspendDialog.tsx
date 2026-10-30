import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { adminApi } from '@/services/api/admin';
import { getErrorMessage } from '@/services/api/errors';

import { adminKeys } from './keys';

const MAX_REASON = 200;

/** Asks for a reason (shown to the account's users), then suspends. */
export function SuspendDialog({
  accountId,
  accountName,
  onClose,
}: {
  accountId: string;
  accountName: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  const suspend = useMutation({
    mutationFn: () => adminApi.suspend(accountId, trimmed),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar(`${accountName} suspended`, { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: adminKeys.all });
      onClose();
    },
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="suspend-title">
      <DialogTitle id="suspend-title">Suspend {accountName}?</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Everyone in this account is signed out, API keys stop working and no calls can be made
          until you enable it again. The reason is shown to the account&apos;s users.
        </DialogContentText>
        {suspend.error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {getErrorMessage(suspend.error)}
          </Alert>
        )}
        <TextField
          label="Reason"
          autoFocus
          fullWidth
          multiline
          minRows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          slotProps={{ htmlInput: { maxLength: MAX_REASON } }}
          helperText={`${reason.length}/${MAX_REASON}`}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          color="error"
          variant="contained"
          disabled={trimmed.length < 3 || suspend.isPending}
          onClick={() => suspend.mutate()}
        >
          Suspend account
        </Button>
      </DialogActions>
    </Dialog>
  );
}
