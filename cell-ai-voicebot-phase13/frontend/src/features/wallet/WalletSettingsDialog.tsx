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
import type { Wallet } from '@/services/api/types';
import { walletApi, type WalletSettingsInput } from '@/services/api/wallet';
import { formatRupeesInput, MICROS_PER_RUPEE, parseRupeesInput } from '@/utils/money';

import { walletKeys } from './keys';

const THRESHOLD_MAX = 100_000 * MICROS_PER_RUPEE;
const BUDGET_MAX = 10_000_000 * MICROS_PER_RUPEE;

const inputOf = (micros: number) => (micros ? formatRupeesInput(micros) : '');

/** Low-balance threshold and monthly budgets (0 / empty = off). `wallet.topup` only. */
export function WalletSettingsDialog({ wallet, onClose }: { wallet: Wallet; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [threshold, setThreshold] = useState(inputOf(wallet.lowBalanceThresholdMicros));
  const [callBudget, setCallBudget] = useState(inputOf(wallet.budgets.monthlyCallMicros));
  const [aiBudget, setAiBudget] = useState(inputOf(wallet.budgets.monthlyAiMicros));
  const [waBudget, setWaBudget] = useState(inputOf(wallet.budgets.monthlyWhatsappMicros));
  const [touched, setTouched] = useState(false);

  const t = parseRupeesInput(threshold, { allowEmpty: true, maxMicros: THRESHOLD_MAX });
  const c = parseRupeesInput(callBudget, { allowEmpty: true, maxMicros: BUDGET_MAX });
  const a = parseRupeesInput(aiBudget, { allowEmpty: true, maxMicros: BUDGET_MAX });
  const w = parseRupeesInput(waBudget, { allowEmpty: true, maxMicros: BUDGET_MAX });

  const save = useMutation({
    mutationFn: (body: WalletSettingsInput) => walletApi.updateSettings(body),
    meta: { silent: true },
    onSuccess: (saved) => {
      queryClient.setQueryData(walletKeys.wallet, saved);
      enqueueSnackbar('Wallet settings saved', { variant: 'success' });
      onClose();
    },
  });

  const submit = () => {
    setTouched(true);
    if (!t.ok || !c.ok || !a.ok || !w.ok) return;
    save.mutate({
      lowBalanceThresholdMicros: t.micros,
      budgets: {
        monthlyCallMicros: c.micros,
        monthlyAiMicros: a.micros,
        monthlyWhatsappMicros: w.micros,
      },
    });
  };
  const help = (r: typeof t, text: string) => (touched && !r.ok ? r.message : text);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="wallet-settings-title">
      <DialogTitle id="wallet-settings-title">Wallet settings</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {save.error && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
          <TextField
            label="Low-balance alert below (₹)"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            error={touched && !t.ok}
            helperText={help(
              t,
              'Banner, bell and email when the available balance drops below this. Empty = off.',
            )}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
          />
          <TextField
            label="Monthly call budget (₹)"
            value={callBudget}
            onChange={(e) => setCallBudget(e.target.value)}
            error={touched && !c.ok}
            helperText={help(
              c,
              'New calls stop when this month’s call spend reaches it. Empty = no limit.',
            )}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
          />
          <TextField
            label="Monthly AI budget (₹)"
            value={aiBudget}
            onChange={(e) => setAiBudget(e.target.value)}
            error={touched && !a.ok}
            helperText={help(a, 'AI and voice (TTS) usage per month. Empty = no limit.')}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
          />
          <TextField
            label="Monthly WhatsApp budget (₹)"
            value={waBudget}
            onChange={(e) => setWaBudget(e.target.value)}
            error={touched && !w.ok}
            helperText={help(
              w,
              'Templates and replies stop when this month’s WhatsApp spend reaches it. Empty = no limit.',
            )}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={save.isPending}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
