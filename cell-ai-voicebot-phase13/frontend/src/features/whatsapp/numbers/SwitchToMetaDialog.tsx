import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import { toApiError } from '@/services/api/errors';
import type { WhatsAppChannel, WhatsAppConfig } from '@/services/api/types';

import { useEmbeddedSignup, type SignupOutcome } from '../embedded-signup';
import { whatsappErrorMessage } from '../labels';
import { useSwitchToMeta } from '../queries';
import { TestSignupDialog } from '../TestSignupDialog';

type Step = 'explain' | 'signing' | 'saving' | 'done' | 'error';

/**
 * SAC-T11: "Switch to Meta direct" for a managed (partner) number — our Embedded Signup for
 * the same WABA and number; the same record keeps its chats, campaigns and calls, and the
 * partner credit line keeps paying Meta.
 */
export function SwitchToMetaDialog({
  channel,
  config,
  onClose,
}: {
  channel: WhatsAppChannel;
  config: WhatsAppConfig;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>('explain');
  const [message, setMessage] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const launch = useEmbeddedSignup(config);
  const save = useSwitchToMeta();
  const lineActive = channel.billing.creditLine.status === 'partner_active';

  const onOutcome = async (outcome: SignupOutcome) => {
    setTestOpen(false);
    if (outcome.kind !== 'finished') {
      setMessage(
        outcome.kind === 'popup_blocked'
          ? 'Allow pop-ups for this site, then try again.'
          : outcome.kind === 'cancelled'
            ? 'The Meta signup was closed before it finished.'
            : outcome.message,
      );
      setStep('error');
      return;
    }
    setStep('saving');
    try {
      await save.mutateAsync({
        id: channel.id,
        code: outcome.code,
        wabaId: outcome.sessionInfo.wabaId ?? channel.wabaId,
        phoneNumberId: outcome.sessionInfo.phoneNumberId ?? channel.phoneNumberId ?? '',
      });
      setStep('done');
    } catch (err) {
      setMessage(whatsappErrorMessage(toApiError(err)));
      setStep('error');
    }
  };

  const start = async () => {
    setStep('signing');
    if (config.provider === 'fake') {
      setTestOpen(true);
      return;
    }
    await onOutcome(await launch('cloud_api'));
  };

  return (
    <>
      <Dialog
        open={!testOpen}
        onClose={step === 'saving' ? undefined : onClose}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Switch {channel.label} to Meta direct</DialogTitle>
        <DialogContent>
          {step === 'explain' && (
            <Stack spacing={2}>
              <Typography>
                Calls and messages of this number will go straight through Meta (our app), not the
                partner. Chats, campaigns and scheduled calls stay as they are. Billing stays on the
                partner&apos;s credit line.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                In Meta&apos;s window, pick the same WhatsApp account and number (
                {channel.displayPhoneNumber ?? channel.phoneNumberId}).
              </Typography>
              {!lineActive && (
                <Alert severity="warning">
                  Activate the partner credit line first — it pays Meta after the switch.
                </Alert>
              )}
            </Stack>
          )}
          {step === 'signing' && (
            <Stack spacing={2} sx={{ alignItems: 'center', py: 3 }} role="status">
              <CircularProgress aria-label="Waiting for Meta" />
              <Typography>Finish the signup in Meta&apos;s window…</Typography>
            </Stack>
          )}
          {step === 'saving' && (
            <Stack spacing={2} sx={{ alignItems: 'center', py: 3 }} role="status">
              <CircularProgress aria-label="Switching" />
              <Typography>Switching the number…</Typography>
            </Stack>
          )}
          {step === 'done' && (
            <Alert severity="success">
              <strong>Meta direct</strong> — calls and messages now go through Meta.
            </Alert>
          )}
          {step === 'error' && message && <Alert severity="error">{message}</Alert>}
        </DialogContent>
        <DialogActions>
          {step === 'explain' && (
            <>
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="contained" disabled={!lineActive} onClick={() => void start()}>
                Continue
              </Button>
            </>
          )}
          {step === 'error' && (
            <>
              <Button onClick={() => setStep('explain')}>Try again</Button>
              <Button onClick={onClose}>Close</Button>
            </>
          )}
          {step === 'done' && (
            <Button variant="contained" onClick={onClose}>
              Done
            </Button>
          )}
        </DialogActions>
      </Dialog>
      {testOpen && (
        <TestSignupDialog
          open
          mode="cloud_api"
          onClose={() => void onOutcome({ kind: 'cancelled', step: 'Test signup' })}
          onDone={(outcome) => void onOutcome(outcome)}
        />
      )}
    </>
  );
}
