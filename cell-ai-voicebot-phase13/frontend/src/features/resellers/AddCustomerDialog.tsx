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

import { PASSWORD_MIN } from '@/features/auth/schemas';
import { getErrorMessage } from '@/services/api/errors';
import { resellersApi } from '@/services/api/resellers';
import { browserTimezone } from '@/utils/timezone';

import { resellerKeys } from './keys';
import { generatePassword, rupeesToMicros } from './rupees';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A reseller adds a customer: account + owner with a password (no e-mail is sent). */
export function AddCustomerDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [password, setPassword] = useState('');
  const [credit, setCredit] = useState('');
  const [key] = useState(() => crypto.randomUUID());
  const creditMicros = credit.trim() ? rupeesToMicros(credit) : 0;
  const ready =
    businessName.trim().length >= 2 &&
    Boolean(ownerName.trim()) &&
    EMAIL.test(ownerEmail.trim()) &&
    password.length >= PASSWORD_MIN &&
    creditMicros !== null;
  const create = useMutation({
    mutationFn: () =>
      resellersApi.createCustomer(
        {
          businessName: businessName.trim(),
          ownerName: ownerName.trim(),
          ownerEmail: ownerEmail.trim(),
          ownerPassword: password,
          timezone: browserTimezone(),
          ...(ownerPhone.trim() ? { ownerPhone: ownerPhone.trim() } : {}),
          ...(creditMicros ? { startingCreditMicros: creditMicros } : {}),
        },
        key,
      ),
    meta: { silent: true },
    onSuccess: (c) => {
      enqueueSnackbar(`${c.name} added. Share the e-mail and password with the owner.`, {
        variant: 'success',
      });
      void queryClient.invalidateQueries({ queryKey: resellerKeys.all });
      onClose();
      void navigate(`/reseller/customers/${c.id}`);
    },
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="add-customer-title">
      <DialogTitle id="add-customer-title">Add customer</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          The owner signs in with this e-mail and password. No e-mail is sent — share them yourself.
        </DialogContentText>
        <Stack spacing={2}>
          {create.error && <Alert severity="error">{getErrorMessage(create.error)}</Alert>}
          <TextField
            label="Business name"
            autoFocus
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
          <TextField
            label="Owner name"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
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
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
            <TextField
              label="Password"
              fullWidth
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              helperText={`At least ${String(PASSWORD_MIN)} characters`}
            />
            <Button sx={{ mt: 1 }} onClick={() => setPassword(generatePassword())}>
              Generate
            </Button>
          </Stack>
          <TextField
            label="Starting credit in ₹ (optional)"
            value={credit}
            onChange={(e) => setCredit(e.target.value)}
            error={creditMicros === null}
            helperText={
              creditMicros === null ? 'Enter an amount like 500' : 'Moved from your wallet'
            }
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
          Add customer
        </Button>
      </DialogActions>
    </Dialog>
  );
}
