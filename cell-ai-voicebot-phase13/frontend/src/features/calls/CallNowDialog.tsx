import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router';

import { useAgents } from '@/features/agents/queries';
import { contactKeys } from '@/features/contacts/keys';
import { useFlows } from '@/features/flows/queries';
import { callsApi, type StartCallInput } from '@/services/api/calls';

import { callNowErrorText } from './call-now';
import { callKeys } from './keys';
import { STATUS_LABELS, statusColor } from './labels';
import { LIVE_STATUSES, useCall, useCallLiveUpdates } from './queries';

/** "Call now" from a contact: a flow (published, campaign trigger) or an agent → live status. */
export function CallNowDialog({
  contactId,
  timezone,
  onClose,
}: {
  contactId: string;
  timezone: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<'flow' | 'agent'>('flow');
  const [flowId, setFlowId] = useState('');
  const [agentId, setAgentId] = useState('');
  const key = useRef<string | null>(null);
  const flows = useFlows({ status: 'published', limit: 100 });
  const agents = useAgents({ activeOnly: true, limit: 50 });
  const usable = (flows.data?.data ?? []).filter(
    (f) => f.publishedVersion && f.triggers.includes('campaign'),
  );
  const start = useMutation({
    mutationFn: (body: StartCallInput) => {
      // one key per attempt: a retry of the same choice reuses it
      key.current ??= crypto.randomUUID();
      return callsApi.start(body, key.current);
    },
    meta: { silent: true },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: callKeys.all });
      void queryClient.invalidateQueries({ queryKey: contactKeys.detail(contactId) });
    },
  });
  useCallLiveUpdates();
  const call = useCall(start.data?.id ?? '', { untilSettled: true });
  const live = call.data ?? start.data;
  const settled = Boolean(call.data && !LIVE_STATUSES.includes(call.data.status));
  // the call's end updates the contact's call facts (last called, count, outcome)
  useEffect(() => {
    if (settled) void queryClient.invalidateQueries({ queryKey: contactKeys.detail(contactId) });
  }, [settled, contactId, queryClient]);
  const choose = (patch: () => void) => {
    patch();
    key.current = null;
    start.reset();
  };
  const ready = kind === 'flow' ? Boolean(flowId) : Boolean(agentId);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Call now</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info">Simulated call — no phone line yet. Nothing is charged.</Alert>
          {live ? (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }} aria-live="polite">
              <Typography variant="body2">Call status:</Typography>
              <Chip
                size="small"
                color={statusColor(live.status)}
                label={STATUS_LABELS[live.status]}
              />
              <Link component={RouterLink} to={`/calls/${live.id}`}>
                Open the call
              </Link>
            </Stack>
          ) : (
            <>
              <RadioGroup
                row
                aria-label="Call with"
                value={kind}
                onChange={(e) => choose(() => setKind(e.target.value as 'flow' | 'agent'))}
              >
                <FormControlLabel value="flow" control={<Radio />} label="A flow" />
                <FormControlLabel value="agent" control={<Radio />} label="An agent" />
              </RadioGroup>
              {kind === 'flow' ? (
                <TextField
                  select
                  label="Flow"
                  value={flowId}
                  onChange={(e) => choose(() => setFlowId(e.target.value))}
                  helperText={
                    flows.isSuccess && !usable.length
                      ? 'Publish a flow whose start step allows campaigns first.'
                      : 'The published version is used.'
                  }
                >
                  {usable.map((f) => (
                    <MenuItem key={f.id} value={f.id}>
                      {f.name} (v{f.publishedVersion})
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <TextField
                  select
                  label="Agent"
                  value={agentId}
                  onChange={(e) => choose(() => setAgentId(e.target.value))}
                  helperText={
                    agents.isSuccess && !agents.data.data.length
                      ? 'Switch an agent on first.'
                      : undefined
                  }
                >
                  {(agents.data?.data ?? []).map((a) => (
                    <MenuItem key={a.id} value={a.id}>
                      {a.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              {start.error && (
                <Alert severity="error">{callNowErrorText(start.error, timezone)}</Alert>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {!live && (
          <Button
            variant="contained"
            disabled={!ready || start.isPending}
            onClick={() =>
              start.mutate(kind === 'flow' ? { contactId, flowId } : { contactId, agentId })
            }
          >
            {start.isPending ? 'Calling…' : 'Call'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
