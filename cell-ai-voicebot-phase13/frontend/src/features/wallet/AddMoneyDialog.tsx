import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router';

import { BillingProfileForm } from '@/features/billing/BillingProfileForm';
import { ApiError, getErrorMessage, toApiError } from '@/services/api/errors';
import type { TopupCheckout, TopupOrder } from '@/services/api/types';
import { walletApi } from '@/services/api/wallet';
import { formatCurrencyMicros } from '@/utils/format';
import {
  formatRupeeLabel,
  gstPreview,
  parseRupeesInput,
  TOPUP_MAX_MICROS,
  TOPUP_MIN_MICROS,
  TOPUP_PRESETS_MICROS,
} from '@/utils/money';

import { invoiceKeys, walletKeys } from './keys';
import { useBillingProfile, useWallet } from './queries';
import { loadRazorpayCheckout } from './razorpay';

const POLL_MS = 2000;
const POLL_LIMIT_MS = 60_000;

type Step =
  | { kind: 'amount' }
  | { kind: 'billing' }
  | { kind: 'review' }
  | { kind: 'test-payment'; checkout: TopupCheckout }
  | { kind: 'confirming'; orderId: string; startedAt: number }
  | { kind: 'done'; order: TopupOrder }
  | { kind: 'failed'; reason: string }
  | { kind: 'dismissed' }
  | { kind: 'timeout' };

const VERIFY_MESSAGES: Record<string, string> = {
  PAYMENT_VERIFICATION_FAILED:
    'We could not confirm this payment. If money was deducted it will be added automatically or refunded by your bank.',
};

const errorText = (error: unknown): string => {
  // checkout-script problems are plain errors with a message written for the user
  if (error instanceof Error && !(error instanceof ApiError)) return error.message;
  const e = toApiError(error);
  if (e.status === 429) {
    return 'Too many top-up attempts in the last hour. Please wait a little and try again.';
  }
  return VERIFY_MESSAGES[e.code] ?? getErrorMessage(e);
};

const randomKey = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
      <Typography variant="body2" sx={{ fontWeight: strong ? 600 : 400 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: strong ? 600 : 400 }}>
        {value}
      </Typography>
    </Stack>
  );
}

/** Wallet top-up: amount → (billing details) → review with GST → pay → confirm. */
export function AddMoneyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <AddMoneyFlow onClose={onClose} /> : null;
}

