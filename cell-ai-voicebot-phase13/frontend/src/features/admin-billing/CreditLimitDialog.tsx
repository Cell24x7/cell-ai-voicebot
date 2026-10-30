import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { adminBillingApi } from '@/services/api/admin-billing';
import { getErrorMessage } from '@/services/api/errors';
import type { Wallet } from '@/services/api/types';
import { formatRupeesInput, MICROS_PER_RUPEE, parseRupeesInput } from '@/utils/money';

const MAX = 100_000 * MICROS_PER_RUPEE;

/** Credit limit: calls may start until available (balance + limit − holds) reaches 0. */
export function CreditLimitDialog({
  accountId,
  wallet,
  onSaved,
  onClose,
}: {
  accountId: string;
  wallet: Wallet;
  onSaved: (wallet: Wallet) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(
    wallet.creditLimitMicros ? formatRupeesInput(wallet.creditLimitMicros) : '',
  );
  const parsed = parseRupeesInput(value, { allowEmpty: true, maxMicros: MAX });
  const save = useMutation({
    mutationFn: (micros: number) => adminBillingApi.setCreditLimit(accountId, micros),
    meta: { silent: true },
    onSuccess: (saved) => {
      onSaved(saved);
      onClose();
    },
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="credit-limit-title">
      <DialogTitle id="credit-limit-title">Credit limit</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {save.error && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
          <TextField
            label="Credit limit (₹)"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={!parsed.ok}
            helperText={
              parsed.ok
                ? 'Lets calls run on credit up to this amount (holds only). Empty = none. Max ₹1,00,000.'
                : parsed.message
            }
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!parsed.ok || save.isPending}
          onClick={() => parsed.ok && save.mutate(parsed.micros)}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
