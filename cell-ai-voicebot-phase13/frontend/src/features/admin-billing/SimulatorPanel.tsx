import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import { LedgerTable } from '@/features/wallet/LedgerTable';
import { adminBillingApi } from '@/services/api/admin-billing';
import { getErrorMessage } from '@/services/api/errors';
import type { SimulatedCallResult, SimulatedHold } from '@/services/api/types';
import { formatCurrencyMicros } from '@/utils/format';

const whole = (v: string, max: number): number | null => {
  if (!/^\d{1,7}$/.test(v.trim())) return null;
  const n = Number(v);
  return n <= max ? n : null;
};

/**
 * Billing simulator (only when the server enables it): a real hold, then a
 * real settle / release — the same engine calls Phase 7 will make.
 */
export function SimulatorPanel({
  accountId,
  timezone,
  onChange,
}: {
  accountId: string;
  timezone: string;
  /** Wallet / ledger changed — refresh them. */
  onChange: () => void;
}) {
  const [minutes, setMinutes] = useState('');
  const [hold, setHold] = useState<SimulatedHold | null>(null);
  const [answered, setAnswered] = useState(true);
  const [duration, setDuration] = useState('90');
  const [aiSeconds, setAiSeconds] = useState('');
  const [ttsChars, setTtsChars] = useState('');
  const [result, setResult] = useState<SimulatedCallResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minutesValue = minutes.trim() ? whole(minutes, 60) : undefined;
  const durationValue = whole(duration, 4 * 3600);
  const aiValue = aiSeconds.trim() ? whole(aiSeconds, 4 * 3600) : undefined;
  const ttsValue = ttsChars.trim() ? whole(ttsChars, 1_000_000) : undefined;
  const endValid = durationValue !== null && aiValue !== null && ttsValue !== null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChange();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const start = () =>
    run(async () => {
      setResult(null);
      setHold(await adminBillingApi.startSimulatedCall(accountId, minutesValue ?? undefined));
    });
  const end = () =>
    run(async () => {
      if (!hold || durationValue === null) return;
      setResult(
        await adminBillingApi.endSimulatedCall(accountId, hold.holdId, {
          answered,
          durationSec: durationValue,
          ...(aiValue ? { aiSeconds: aiValue } : {}),
          ...(ttsValue ? { ttsChars: ttsValue } : {}),
        }),
      );
      setHold(null);
    });

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <div>
            <Typography variant="subtitle1">Billing simulator</Typography>
            <Typography variant="body2" color="text.secondary">
              Starts a pretend call: real money is held and charged from this wallet, exactly like a
              real call will be. Use it to check prices, holds and alerts.
            </Typography>
          </div>
          {error && <Alert severity="error">{error}</Alert>}
          {!hold && (
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              sx={{ alignItems: { sm: 'flex-start' } }}
            >
              <TextField
                size="small"
                label="Hold for (minutes)"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                error={minutesValue === null}
                helperText={
                  minutesValue === null ? '1–60 minutes' : 'Empty = the normal 3-minute hold'
                }
              />
              <Button
                variant="contained"
                onClick={() => void start()}
                disabled={busy || minutesValue === null}
              >
                Start simulated call
              </Button>
            </Stack>
          )}
          {hold && (
            <>
              <Alert severity="info">
                Call in progress — {formatCurrencyMicros(hold.heldMicros)} on hold (prices:{' '}
                {hold.rateCard.source === 'account' ? 'account override' : 'platform default'}).
              </Alert>
              <FormControlLabel
                control={
                  <Switch checked={answered} onChange={(e) => setAnswered(e.target.checked)} />
                }
                label="Answered"
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  size="small"
                  label="Duration (seconds)"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  error={durationValue === null}
                  helperText={durationValue === null ? 'Whole seconds, up to 4 hours' : undefined}
                />
                <TextField
                  size="small"
                  label="AI seconds"
                  value={aiSeconds}
                  onChange={(e) => setAiSeconds(e.target.value)}
                  error={aiValue === null}
                  helperText={aiValue === null ? 'Whole seconds' : 'Optional'}
                />
                <TextField
                  size="small"
                  label="TTS characters"
                  value={ttsChars}
                  onChange={(e) => setTtsChars(e.target.value)}
                  error={ttsValue === null}
                  helperText={ttsValue === null ? 'Whole number' : 'Optional'}
                />
              </Stack>
              <div>
                <Button variant="contained" onClick={() => void end()} disabled={busy || !endValid}>
                  End call
                </Button>
              </div>
            </>
          )}
          {result && (
            <>
              <Alert severity={result.outcome === 'charged' ? 'success' : 'info'}>
                {result.outcome === 'charged'
                  ? `Call charged. Balance now ${formatCurrencyMicros(result.wallet.balanceMicros)}.`
                  : 'Not billable — the whole hold was released.'}
              </Alert>
              <LedgerTable
                rows={result.entries}
                timezone={timezone}
                onOpen={() => undefined}
                emptyTitle="No rows"
              />
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
