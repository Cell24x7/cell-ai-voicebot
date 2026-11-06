import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { usePermission } from '@/features/auth/hooks';
import { INBOUND_ROUTE_LABELS } from '@/features/calls/labels';
import { teamKeys } from '@/features/team/keys';
import { useActing } from '@/features/whatsapp-calling/permissions';
import { ProgramPicker } from '@/features/whatsapp-calling/ProgramPicker';
import { CallHoursEditor } from '@/features/whatsapp-calling/settings/CallHoursEditor';
import { getErrorMessage } from '@/services/api/errors';
import {
  PHONE_PURPOSE_LABELS,
  phoneNumberKeys,
  phoneNumbersApi,
} from '@/services/api/phone-numbers';
import { teamApi } from '@/services/api/team';
import type { InboundNumber, InboundSettings } from '@/services/api/types';
import { formatPhone } from '@/utils/phone';

import { draftOf, INBOUND_FORM_LIMITS, inboundProblems, needsProgram } from './inbound';

const ROUTE_HELP: Record<InboundSettings['route'], string> = {
  ai: 'A published flow or an active AI agent answers every call.',
  team: 'Team members ring in the browser; the first to accept talks to the customer.',
  ai_then_team: 'The AI answers; its transfer step rings the team.',
  team_then_ai: 'The team rings first; if nobody accepts in time, the AI answers.',
};

const AFTER_HOURS_LABELS: Record<InboundSettings['afterHours']['action'], string> = {
  message: 'Say a message and hang up',
  ai: 'Let the AI answer',
  hangup: 'Do not answer',
};

function useRingCandidates(enabled: boolean) {
  const query = { status: 'active' as const, limit: 100 };
  return useQuery({
    queryKey: teamKeys.list(query),
    queryFn: () => teamApi.list(query),
    enabled,
    select: (page) =>
      page.data.filter((m) => m.role.key !== 'viewer').map((m) => ({ id: m.id, name: m.name })),
  });
}

