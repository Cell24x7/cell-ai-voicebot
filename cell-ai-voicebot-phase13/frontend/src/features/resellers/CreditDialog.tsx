import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { getErrorMessage } from '@/services/api/errors';
import { resellersApi } from '@/services/api/resellers';
import { formatCurrencyMicros } from '@/utils/format';

import { resellerKeys } from './keys';
import { rupeesToMicros } from './rupees';

/** Give credit from the reseller's wallet, or take back unused credit. */
export function CreditDialog({
  customerId,
  customerName,
  way,
  onClose,
}: {
  customerId: string;
  customerName: string;
  way: 'give' | 'take';
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [key] = useState(() => crypto.randomUUID());
  const micros = rupeesToMicros(amount);
  const move = useMutation({
    mutationFn: () =>
      resellersApi.credit(
        customerId,
        way,
        { amountMicros: micros ?? 0, ...(note.trim() ? { note: note.trim() } : {}) },
        key,
      ),
    meta: { silent: true },
    onSuccess: (r) => {
      enqueueSnackbar(
        `${way === 'give' ? 'Added' : 'Took back'} ${formatCurrencyMicros(r.amountMicros)}. ${customerName} now has ${formatCurrencyMicros(r.customerBalanceMicros)}.`,
        { variant: 'success' },
      );
      void queryClient.invalidateQueries({ queryKey: resellerKeys.all });
      onClose();
    },
  });
  const title =
    way === 'give' ? `Add credit to ${customerName}` : `Take back credit from ${customerName}`;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="credit-title">
      <DialogTitle id="credit-title">{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {move.error && <Alert severity="error">{getErrorMessage(move.error)}</Alert>}
          <TextField
            label="Amount in ₹"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={Boolean(amount) && micros === null}
            helperText={
              way === 'give'
                ? 'Moved from your wallet to theirs.'
                : 'Only credit they have not used can be taken back.'
            }
          />
          <TextField
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={micros === null || move.isPending}
          onClick={() => move.mutate()}
        >
          {way === 'give' ? 'Add credit' : 'Take back'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