function AddMoneyFlow({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const profile = useBillingProfile();
  const wallet = useWallet();
  const [step, setStep] = useState<Step>({ kind: 'amount' });
  const [preset, setPreset] = useState<number | null>(TOPUP_PRESETS_MICROS[1] ?? null);
  const [custom, setCustom] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** One Idempotency-Key per attempt and amount (a retry with the same amount reuses it). */
  const keys = useRef(new Map<number, string>());

  const parsed = custom.trim()
    ? parseRupeesInput(custom, {
        wholeRupees: true,
        minMicros: TOPUP_MIN_MICROS,
        maxMicros: TOPUP_MAX_MICROS,
      })
    : preset
      ? ({ ok: true, micros: preset } as const)
      : ({ ok: false, message: 'Choose or enter an amount' } as const);
  const amount = parsed.ok ? parsed.micros : 0;
  const profileData = profile.data;
  const gst =
    profileData?.profile && amount
      ? gstPreview(amount, profileData.sellerStateCode, profileData.profile.stateCode)
      : null;

  const pollId = step.kind === 'confirming' ? step.orderId : null;
  const order = useQuery({
    queryKey: walletKeys.topup(pollId ?? 'none'),
    queryFn: async () => {
      const current = await walletApi.topup(pollId ?? '');
      if (current.status === 'paid') {
        void queryClient.invalidateQueries({ queryKey: walletKeys.wallet });
        void queryClient.invalidateQueries({ queryKey: walletKeys.ledgerAll });
        void queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      }
      return current;
    },
    enabled: pollId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      const expired =
        step.kind === 'confirming' && query.state.dataUpdatedAt - step.startedAt > POLL_LIMIT_MS;
      return status === 'paid' || status === 'failed' || expired ? false : POLL_MS;
    },
    meta: { silent: true },
  });
  // The poll decides what the confirming step shows (pure — no state changes while rendering).
  const view: Step =
    step.kind !== 'confirming'
      ? step
      : order.data?.status === 'paid'
        ? { kind: 'done', order: order.data }
        : order.data?.status === 'failed'
          ? {
              kind: 'failed',
              reason: order.data.failureReason ?? 'The payment did not go through.',
            }
          : order.dataUpdatedAt - step.startedAt > POLL_LIMIT_MS
            ? { kind: 'timeout' }
            : step;

  const restart = () => {
    keys.current.clear();
    setError(null);
    setStep({ kind: 'amount' });
  };
  const next = () => {
    setTouched(true);
    if (!parsed.ok) return;
    setError(null);
    setStep(profileData?.complete ? { kind: 'review' } : { kind: 'billing' });
  };

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const key = keys.current.get(amount) ?? randomKey();
      keys.current.set(amount, key);
      const checkout = await walletApi.createTopup(amount, key);
      if (checkout.checkout.provider === 'fake') {
        setStep({ kind: 'test-payment', checkout });
        return;
      }
      await loadRazorpayCheckout();
      const Razorpay = window.Razorpay;
      if (!Razorpay || !checkout.checkout.keyId)
        throw new Error('The payment window could not start.');
      const orderId = checkout.topupOrder.id;
      new Razorpay({
        key: checkout.checkout.keyId,
        order_id: checkout.checkout.providerOrderId,
        amount: checkout.checkout.amountPaise,
        currency: checkout.checkout.currency,
        name: checkout.checkout.name,
        description: checkout.checkout.description,
        prefill: checkout.checkout.prefill,
        theme: { color: theme.palette.primary.main },
        handler: (response) => {
          setStep({ kind: 'confirming', orderId, startedAt: Date.now() });
          walletApi
            .verifyTopup(orderId, {
              providerPaymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            })
            .then(() => void queryClient.invalidateQueries({ queryKey: walletKeys.topup(orderId) }))
            .catch((err: unknown) => {
              setError(errorText(err));
            });
        },
        modal: { ondismiss: () => setStep({ kind: 'dismissed' }) },
      }).open();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const testPay = async (checkout: TopupCheckout, outcome: 'paid' | 'failed') => {
    setBusy(true);
    setError(null);
    try {
      await walletApi.fakeComplete(checkout.topupOrder.id, outcome);
      setStep({ kind: 'confirming', orderId: checkout.topupOrder.id, startedAt: Date.now() });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const closable = view.kind !== 'confirming' && !busy;
  const title =
    view.kind === 'billing'
      ? 'Billing details'
      : view.kind === 'test-payment'
        ? 'Test payment'
        : 'Add money';

  return (
    <Dialog
      open
      onClose={closable ? onClose : undefined}
      fullWidth
      maxWidth={view.kind === 'billing' ? 'md' : 'xs'}
      aria-labelledby="add-money-title"
    >
      <DialogTitle id="add-money-title">{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {view.kind === 'amount' && (
            <>
              <ToggleButtonGroup
                exclusive
                value={custom.trim() ? null : preset}
                onChange={(_e, v: number | null) => {
                  if (v === null) return;
                  setPreset(v);
                  setCustom('');
                }}
                aria-label="Amount presets"
                sx={{ flexWrap: 'wrap' }}
              >
                {TOPUP_PRESETS_MICROS.map((p) => (
                  <ToggleButton key={p} value={p} sx={{ flexGrow: 1 }}>
                    {formatRupeeLabel(p)}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <TextField
                label="Or enter an amount (₹)"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onBlur={() => setTouched(true)}
                error={touched && !parsed.ok}
                helperText={
                  touched && !parsed.ok
                    ? parsed.message
                    : `Whole rupees, ${formatRupeeLabel(TOPUP_MIN_MICROS)} – ${formatRupeeLabel(TOPUP_MAX_MICROS)}. GST (18%) is added on top.`
                }
                slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              />
              {profile.isError && <Alert severity="error">{getErrorMessage(profile.error)}</Alert>}
            </>
          )}

          {view.kind === 'billing' && (
            <>
              <Typography variant="body2" color="text.secondary">
                GST invoices need your business details. You only do this once.
              </Typography>
              <BillingProfileForm
                profile={profileData?.profile}
                submitLabel="Save and continue"
                onSaved={() => setStep({ kind: 'review' })}
                secondaryAction={<Button onClick={() => setStep({ kind: 'amount' })}>Back</Button>}
              />
            </>
          )}

          {view.kind === 'review' && gst && (
            <Stack spacing={1}>
              <Line label="Wallet credit" value={formatCurrencyMicros(gst.baseMicros)} />
              {gst.intraState ? (
                <>
                  <Line label="CGST (9%)" value={formatCurrencyMicros(gst.cgstMicros)} />
                  <Line label="SGST (9%)" value={formatCurrencyMicros(gst.sgstMicros)} />
                </>
              ) : (
                <Line label="IGST (18%)" value={formatCurrencyMicros(gst.igstMicros)} />
              )}
              <Divider />
              <Line label="You pay" value={formatCurrencyMicros(gst.totalMicros)} strong />
              <Typography variant="caption" color="text.secondary">
                Invoice to {profileData?.profile?.legalName}. The wallet gets{' '}
                {formatCurrencyMicros(gst.baseMicros)}; GST goes on your tax invoice.
              </Typography>
            </Stack>
          )}

          {view.kind === 'test-payment' && (
            <Stack spacing={2}>
              <Alert severity="info">
                Test mode — no real money. Choose what the payment gateway should report.
              </Alert>
              <Line
                label="Amount"
                value={formatCurrencyMicros(view.checkout.topupOrder.totalMicros)}
                strong
              />
            </Stack>
          )}

          {view.kind === 'confirming' && (
            <Stack spacing={2} sx={{ alignItems: 'center', py: 2 }} role="status">
              <CircularProgress aria-label="Confirming payment" />
              <Typography>Confirming payment…</Typography>
            </Stack>
          )}

          {view.kind === 'done' && (
            <Stack spacing={1}>
              <Alert severity="success">
                {formatCurrencyMicros(view.order.baseMicros)} added to your wallet.
              </Alert>
              {wallet.data && (
                <Typography>
                  New balance: <strong>{formatCurrencyMicros(wallet.data.balanceMicros)}</strong>
                </Typography>
              )}
              <Typography variant="body2">
                Your GST invoice will be ready in a moment —{' '}
                <Link component={RouterLink} to="/wallet?tab=invoices" onClick={onClose}>
                  see invoices
                </Link>
                .
              </Typography>
            </Stack>
          )}

          {view.kind === 'failed' && (
            <Alert severity="error">
              Payment failed: {view.reason} No money was added. You can try again.
            </Alert>
          )}
          {view.kind === 'dismissed' && (
            <Alert severity="info">Payment cancelled — nothing was charged.</Alert>
          )}
          {view.kind === 'timeout' && (
            <Alert severity="warning">
              We have not received the payment confirmation yet. If you paid, the money appears in
              your wallet within a few minutes — check Transactions.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {view.kind === 'amount' && (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" onClick={next} disabled={profile.isPending}>
              Continue
            </Button>
          </>
        )}
        {view.kind === 'review' && (
          <>
            <Button onClick={() => setStep({ kind: 'amount' })} disabled={busy}>
              Back
            </Button>
            <Button variant="contained" onClick={() => void pay()} disabled={busy || !gst}>
              {busy ? (
                <CircularProgress size={20} aria-label="Starting payment" />
              ) : gst ? (
                `Pay ${formatCurrencyMicros(gst.totalMicros)}`
              ) : (
                'Pay'
              )}
            </Button>
          </>
        )}
        {view.kind === 'test-payment' && (
          <>
            <Button
              color="error"
              onClick={() => void testPay(view.checkout, 'failed')}
              disabled={busy}
            >
              Fail payment
            </Button>
            <Button
              variant="contained"
              onClick={() => void testPay(view.checkout, 'paid')}
              disabled={busy}
            >
              Pay (test)
            </Button>
          </>
        )}
        {(view.kind === 'failed' || view.kind === 'dismissed') && (
          <>
            <Button onClick={onClose}>Close</Button>
            <Button variant="contained" onClick={restart}>
              Try again
            </Button>
          </>
        )}
        {(view.kind === 'done' || view.kind === 'timeout') && (
          <Box>
            <Button variant="contained" onClick={onClose}>
              Done
            </Button>
          </Box>
        )}
      </DialogActions>
    </Dialog>
  );
}
