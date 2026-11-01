import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { CopyButton } from '@/components/CopyButton';
import { getErrorMessage } from '@/services/api/errors';
import type { WebhookEndpoint } from '@/services/api/types';
import {
  WEBHOOK_EVENTS,
  webhooksApi,
  type EndpointInput,
  type WebhookEventType,
} from '@/services/api/webhooks';

import { integrationKeys } from '../keys';

import { endpointProblem, type EndpointDraft } from './webhooks';

/** The signing secret, shown once (create / rotate). */
export function SecretDialog({ secret, onClose }: { secret: string; onClose: () => void }) {
  return (
    <Dialog open onClose={undefined} fullWidth maxWidth="sm" aria-labelledby="secret-title">
      <DialogTitle id="secret-title">Copy the signing secret now</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Alert severity="warning">
            This is the only time the secret is shown. Your server uses it to check that a request
            really came from NotifyNow (header <code>X-Webhook-Signature</code>).
          </Alert>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <TextField
              fullWidth
              value={secret}
              slotProps={{ htmlInput: { readOnly: true, 'aria-label': 'Signing secret' } }}
            />
            <CopyButton value={secret} label="Copy secret" />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          I&apos;ve copied it
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Add / change an endpoint. A new endpoint ends in the secret-once dialog. */
export function EndpointDialog({
  endpoint,
  onClose,
}: {
  endpoint: WebhookEndpoint | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<EndpointDraft>({
    url: endpoint?.url ?? '',
    description: endpoint?.description ?? '',
    events: (endpoint?.events ?? ['*']) as EndpointDraft['events'],
    includePersonalData: endpoint?.includePersonalData ?? false,
  });
  const [touched, setTouched] = useState(false);
  const problem = endpointProblem(draft);
  // dev / test servers only: the backend's own receiver (the request 404s elsewhere)
  const devReceiver = useQuery({
    queryKey: integrationKeys.devReceiver,
    queryFn: webhooksApi.devReceiver,
    staleTime: Infinity,
    retry: false,
    meta: { silent: true },
  });
  const save = useMutation({
    mutationFn: () => {
      const body: EndpointInput = {
        url: draft.url.trim(),
        description: draft.description.trim(),
        events: draft.events,
        includePersonalData: draft.includePersonalData,
      };
      return endpoint
        ? webhooksApi.update(endpoint.id, body).then(() => null)
        : webhooksApi.create(body).then((r) => r.secret);
    },
    meta: { silent: true },
    onSuccess: (secret) => {
      void queryClient.invalidateQueries({ queryKey: integrationKeys.webhooks });
      if (!secret) onClose();
    },
  });
  if (save.data) return <SecretDialog secret={save.data} onClose={onClose} />;
  const all = draft.events.includes('*');
  const toggle = (key: WebhookEventType, on: boolean) =>
    setDraft({
      ...draft,
      events: on
        ? [...draft.events.filter((e) => e !== '*'), key]
        : draft.events.filter((e) => e !== key),
    });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="endpoint-title">
      <DialogTitle id="endpoint-title">{endpoint ? 'Change webhook' : 'Add webhook'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {save.error && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
          <TextField
            label="URL"
            placeholder="https://example.com/notifynow/webhook"
            value={draft.url}
            onChange={(e) => {
              setTouched(true);
              setDraft({ ...draft, url: e.target.value });
            }}
            helperText="Your server's address — https only. Answer with any 2xx within 10 seconds."
          />
          {devReceiver.data && (
            <Button
              size="small"
              sx={{ alignSelf: 'flex-start' }}
              onClick={() => {
                setTouched(true);
                setDraft({
                  ...draft,
                  url: devReceiver.data,
                  description: draft.description || 'Dev receiver',
                });
              }}
            >
              Use the dev receiver
            </Button>
          )}
          <TextField
            label="Description (optional)"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          <div>
            <FormLabel component="legend">Events</FormLabel>
            <FormGroup>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={all}
                    onChange={(e) => setDraft({ ...draft, events: e.target.checked ? ['*'] : [] })}
                  />
                }
                label="All events (also future ones)"
              />
              {!all &&
                WEBHOOK_EVENTS.map((ev) => (
                  <FormControlLabel
                    key={ev.key}
                    control={
                      <Checkbox
                        checked={draft.events.includes(ev.key)}
                        onChange={(e) => {
                          setTouched(true);
                          toggle(ev.key, e.target.checked);
                        }}
                      />
                    }
                    label={
                      <span>
                        {ev.label} <code>{ev.key}</code>
                      </span>
                    }
                  />
                ))}
            </FormGroup>
          </div>
          <FormControlLabel
            control={
              <Switch
                checked={draft.includePersonalData}
                onChange={(e) => setDraft({ ...draft, includePersonalData: e.target.checked })}
              />
            }
            label="Include personal data (phone, name, call summary, message text)"
          />
          {draft.includePersonalData && (
            <Alert severity="warning">
              Customer data will leave NotifyNow and be stored by this server. Turn this on only if
              the receiving system needs it and you are allowed to share it.
            </Alert>
          )}
          {touched && problem && <FormHelperText error>{problem}</FormHelperText>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={Boolean(problem) || save.isPending}
          onClick={() => save.mutate()}
        >
          {endpoint ? 'Save' : 'Add webhook'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** "Send test event": a sample payload now, the receiver's answer shown as text. */
export function TestDialog({
  endpoint,
  onClose,
}: {
  endpoint: WebhookEndpoint;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<WebhookEventType>('call.completed');
  const test = useMutation({
    mutationFn: () => webhooksApi.test(endpoint.id, type),
    meta: { silent: true },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: integrationKeys.webhooks }),
  });
  const d = test.data?.delivery;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="test-title">
      <DialogTitle id="test-title">Send test event</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            select
            label="Event"
            value={type}
            onChange={(e) => setType(e.target.value as WebhookEventType)}
          >
            {WEBHOOK_EVENTS.map((ev) => (
              <MenuItem key={ev.key} value={ev.key}>
                {ev.key}
              </MenuItem>
            ))}
          </TextField>
          {test.error && <Alert severity="error">{getErrorMessage(test.error)}</Alert>}
          {d && (
            <Alert severity={test.data?.ok ? 'success' : 'error'}>
              {test.data?.ok ? 'Delivered' : 'Not delivered'} —{' '}
              {d.responseStatus ? `HTTP ${String(d.responseStatus)}` : (d.error ?? 'no answer')}
              {d.responseMs !== null ? ` in ${String(d.responseMs)} ms` : ''}
            </Alert>
          )}
          {d?.responseSnippet && (
            <div>
              <Typography variant="caption" color="text.secondary">
                Your server answered (first 1 KB, shown as text):
              </Typography>
              <Typography
                component="pre"
                variant="body2"
                sx={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  bgcolor: 'action.hover',
                  p: 1,
                }}
              >
                {d.responseSnippet}
              </Typography>
            </div>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" disabled={test.isPending} onClick={() => test.mutate()}>
          Send
        </Button>
      </DialogActions>
    </Dialog>
  );
}
