import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { adminApi } from '@/services/api/admin';
import { getErrorMessage } from '@/services/api/errors';

import { adminKeys } from './keys';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Creates a customer account; the owner sets their password from the e-mailed invitation. */
export function CreateAccountDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const email = ownerEmail.trim();
  const phone = ownerPhone.trim();
  const ready = businessName.trim().length >= 2 && Boolean(ownerName.trim()) && EMAIL.test(email);
  const create = useMutation({
    mutationFn: () =>
      adminApi.createAccount({
        businessName: businessName.trim(),
        ownerName: ownerName.trim(),
        ownerEmail: email,
        ...(phone ? { ownerPhone: phone } : {}),
      }),
    meta: { silent: true },
    onSuccess: (account) => {
      enqueueSnackbar(`${account.name} created — invitation sent to ${email}`, {
        variant: 'success',
      });
      void queryClient.invalidateQueries({ queryKey: adminKeys.all });
      onClose();
      void navigate(`/admin/accounts/${account.id}`);
    },
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="create-account-title">
      <DialogTitle id="create-account-title">Add account</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          The owner gets an e-mail with a link to set their password. The link works for 7 days.
        </DialogContentText>
        <Stack spacing={2}>
          {create.error && <Alert severity="error">{getErrorMessage(create.error)}</Alert>}
          <TextField
            label="Business name"
            autoFocus
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 80 } }}
          />
          <TextField
            label="Owner name"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 80 } }}
          />
          <TextField
            label="Owner email"
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
          />
          <TextField
            label="Owner phone (optional)"
            placeholder="+919876543210"
            value={ownerPhone}
            onChange={(e) => setOwnerPhone(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!ready || create.isPending}
          onClick={() => create.mutate()}
        >
          Create and send invitation
        </Button>
      </DialogActions>
    </Dialog>
  );
}
