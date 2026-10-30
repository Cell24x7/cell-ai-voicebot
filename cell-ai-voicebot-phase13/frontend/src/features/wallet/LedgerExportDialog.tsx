import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { getErrorMessage } from '@/services/api/errors';
import { walletApi } from '@/services/api/wallet';
import { daysBetween } from '@/utils/datetime';
import { saveBlob } from '@/utils/download';

const MAX_DAYS = 366;

/** CSV export of the ledger for a date range (account timezone, ≤ 1 year). */
export function LedgerExportDialog({
  defaultFrom,
  defaultTo,
  timezone,
  onClose,
}: {
  defaultFrom: string;
  defaultTo: string;
  timezone: string;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const problem =
    !from || !to
      ? 'Choose both dates'
      : from > to
        ? 'The start date must be before the end date'
        : daysBetween(from, to) > MAX_DAYS
          ? 'At most one year at a time'
          : null;
  const download = useMutation({
    mutationFn: () => walletApi.exportLedger(from, to),
    meta: { silent: true },
    onSuccess: (blob) => {
      saveBlob(blob, `transactions-${from}-${to}.csv`);
      enqueueSnackbar('Transactions downloaded', { variant: 'success' });
      onClose();
    },
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="ledger-export-title">
      <DialogTitle id="ledger-export-title">Export transactions</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {download.error && <Alert severity="error">{getErrorMessage(download.error)}</Alert>}
          <TextField
            label="From"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="To"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            error={Boolean(problem)}
            helperText={problem ?? `Dates in ${timezone}. Opens in Excel (CSV).`}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Typography variant="caption" color="text.secondary">
            Includes every row of the period: recharges, holds, charges, releases and adjustments.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={Boolean(problem) || download.isPending}
          onClick={() => download.mutate()}
        >
          {download.isPending ? 'Preparing…' : 'Download CSV'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
