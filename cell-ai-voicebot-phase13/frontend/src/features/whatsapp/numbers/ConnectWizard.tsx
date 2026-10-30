import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';

import { toApiError } from '@/services/api/errors';
import type { WhatsAppChannel, WhatsAppConfig, WhatsAppMode } from '@/services/api/types';
import type { ChannelOutcome } from '@/services/api/whatsapp';

import { useEmbeddedSignup, type SignupOutcome } from '../embedded-signup';
import { CONNECT_PROGRESS, whatsappErrorMessage } from '../labels';
import { useConnectWhatsApp } from '../queries';
import { TestSignupDialog } from '../TestSignupDialog';

import { COEXISTENCE_WARNING, MODE_OPTIONS } from './texts';

type Result =
  | { kind: 'saved'; outcome: ChannelOutcome; channel: WhatsAppChannel; reconnected: boolean }
  | { kind: 'cancelled'; step: string | null }
  | { kind: 'error'; message: string }
  | { kind: 'popup_blocked' };

type Step = 'choose' | 'signing' | 'saving' | 'result';

/** Rotating progress text while the server connects the number. */
function Progress() {
  const [at, setAt] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setAt((n) => Math.min(n + 1, CONNECT_PROGRESS.length - 1)),
      1_200,
    );
    return () => clearInterval(timer);
  }, []);
  return (
    <Stack spacing={2} sx={{ alignItems: 'center', py: 3 }} role="status">
      <CircularProgress aria-label="Connecting" />
      <Typography>{CONNECT_PROGRESS[at]}</Typography>
    </Stack>
  );
}

function ResultView({ result }: { result: Result }) {
  if (result.kind === 'cancelled') {
    return (
      <Alert severity="info">
        {result.step ? `Signup cancelled at ${result.step}.` : 'Signup cancelled.'} Nothing was
        saved.
      </Alert>
    );
  }
  if (result.kind === 'popup_blocked') {
    return <Alert severity="warning">Allow pop-ups for this site, then try again.</Alert>;
  }
  if (result.kind === 'error') return <Alert severity="error">{result.message}</Alert>;
  const { channel, outcome } = result;
  const number = `${channel.label}${channel.displayPhoneNumber ? ` · ${channel.displayPhoneNumber}` : ''}`;
  if (outcome === 'connected') {
    return (
      <Alert severity="success">
        <strong>Connected</strong> — {number}
        {result.reconnected ? ' (reconnected)' : ''}.
      </Alert>
    );
  }
  return (
    <Alert severity="warning">
      <strong>{outcome === 'needs_reconnect' ? 'Needs reconnect' : 'Action needed'}</strong> —{' '}
      {number}. {channel.statusReason?.message ?? ''}
    </Alert>
  );
}

/**
 * "Connect WhatsApp" (§1o): choose the kind of number → Meta's popup (real) or the
 * Test signup dialog (fake) → the server connects it → the result.
 */
export function ConnectWizard({
  open,
  config,
  reconnect,
  onClose,
}: {
  open: boolean;
  config: WhatsAppConfig;
  /** Reconnect an existing number (signup again; the same number keeps its record). */
  reconnect?: WhatsAppChannel | null;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<WhatsAppMode>(reconnect?.mode ?? 'cloud_api');
  const [step, setStep] = useState<Step>('choose');
  const [result, setResult] = useState<Result | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const launch = useEmbeddedSignup(config);
  const connect = useConnectWhatsApp();

  const close = () => {
    setStep('choose');
    setResult(null);
    setTestOpen(false);
    onClose();
  };

  const finish = (r: Result) => {
    setResult(r);
    setStep('result');
  };

  const onOutcome = async (outcome: SignupOutcome) => {
    setTestOpen(false);
    if (outcome.kind === 'finished') {
      setStep('saving');
      try {
        const saved = await connect.mutateAsync({
          code: outcome.code,
          mode,
          ...(Object.keys(outcome.sessionInfo).length ? { sessionInfo: outcome.sessionInfo } : {}),
        });
        finish({ kind: 'saved', ...saved });
      } catch (err) {
        finish({ kind: 'error', message: whatsappErrorMessage(toApiError(err)) });
      }
      return;
    }
    if (outcome.kind === 'sdk_failed') finish({ kind: 'error', message: outcome.message });
    else if (outcome.kind === 'error')
      finish({ kind: 'error', message: `Meta: ${outcome.message}` });
    else finish(outcome);
  };

  const start = async () => {
    setStep('signing');
    if (config.provider === 'fake') {
      setTestOpen(true);
      return;
    }
    await onOutcome(await launch(mode));
  };

  const title = reconnect ? `Reconnect ${reconnect.label}` : 'Connect WhatsApp';
  return (
    <>
      <Dialog
        open={open && !testOpen}
        onClose={step === 'saving' ? undefined : close}
        fullWidth
        maxWidth="sm"
        aria-labelledby="wa-connect-title"
      >
        <DialogTitle id="wa-connect-title">Connect WhatsApp</DialogTitle>
        <DialogContent>
          {reconnect && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {title}: sign up again with the same number — its history is kept.
            </Typography>
          )}
          {step === 'choose' && (
            <Stack spacing={2}>
              {config.provider === 'fake' && (
                <Alert severity="info">Test mode — Meta signup is simulated.</Alert>
              )}
              <RadioGroup
                aria-label="Kind of number"
                value={mode}
                onChange={(e) => setMode(e.target.value as WhatsAppMode)}
              >
                {MODE_OPTIONS.map((o) => (
                  <FormControlLabel
                    key={o.value}
                    value={o.value}
                    control={<Radio />}
                    label={
                      <span>
                        {o.label}
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          component="span"
                          sx={{ display: 'block' }}
                        >
                          {o.hint}
                        </Typography>
                      </span>
                    }
                  />
                ))}
              </RadioGroup>
              {mode === 'coexistence' && <Alert severity="warning">{COEXISTENCE_WARNING}</Alert>}
              <Typography variant="body2" color="text.secondary">
                You&apos;ll sign in to Meta, choose (or create) your WhatsApp Business account and
                number, and allow this app to manage it.
              </Typography>
            </Stack>
          )}
          {step === 'signing' && (
            <Stack spacing={2} sx={{ alignItems: 'center', py: 3 }} role="status">
              <CircularProgress aria-label="Waiting for Meta" />
              <Typography>Finish the signup in Meta&apos;s window…</Typography>
            </Stack>
          )}
          {step === 'saving' && <Progress />}
          {step === 'result' && result && <ResultView result={result} />}
        </DialogContent>
        <DialogActions>
          {step === 'choose' && (
            <>
              <Button onClick={close}>Cancel</Button>
              <Button variant="contained" onClick={() => void start()}>
                Continue
              </Button>
            </>
          )}
          {step === 'result' && (
            <>
              {result?.kind !== 'saved' && (
                <Button onClick={() => setStep('choose')}>Try again</Button>
              )}
              <Button variant="contained" onClick={close}>
                Done
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
      {testOpen && (
        <TestSignupDialog
          open
          mode={mode}
          onClose={() => void onOutcome({ kind: 'cancelled', step: 'Test signup' })}
          onDone={(outcome) => void onOutcome(outcome)}
        />
      )}
    </>
  );
}
