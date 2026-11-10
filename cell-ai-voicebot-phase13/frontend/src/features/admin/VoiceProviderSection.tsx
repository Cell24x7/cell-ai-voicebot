import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { getErrorMessage } from '@/services/api/errors';
import { voiceAdminApi, voiceApiKeys, type AdminVoiceStatus } from '@/services/api/voice-api';

type Uncertain = AdminVoiceStatus['uncertainBatches'][number];

/** Admin → System: Cell24x7 status, webhook registration and uncertain batches. */
export function VoiceProviderSection() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: voiceApiKeys.status, queryFn: () => voiceAdminApi.status() });
  const [resolving, setResolving] = useState<Uncertain | null>(null);
  const [requestId, setRequestId] = useState('');
  const refresh = () => void queryClient.invalidateQueries({ queryKey: voiceApiKeys.status });
  const register = useMutation({
    mutationFn: () => voiceAdminApi.registerWebhook(),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Webhook registered with Cell24x7', { variant: 'success' });
      refresh();
    },
  });
  const resolve = useMutation({
    mutationFn: (sent: boolean) =>
      voiceAdminApi.resolveBatch(
        resolving?.campaignId ?? '',
        resolving?.batchNo ?? 0,
        sent ? { outcome: 'submitted', requestId: requestId.trim() } : { outcome: 'not_submitted' },
      ),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Batch resolved', { variant: 'success' });
      setResolving(null);
      setRequestId('');
      refresh();
    },
  });
  const s = status.data;
  if (status.isPending) return null;
  if (status.error) return <Alert severity="error">{getErrorMessage(status.error)}</Alert>;
  if (!s || s.provider === 'off') return null;
  const platformLogin = s.tokenConfigured || s.provider === 'fake';
  return (
    <Card variant="outlined" component="section" aria-label="Recorded voice provider">
      <CardContent>
        <Stack spacing={1.5}>
          <Typography variant="subtitle1" component="h2">
            Recorded voice (Cell24x7)
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Chip size="small" label={`Provider: ${s.provider}`} />
            {s.provider === 'cell24x7' && (
              <Chip
                size="small"
                color={s.tokenConfigured ? 'success' : 'default'}
                label={s.tokenConfigured ? 'Platform token set' : 'Account API keys'}
              />
            )}
            {platformLogin && (
              <Chip
                size="small"
                color={s.webhook.matches ? 'success' : 'warning'}
                label={s.webhook.matches ? 'Webhook registered' : 'Webhook not registered'}
              />
            )}
          </Stack>
          {!platformLogin && (
            <Alert severity="info">
              Connect each account’s Cell24x7 API key in Admin → Accounts → SIP trunk. Saving
              registers its webhook automatically; no server setup is needed.
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary">
            Last result:{' '}
            {s.lastWebhookAt ? new Date(s.lastWebhookAt).toLocaleString('en-IN') : 'none yet'}
            {s.lastError
              ? ` · last error ${s.lastError.code} at ${new Date(s.lastError.at).toLocaleString('en-IN')}`
              : ''}
          </Typography>
          {s.webhook.error && (
            <Alert severity="warning">Webhook check failed: {s.webhook.error}</Alert>
          )}
          {register.error && <Alert severity="error">{getErrorMessage(register.error)}</Alert>}
          {platformLogin && (
            <div>
              <Button disabled={register.isPending} onClick={() => register.mutate()}>
                {s.webhook.matches ? 'Register webhook again' : 'Register webhook'}
              </Button>
            </div>
          )}
          {s.uncertainBatches.map((b) => (
            <Alert
              key={`${b.campaignId}-${String(b.batchNo)}`}
              severity="warning"
              action={
                <Button color="inherit" size="small" onClick={() => setResolving(b)}>
                  Resolve
                </Button>
              }
            >
              {b.campaignName} · batch #{b.batchNo} ({b.count} numbers) got no answer. Find “
              {b.broadcastName}” in the Cell24x7 dashboard.
            </Alert>
          ))}
        </Stack>
      </CardContent>
      <Dialog open={resolving !== null} onClose={() => setResolving(null)}>
        <DialogTitle>Did “{resolving?.broadcastName}” reach Cell24x7?</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <DialogContentText>
              If it is in the Cell24x7 dashboard, enter its request id: the results then follow and
              the hold is charged. If it is not there, the money and numbers go back and the next
              resume sends them again.
            </DialogContentText>
            <TextField
              label="Cell24x7 request id"
              value={requestId}
              onChange={(e) => setRequestId(e.target.value)}
              size="small"
            />
            {resolve.error && <Alert severity="error">{getErrorMessage(resolve.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={resolve.isPending} onClick={() => resolve.mutate(false)}>
            It was not sent
          </Button>
          <Button
            variant="contained"
            disabled={resolve.isPending || !requestId.trim()}
            onClick={() => resolve.mutate(true)}
          >
            It was sent
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
