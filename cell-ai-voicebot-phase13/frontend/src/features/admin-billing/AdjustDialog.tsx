import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useRef, useState } from 'react';

import { adminBillingApi, type AdjustmentInput } from '@/services/api/admin-billing';
import { getErrorMessage } from '@/services/api/errors';
import type { WalletAdjustment } from '@/services/api/types';
import { formatCurrencyMicros } from '@/utils/format';
import { MICROS_PER_RUPEE, parseRupeesInput } from '@/utils/money';

const MAX = 1_000_000 * MICROS_PER_RUPEE;

const newKey = (): string =>
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `adj-${Date.now().toString(36)}`;

/**
 * Manual credit / debit with a reason. Two steps (edit → confirm with the
 * amount). One Idempotency-Key per dialog, so a double click or retry never
 * moves money twice.
 */
export function AdjustDialog({
  accountId,
  accountName,
  onDone,
  onClose,
}: {
  accountId: string;
  accountName: string;
  onDone: (result: WalletAdjustment) => void;
  onClose: () => void;
}) {
  const [direction, setDirection] = useState<AdjustmentInput['direction']>('credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [allowNegative, setAllowNegative] = useState(false);
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<string | null>(null);

  const parsed = parseRupeesInput(amount, { minMicros: 10_000, maxMicros: MAX });
  const reasonProblem =
    reason.trim().length < 5
      ? 'At least 5 characters — shown to the customer and in the audit log'
      : null;
  const valid = parsed.ok && !reasonProblem;
  const words = parsed.ok
    ? direction === 'credit'
      ? `Add ${formatCurrencyMicros(parsed.micros)} to ${accountName}’s wallet?`
      : `Deduct ${formatCurrencyMicros(parsed.micros)} from ${accountName}’s wallet?`
    : '';

  const submit = async () => {
    if (!parsed.ok || reasonProblem) return;
    setSaving(true);
    setError(null);
    key.current ??= newKey();
    try {
      const result = await adminBillingApi.adjust(
        accountId,
        {
          direction,
          amountMicros: parsed.micros,
          reason: reason.trim(),
          ...(direction === 'debit' && allowNegative ? { allowNegative: true } : {}),
        },
        key.current,
      );
      onDone(result);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };
  const edit = (fn: () => void) => {
    // a changed request needs a new key (the old one belongs to the old body)
    key.current = null;
    fn();
  };

  return (
    <Dialog
      open
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="adjust-title"
    >
      <DialogTitle id="adjust-title">Adjust wallet</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {confirming ? (
            <>
              <Typography>{words}</Typography>
              <Typography variant="body2" color="text.secondary">
                Reason: {reason.trim()}
              </Typography>
              {direction === 'debit' && allowNegative && (
                <Alert severity="warning">The balance may go below zero.</Alert>
              )}
            </>
          ) : (
            <>
              <ToggleButtonGroup
                exclusive
                value={direction}
                onChange={(_e, v: AdjustmentInput['direction'] | null) =>
                  v && edit(() => setDirection(v))
                }
                aria-label="Direction"
              >
                <ToggleButton value="credit">Credit (add)</ToggleButton>
                <ToggleButton value="debit">Debit (deduct)</ToggleButton>
              </ToggleButtonGroup>
              <TextField
                label="Amount (₹)"
                value={amount}
                onChange={(e) => edit(() => setAmount(e.target.value))}
                error={touched && !parsed.ok}
                helperText={
                  touched && !parsed.ok ? parsed.message : 'Up to ₹10,00,000, whole paise'
                }
              />
              <TextField
                label="Reason"
                value={reason}
                multiline
                minRows={2}
                onChange={(e) => edit(() => setReason(e.target.value))}
                error={touched && Boolean(reasonProblem)}
                helperText={
                  touched && reasonProblem
                    ? reasonProblem
                    : 'The customer sees this in their bell and ledger'
                }
                slotProps={{ htmlInput: { maxLength: 300 } }}
              />
              {direction === 'debit' && (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={allowNegative}
                      onChange={(e) => edit(() => setAllowNegative(e.target.checked))}
                    />
                  }
                  label="Allow the balance to go below zero"
                />
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {confirming ? (
          <>
            <Button onClick={() => setConfirming(false)} disabled={saving}>
              Back
            </Button>
            <Button
              variant="contained"
              color={direction === 'debit' ? 'error' : 'primary'}
              onClick={() => void submit()}
              disabled={saving}
            >
              {direction === 'credit' ? 'Add money' : 'Deduct money'}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="contained"
              onClick={() => {
                setTouched(true);
                if (valid) setConfirming(true);
              }}
            >
              Review
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