function InboundDialog({ number, onClose }: { number: InboundNumber; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<InboundSettings>(() => draftOf(number));
  const [touched, setTouched] = useState(false);
  const candidates = useRingCandidates(draft.ringUserIds !== null);
  const problems = inboundProblems(draft);
  const set = (p: Partial<InboundSettings>) => setDraft({ ...draft, ...p });
  const save = useMutation({
    mutationFn: () =>
      phoneNumbersApi.updateInbound(number.id, {
        ...draft,
        greeting: draft.greeting.trim(),
        afterHours: { ...draft.afterHours, message: draft.afterHours.message.trim() },
      }),
    meta: { silent: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: phoneNumberKeys.inbound });
      enqueueSnackbar('Incoming call settings saved', { variant: 'success' });
      onClose();
    },
  });
  const show = (key: string) => (touched ? problems[key] : undefined);
  const usesTeam = draft.route !== 'ai';
  return (
    <Dialog open fullWidth maxWidth="sm" onClose={save.isPending ? undefined : onClose}>
      <DialogTitle>Incoming calls · {number.label || formatPhone(number.number)}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {save.error && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
          <FormControlLabel
            control={
              <Switch
                checked={draft.enabled}
                onChange={(e) => set({ enabled: e.target.checked })}
              />
            }
            label="Take calls on this number"
          />
          <Stack spacing={0.5}>
            <Typography variant="subtitle2">Who answers</Typography>
            <RadioGroup
              value={draft.route}
              onChange={(e) => set({ route: e.target.value as InboundSettings['route'] })}
            >
              {(Object.keys(INBOUND_ROUTE_LABELS) as InboundSettings['route'][]).map((r) => (
                <FormControlLabel
                  key={r}
                  value={r}
                  control={<Radio size="small" />}
                  label={
                    <Stack>
                      <span>{INBOUND_ROUTE_LABELS[r]}</span>
                      <Typography variant="caption" color="text.secondary">
                        {ROUTE_HELP[r]}
                      </Typography>
                    </Stack>
                  }
                />
              ))}
            </RadioGroup>
          </Stack>
          {needsProgram(draft) && (
            <ProgramPicker
              value={draft.program}
              onChange={(program) => set({ program })}
              error={show('program') ?? null}
            />
          )}
          {usesTeam && (
            <>
              <TextField
                label="Greeting before the team rings (optional)"
                value={draft.greeting}
                onChange={(e) => set({ greeting: e.target.value })}
                error={Boolean(show('greeting'))}
                helperText={
                  show('greeting') ??
                  'Said at once, then the caller hears ringing. Empty: the caller hears ringing until someone accepts.'
                }
                slotProps={{ htmlInput: { maxLength: INBOUND_FORM_LIMITS.greetingMax } }}
              />
              <TextField
                label="Ring for (seconds)"
                type="number"
                value={Number.isNaN(draft.ringTimeoutSec) ? '' : draft.ringTimeoutSec}
                onChange={(e) =>
                  set({ ringTimeoutSec: e.target.value === '' ? NaN : Number(e.target.value) })
                }
                error={Boolean(show('ringTimeoutSec'))}
                helperText={show('ringTimeoutSec') ?? 'Then the call is missed (or the AI answers)'}
                sx={{ maxWidth: 220 }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={draft.ringUserIds === null}
                    onChange={(e) => set({ ringUserIds: e.target.checked ? null : [] })}
                  />
                }
                label="Ring everyone who can answer and is online"
              />
              {draft.ringUserIds !== null && (
                <Autocomplete
                  multiple
                  size="small"
                  options={candidates.data ?? []}
                  loading={candidates.isPending}
                  getOptionLabel={(o) => o.name}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  value={(candidates.data ?? []).filter((m) => draft.ringUserIds?.includes(m.id))}
                  onChange={(_e, list) => set({ ringUserIds: list.map((m) => m.id) })}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Ring these people"
                      error={Boolean(show('ringUserIds'))}
                      helperText={show('ringUserIds') ?? 'Only those online and available ring'}
                    />
                  )}
                />
              )}
            </>
          )}
          <Stack spacing={1}>
            <Typography variant="subtitle2">Call hours</Typography>
            <CallHoursEditor
              value={draft.callHours}
              disabled={false}
              onChange={(callHours) => set({ callHours })}
            />
            {show('callHours') && (
              <Typography variant="caption" color="error">
                {show('callHours')}
              </Typography>
            )}
          </Stack>
          {draft.callHours.enabled && (
            <Stack spacing={1}>
              <TextField
                select
                label="After hours"
                value={draft.afterHours.action}
                onChange={(e) =>
                  set({
                    afterHours: {
                      ...draft.afterHours,
                      action: e.target.value as InboundSettings['afterHours']['action'],
                    },
                  })
                }
              >
                {(Object.keys(AFTER_HOURS_LABELS) as InboundSettings['afterHours']['action'][]).map(
                  (a) => (
                    <MenuItem key={a} value={a}>
                      {AFTER_HOURS_LABELS[a]}
                    </MenuItem>
                  ),
                )}
              </TextField>
              {draft.afterHours.action === 'message' && (
                <TextField
                  label="After-hours message"
                  multiline
                  minRows={2}
                  value={draft.afterHours.message}
                  onChange={(e) =>
                    set({ afterHours: { ...draft.afterHours, message: e.target.value } })
                  }
                  error={Boolean(show('afterHours'))}
                  helperText={show('afterHours') ?? 'The caller hears it, then the call ends'}
                  slotProps={{ htmlInput: { maxLength: INBOUND_FORM_LIMITS.messageMax } }}
                />
              )}
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={save.isPending}
          onClick={() => {
            setTouched(true);
            if (Object.keys(problems).length === 0) save.mutate();
          }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function NumberCard({ number, canEdit }: { number: InboundNumber; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const r = number.readiness;
  const ready = r.problems.length === 0;
  return (
    <Paper
      variant="outlined"
      sx={{ p: 2 }}
      component="article"
      aria-label={number.label || number.number}
    >
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {formatPhone(number.number)}
          </Typography>
          {number.label && <Typography color="text.secondary">{number.label}</Typography>}
          <Chip size="small" variant="outlined" label={PHONE_PURPOSE_LABELS[number.purpose]} />
          <Chip
            size="small"
            color={ready ? 'success' : number.inbound.enabled ? 'warning' : 'default'}
            label={ready ? 'Taking calls' : number.inbound.enabled ? 'Not ready' : 'Off'}
          />
          {canEdit && (
            <Button size="small" sx={{ ml: 'auto' }} onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </Stack>
        <Typography variant="body2">
          Who answers: {INBOUND_ROUTE_LABELS[number.inbound.route]}
          {number.inbound.callHours.enabled ? ' · call hours on' : ''}
        </Typography>
        {!ready && (
          <Stack component="ul" sx={{ m: 0, pl: 2.5 }}>
            {r.problems.map((p) => (
              <Typography component="li" variant="body2" color="text.secondary" key={p}>
                {p}
              </Typography>
            ))}
          </Stack>
        )}
      </Stack>
      {editing && <InboundDialog number={number} onClose={() => setEditing(false)} />}
    </Paper>
  );
}

/**
 * Settings → Phone numbers (Phase 20): the account's numbers customers can call, who
 * answers them (AI, team or both), call hours, and what still stops calls.
 */
export function PhoneNumbersTab() {
  const canUpdate = usePermission('account.update');
  const acting = useActing();
  const numbers = useQuery({ queryKey: phoneNumberKeys.inbound, queryFn: phoneNumbersApi.inbound });
  if (numbers.isPending) return <Skeleton variant="rounded" height={160} />;
  if (numbers.error) return <Alert severity="error">{getErrorMessage(numbers.error)}</Alert>;
  const list = numbers.data;
  return (
    <Stack spacing={2} sx={{ maxWidth: 820 }}>
      <Typography variant="body2" color="text.secondary">
        Customers can call these numbers. Choose who answers each one: a flow or AI agent, your team
        in the browser, or both. Missed calls appear under Calls → Missed.
      </Typography>
      {list.length === 0 ? (
        <Alert severity="info">
          No number takes incoming calls yet. Ask support to give your account an incoming number.
        </Alert>
      ) : (
        list.map((n) => <NumberCard key={n.id} number={n} canEdit={canUpdate && acting} />)
      )}
    </Stack>
  );
}
