import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useIsFullAccess } from '@/features/auth/hooks';
import { callingKeys } from '@/features/whatsapp-calling/keys';
import { toApiError } from '@/services/api/errors';
import type {
  MetaCallingInput,
  MetaCallingResult,
  WhatsAppChannel,
  WhatsAppConfig,
} from '@/services/api/types';

import { useEmbeddedSignup, type SignupOutcome } from '../embedded-signup';
import { whatsappErrorMessage } from '../labels';
import { useEnableMetaCalling } from '../queries';
import { TestSignupDialog } from '../TestSignupDialog';

import { META_CALLING_EXPLAIN, META_CALLING_STEP_LABELS } from './meta-calling-texts';

type Step = 'explain' | 'signing' | 'saving' | 'result' | 'error';

/** The ✅ / ❌ list of a turn-on or a check. */
export function MetaCallingSteps({ steps }: { steps: MetaCallingResult['steps'] }) {
  return (
    <List dense aria-label="Calling on steps">
      {steps.map((s) => (
        <ListItem key={s.key} disableGutters>
          <ListItemText
            primary={`${s.ok ? '✅' : '❌'} ${META_CALLING_STEP_LABELS[s.key]}`}
            secondary={s.ok ? null : s.detail}
          />
        </ListItem>
      ))}
    </List>
  );
}

/**
 * PMC: "Calling on karo (Meta direct)" for a managed number — our Embedded Signup for the
 * same WhatsApp account and number (a superadmin in Full access may paste a System User token
 * instead). Messages stay on the partner; only calls move to Meta Graph.
 */
export function MetaCallingDialog({
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
  const [result, setResult] = useState<MetaCallingResult | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [token, setToken] = useState('');
  const fullAccess = useIsFullAccess();
  const launch = useEmbeddedSignup(config);
  const save = useEnableMetaCalling();
  const client = useQueryClient();
  const number = channel.displayPhoneNumber ?? channel.phoneNumberId ?? '';
  const last4 = number.replace(/\D/g, '').slice(-4);

  const send = async (body: MetaCallingInput) => {
    setStep('saving');
    try {
      const r = await save.mutateAsync({ id: channel.id, body });
      setResult(r);
      setStep('result');
    } catch (err) {
      setMessage(whatsappErrorMessage(toApiError(err)));
      setStep('error');
    } finally {
      void client.invalidateQueries({ queryKey: callingKeys.settings(channel.id) });
      void client.invalidateQueries({ queryKey: callingKeys.readiness(channel.id) });
    }
  };

  const onOutcome = async (outcome: SignupOutcome) => {
    setTestOpen(false);
    if (outcome.kind !== 'finished') {
      setMessage(
        outcome.kind === 'popup_blocked'
          ? 'Allow pop-ups for this site, then try again.'
          : outcome.kind === 'cancelled'
            ? 'The Meta window was closed before it finished.'
            : outcome.message,
      );
      setStep('error');
      return;
    }
    await send({
      code: outcome.code,
      ...(outcome.sessionInfo.wabaId ? { wabaId: outcome.sessionInfo.wabaId } : {}),
      ...(outcome.sessionInfo.phoneNumberId
        ? { phoneNumberId: outcome.sessionInfo.phoneNumberId }
        : {}),
    });
  };

  const start = async () => {
    setStep('signing');
    if (config.provider === 'fake') {
      setTestOpen(true);
      return;
    }
    await onOutcome(await launch('cloud_api'));
  };

  const on = result?.channel.metaCalling.status === 'on';

  return (
    <>
      <Dialog
        open={!testOpen}
        onClose={step === 'saving' ? undefined : onClose}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Calling on karo (Meta direct)</DialogTitle>
        <DialogContent>
          {step === 'explain' && (
            <Stack spacing={2}>
              <Typography>{META_CALLING_EXPLAIN}</Typography>
              <Typography variant="body2" color="text.secondary">
                Meta ki window mein yahi WhatsApp account aur number chunein ({number}
                {last4 ? ` — …${last4}` : ''}).
              </Typography>
              {fullAccess && (
                <Accordion disableGutters variant="outlined">
                  <AccordionSummary>Advanced (superadmin): System User token</AccordionSummary>
                  <AccordionDetails>
                    <Stack spacing={1}>
                      <Typography variant="body2" color="text.secondary">
                        Meta Business Settings → System users → is WhatsApp account ko assign karke
                        token banayein (whatsapp_business_management + whatsapp_business_messaging).
                      </Typography>
                      <TextField
                        label="System User token"
                        type="password"
                        size="small"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        autoComplete="off"
                      />
                      <Button
                        variant="outlined"
                        disabled={token.trim().length < 20}
                        onClick={() => void send({ accessToken: token.trim() })}
                      >
                        Use this token
                      </Button>
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              )}
            </Stack>
          )}
          {step === 'signing' && (
            <Stack spacing={2} sx={{ alignItems: 'center', py: 3 }} role="status">
              <CircularProgress aria-label="Waiting for Meta" />
              <Typography>Meta ki window mein signup poora karein…</Typography>
            </Stack>
          )}
          {step === 'saving' && (
            <Stack spacing={2} sx={{ alignItems: 'center', py: 3 }} role="status">
              <CircularProgress aria-label="Turning calling on" />
              <Typography>Calling on ho rahi hai…</Typography>
            </Stack>
          )}
          {step === 'result' && result && (
            <Stack spacing={1}>
              <MetaCallingSteps steps={result.steps} />
              {on ? (
                <Alert severity="success">Calling on — ab is number par call aayegi.</Alert>
              ) : (
                <Alert severity="warning">
                  {result.channel.metaCalling.error?.message ??
                    'A step failed. Fix it and press Retry check.'}
                </Alert>
              )}
            </Stack>
          )}
          {step === 'error' && message && <Alert severity="error">{message}</Alert>}
        </DialogContent>
        <DialogActions>
          {step === 'explain' && (
            <>
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="contained" onClick={() => void start()}>
                Continue with Facebook
              </Button>
            </>
          )}
          {step === 'error' && (
            <>
              <Button onClick={() => setStep('explain')}>Try again</Button>
              <Button onClick={onClose}>Close</Button>
            </>
          )}
          {step === 'result' && (
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
