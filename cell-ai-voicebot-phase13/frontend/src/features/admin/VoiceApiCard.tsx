import {
  Alert,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  ListItemText,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { getErrorMessage } from '@/services/api/errors';
import type { AdminAccountDetail } from '@/services/api/types';
import { voiceAdminApi, voiceApiKeys, type VoiceCredentials } from '@/services/api/voice-api';

import { adminKeys } from './keys';

const PLATFORM: VoiceCredentials = {
  mode: 'platform',
  tokenHint: null,
  callerId: null,
  verifiedAt: null,
  webhookRegisteredAt: null,
  checkError: null,
};

/**
 * Superadmin: which Cell24x7 login the account uses — the platform token, or the
 * account's own token + caller ID (checked by Cell24x7 before it is saved) and its webhook.
 */
function Cell24x7Login({ accountId, saved }: { accountId: string; saved: VoiceCredentials }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<VoiceCredentials['mode']>(saved.mode);
  const [token, setToken] = useState('');
  const [callerId, setCallerId] = useState(saved.callerId ?? '');
  const callerBad = callerId.trim() !== '' && !/^\d{10}$/.test(callerId.trim());
  const needsToken = mode === 'own' && !saved.tokenHint && !token.trim();
  const done = (text: string) => {
    enqueueSnackbar(text, { variant: 'success' });
    setToken('');
    void queryClient.invalidateQueries({ queryKey: adminKeys.account(accountId) });
  };
  const save = useMutation({
    mutationFn: () =>
      voiceAdminApi.setCredentials(
        accountId,
        mode === 'platform'
          ? { mode: 'platform' }
          : {
              mode: 'own',
              ...(token.trim() ? { token: token.trim() } : {}),
              callerId: callerId.trim() || null,
            },
      ),
    meta: { silent: true },
    onSuccess: () => done(mode === 'own' ? 'Cell24x7 login saved' : 'Using the platform token'),
  });
  const webhook = useMutation({
    mutationFn: () => voiceAdminApi.registerAccountWebhook(accountId),
    meta: { silent: true },
    onSuccess: () => done('Webhook registered with this account’s Cell24x7 login'),
  });
  const own = saved.mode === 'own';
  return (
    <Stack spacing={1.5} component="section" aria-label="Cell24x7 login">
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="subtitle2" component="h3">
          Cell24x7 login
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          label={own ? `Own token ••••${saved.tokenHint ?? ''}` : 'Platform token'}
        />
        {own && (
          <Chip
            size="small"
            color={saved.webhookRegisteredAt ? 'success' : 'warning'}
            label={saved.webhookRegisteredAt ? 'Webhook registered' : 'Webhook not registered'}
          />
        )}
      </Stack>
      <RadioGroup
        value={mode}
        onChange={(e) => setMode(e.target.value as VoiceCredentials['mode'])}
      >
        <FormControlLabel
          value="platform"
          control={<Radio size="small" />}
          label="Platform token (our Cell24x7 credits)"
        />
        <FormControlLabel
          value="own"
          control={<Radio size="small" />}
          label="This account’s own Cell24x7 token (its credits, IVRs and caller ID)"
        />
      </RadioGroup>
      {mode === 'own' && (
        <>
          <TextField
            label={
              saved.tokenHint ? 'New API token (leave empty to keep the saved one)' : 'API token'
            }
            type="password"
            size="small"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            helperText="From the account’s Cell24x7 dashboard → Settings → API. Checked with Cell24x7, then stored encrypted."
          />
          <TextField
            label="Caller ID (10 digits)"
            size="small"
            value={callerId}
            onChange={(e) => setCallerId(e.target.value)}
            error={callerBad}
            helperText={callerBad ? 'Use the 10-digit caller ID' : 'Empty = the server default'}
            sx={{ maxWidth: 320 }}
          />
        </>
      )}
      {save.error && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
      {webhook.error && <Alert severity="error">{getErrorMessage(webhook.error)}</Alert>}
      {own && saved.checkError && (
        <Alert severity="warning">Saved, not checked yet. {saved.checkError}</Alert>
      )}
      {own && !saved.checkError && !saved.webhookRegisteredAt && (
        <Alert severity="warning">
          Register the webhook so results arrive at once (polling still reads them every few
          minutes).
        </Alert>
      )}
      <Stack direction="row" spacing={1}>
        <Button disabled={save.isPending || callerBad || needsToken} onClick={() => save.mutate()}>
          {mode === 'own' ? 'Check and save login' : 'Use platform token'}
        </Button>
        {own && mode === 'own' && (
          <Button disabled={webhook.isPending} onClick={() => webhook.mutate()}>
            Register webhook
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

/** Superadmin: recorded-voice / IVR campaigns (Cell24x7) for this account. */
export function VoiceApiCard({ detail }: { detail: AdminAccountDetail }) {
  const id = detail.account.id;
  const initial = detail.voiceApi ?? {
    enabled: false,
    ivrIds: [],
    ivrEstimateSec: 60,
    credentials: PLATFORM,
  };
  const ownLogin = initial.credentials.mode === 'own';
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [ivrIds, setIvrIds] = useState<number[]>(initial.ivrIds);
  const [estimate, setEstimate] = useState(String(initial.ivrEstimateSec));
  const ivrs = useQuery({ queryKey: voiceApiKeys.ivrs, queryFn: () => voiceAdminApi.ivrs() });
  const sec = Number(estimate);
  const secBad = !(Number.isInteger(sec) && sec >= 15 && sec <= 120);
  const save = useMutation({
    mutationFn: () => voiceAdminApi.setAccount(id, { enabled, ivrIds, ivrEstimateSec: sec }),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Recorded voice settings saved', { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: adminKeys.account(id) });
    },
  });
  return (
    <Card variant="outlined" component="section" aria-label="Recorded voice">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="subtitle1" component="h2">
            Recorded voice (Cell24x7)
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Campaigns that play one audio or IVR menu to every number through Cell24x7. Set the
            price per 15 s in this account’s rate card.
          </Typography>
          <FormControlLabel
            control={<Switch checked={enabled} onChange={(_e, v) => setEnabled(v)} />}
            label={enabled ? 'On for this account' : 'Off'}
          />
          {ownLogin ? (
            <Typography variant="body2" color="text.secondary">
              IVR menus: every runnable IVR of this account’s own Cell24x7 login.
            </Typography>
          ) : (
            <TextField
              select
              label="IVR menus this account may use"
              value={ivrIds}
              size="small"
              disabled={ivrs.isPending}
              slotProps={{
                select: {
                  multiple: true,
                  renderValue: (v) => `${String((v as number[]).length)} selected`,
                },
              }}
              onChange={(e) => setIvrIds(e.target.value as unknown as number[])}
            >
              {(ivrs.data ?? []).map((i) => (
                <MenuItem key={i.id} value={i.id} disabled={!i.runnable}>
                  <Checkbox size="small" checked={ivrIds.includes(i.id)} />
                  <ListItemText primary={i.name} secondary={i.runnable ? null : 'Not runnable'} />
                </MenuItem>
              ))}
            </TextField>
          )}
          {!ownLogin && ivrs.error && (
            <Alert severity="warning">{getErrorMessage(ivrs.error)}</Alert>
          )}
          <TextField
            label="Seconds billed per number for an IVR"
            size="small"
            type="number"
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
            error={secBad}
            helperText={secBad ? '15 to 120' : 'An IVR’s length is not known up front'}
            sx={{ maxWidth: 320 }}
          />
          {save.error && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
          <div>
            <Button disabled={secBad || save.isPending} onClick={() => save.mutate()}>
              Save recorded voice
            </Button>
          </div>
          <Divider />
          <Cell24x7Login
            key={JSON.stringify(initial.credentials)}
            accountId={id}
            saved={initial.credentials}
          />
        </Stack>
      </CardContent>
    </Card>
  );
}
