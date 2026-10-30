import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { RelativeTime } from '@/components/RelativeTime';
import { teamKeys } from '@/features/team/keys';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import { teamApi } from '@/services/api/team';
import type { WhatsAppCallingSettings, WhatsAppInboundRoute } from '@/services/api/types';

import { todayIn } from '../call-hours';
import {
  CALL_ERROR_TEXT,
  CALLING_STATUS_LABELS,
  restrictionText,
  ROUTE_LABELS,
  unavailableText,
} from '../labels';
import { ProgramPicker } from '../ProgramPicker';
import {
  useCallingSettings,
  useCanManageCalling,
  useSyncCallingSettings,
  useUpdateCallingSettings,
} from '../queries';

import { CallHoursEditor } from './CallHoursEditor';
import { CALLING_FORM_LIMITS, draftOf, settingsPatch, settingsProblems, type Draft } from './form';

const errorText = (err: unknown) => {
  const e = toApiError(err);
  return (
    (e.kind === 'http' && e.code ? CALL_ERROR_TEXT[e.code] : undefined) ?? getErrorMessage(err)
  );
};

/** Numbers drawer → "Calling": switch, call icon, call hours, callback, inbound routing. */
export function CallingSection({ channelId }: { channelId: string }) {
  const settings = useCallingSettings(channelId);
  const canManage = useCanManageCalling();
  return (
    <Stack spacing={1} component="section" aria-label="Calling">
      <Typography variant="subtitle2">Calling</Typography>
      {settings.isPending ? (
        <Skeleton variant="rounded" height={160} />
      ) : settings.isError ? (
        <Alert severity="warning">{getErrorMessage(settings.error)}</Alert>
      ) : (
        <CallingForm
          key={JSON.stringify(settings.data)}
          settings={settings.data}
          canManage={canManage}
        />
      )}
    </Stack>
  );
}

function useRingCandidates(enabled: boolean) {
  const query = { status: 'active' as const, limit: 100 };
  return useQuery({
    queryKey: teamKeys.list(query),
    queryFn: () => teamApi.list(query),
    enabled,
    select: (page) =>
      page.data
        .filter((m) => m.role.key !== 'viewer')
        .map((m) => ({ id: m.id, name: m.name, role: m.role.name })),
  });
}

function CallingForm({
  settings,
  canManage,
}: {
  settings: WhatsAppCallingSettings;
  canManage: boolean;
}) {
  const channelId = settings.channelId;
  const saved = draftOf(settings);
  const [draft, setDraft] = useState<Draft>(saved);
  const [confirm, setConfirm] = useState(false);
  const save = useUpdateCallingSettings(channelId);
  const sync = useSyncCallingSettings(channelId);
  const unavailable = settings.status === 'unavailable';
  const enabled = settings.status === 'enabled';
  const editable = canManage && !unavailable;
  const candidates = useRingCandidates(editable && draft.inbound.ringUserIds !== null);
  const today = todayIn(draft.callHours.timezone);
  const all = settingsProblems(draft, today);
  // with calling off only the request text is on screen
  const problems: Record<string, string> = enabled
    ? all
    : all.permissionRequestBody
      ? { permissionRequestBody: all.permissionRequestBody }
      : {};
  const patch = settingsPatch(draft, saved);
  const dirty = Object.keys(patch).length > 0;
  const setInbound = (p: Partial<Draft['inbound']>) =>
    setDraft({ ...draft, inbound: { ...draft.inbound, ...p } });
  const toggle = (status: 'enabled' | 'disabled') =>
    save.mutate(
      { status },
      {
        onSuccess: () =>
          enqueueSnackbar(status === 'enabled' ? 'Calling turned on' : 'Calling turned off', {
            variant: 'success',
          }),
      },
    );
  const active = settings.restrictions.filter((r) => r.active);
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <Chip
          size="small"
          label={CALLING_STATUS_LABELS[settings.status]}
          color={enabled ? 'success' : 'default'}
        />
        {settings.syncedAt && (
          <Typography variant="caption" color="text.secondary">
            Read from WhatsApp <RelativeTime value={settings.syncedAt} />
          </Typography>
        )}
        {canManage && (
          <Button
            size="small"
            disabled={sync.isPending}
            onClick={() =>
              sync.mutate(undefined, {
                onSuccess: () =>
                  enqueueSnackbar('Call settings read from WhatsApp', { variant: 'info' }),
              })
            }
          >
            Read again
          </Button>
        )}
      </Stack>
      {unavailable && <Alert severity="info">{unavailableText(settings.unavailableReason)}</Alert>}
      {active.map((r) => (
        <Alert key={r.type} severity="warning">
          {restrictionText(r.type)}
          {r.expiresAt && (
            <>
              {' '}
              Until <RelativeTime value={r.expiresAt} />.
            </>
          )}
        </Alert>
      ))}
      {!unavailable && !settings.businessCallsAvailable && (
        <Alert severity="info">
          Customers can call this number, but calls from your business to customers are not
          available here ({settings.businessCallsBlockedBy ?? 'WhatsApp rule'}).
        </Alert>
      )}
      {settings.lastError && <Alert severity="warning">{settings.lastError}</Alert>}
      {!unavailable && (
        <FormControlLabel
          control={
            <Switch
              checked={enabled}
              disabled={!canManage || save.isPending}
              onChange={(e) => (e.target.checked ? setConfirm(true) : toggle('disabled'))}
            />
          }
          label="WhatsApp calling"
        />
      )}
      {enabled && (
        <>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              select
              size="small"
              label="Call button for customers"
              value={draft.callIconVisibility}
              disabled={!editable}
              sx={{ minWidth: 220 }}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  callIconVisibility: e.target.value as Draft['callIconVisibility'],
                })
              }
            >
              <MenuItem value="DEFAULT">Show in the chat</MenuItem>
              <MenuItem value="DISABLE_ALL">Hide everywhere</MenuItem>
            </TextField>
            <TextField
              size="small"
              fullWidth
              label="Show only in countries"
              placeholder="All countries"
              value={draft.iconCountries.join(', ')}
              disabled={!editable || draft.callIconVisibility === 'DISABLE_ALL'}
              error={Boolean(problems.iconCountries)}
              helperText={problems.iconCountries ?? 'Country codes, e.g. IN, AE'}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  iconCountries: e.target.value
                    .split(/[\s,]+/)
                    .map((c) => c.trim().toUpperCase())
                    .filter(Boolean),
                })
              }
            />
          </Stack>
          <CallHoursEditor
            value={draft.callHours}
            disabled={!editable}
            onChange={(callHours) => setDraft({ ...draft, callHours })}
          />
          {problems.callHours && <Alert severity="error">{problems.callHours}</Alert>}
          <FormControlLabel
            control={
              <Switch
                checked={draft.callbackPermission}
                disabled={!editable}
                onChange={(e) => setDraft({ ...draft, callbackPermission: e.target.checked })}
              />
            }
            label="A customer who calls you allows your call back"
          />
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            When a customer calls
          </Typography>
          <TextField
            select
            size="small"
            label="Answered by"
            value={draft.inbound.route}
            disabled={!editable}
            onChange={(e) => setInbound({ route: e.target.value as WhatsAppInboundRoute })}
          >
            {(Object.keys(ROUTE_LABELS) as WhatsAppInboundRoute[]).map((r) => (
              <MenuItem key={r} value={r}>
                {ROUTE_LABELS[r]}
              </MenuItem>
            ))}
          </TextField>
          {draft.inbound.route !== 'team' && (
            <ProgramPicker
              value={draft.inbound.aiProgram}
              disabled={!editable}
              error={problems.aiProgram ?? null}
              onChange={(aiProgram) => setInbound({ aiProgram })}
            />
          )}
          {draft.inbound.route !== 'ai' && (
            <>
              <TextField
                type="number"
                size="small"
                label="Ring for (seconds)"
                value={draft.inbound.ringTimeoutSec}
                disabled={!editable}
                error={Boolean(problems.ringTimeoutSec)}
                helperText={problems.ringTimeoutSec ?? 'Then the call is missed'}
                slotProps={{
                  htmlInput: {
                    min: CALLING_FORM_LIMITS.ringTimeoutMin,
                    max: CALLING_FORM_LIMITS.ringTimeoutMax,
                  },
                }}
                onChange={(e) => setInbound({ ringTimeoutSec: Number(e.target.value) })}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={draft.inbound.ringUserIds === null}
                    disabled={!editable}
                    onChange={(e) => setInbound({ ringUserIds: e.target.checked ? null : [] })}
                  />
                }
                label="Ring everyone who can answer and is online"
              />
              {draft.inbound.ringUserIds !== null && (
                <Autocomplete
                  multiple
                  size="small"
                  options={candidates.data ?? []}
                  loading={candidates.isPending}
                  disabled={!editable}
                  getOptionLabel={(o) => o.name}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  value={(candidates.data ?? []).filter((m) =>
                    draft.inbound.ringUserIds?.includes(m.id),
                  )}
                  onChange={(_e, list) => setInbound({ ringUserIds: list.map((m) => m.id) })}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Ring these people"
                      error={Boolean(problems.ringUserIds)}
                      helperText={problems.ringUserIds ?? 'Only those online and available ring'}
                    />
                  )}
                />
              )}
            </>
          )}
        </>
      )}
      {!unavailable && (
        <TextField
          size="small"
          multiline
          minRows={2}
          label="Call permission request text"
          value={draft.permissionRequestBody}
          disabled={!editable}
          error={Boolean(problems.permissionRequestBody)}
          helperText={
            problems.permissionRequestBody ??
            `${String(draft.permissionRequestBody.trim().length)} / ${String(CALLING_FORM_LIMITS.requestBodyMax)} — sent when you ask a customer to allow calls`
          }
          onChange={(e) => setDraft({ ...draft, permissionRequestBody: e.target.value })}
        />
      )}
      {!unavailable && (
        <Typography variant="caption" color="text.secondary">
          Calls are recorded with the recording notice of Settings → Calls.
        </Typography>
      )}
      {save.isError && <Alert severity="error">{errorText(save.error)}</Alert>}
      {editable && (
        <Button
          variant="contained"
          size="small"
          sx={{ alignSelf: 'flex-start' }}
          disabled={!dirty || Object.keys(problems).length > 0 || save.isPending}
          onClick={() =>
            save.mutate(patch, {
              onSuccess: () => enqueueSnackbar('Call settings saved', { variant: 'success' }),
            })
          }
        >
          Save call settings
        </Button>
      )}
      <Dialog open={confirm} onClose={() => setConfirm(false)}>
        <DialogTitle>Turn on WhatsApp calling?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Customers will see a call button in their chat with this number and can call your team.
            Your business can call customers who allowed it. Calls are charged per minute (calls
            customers make to you are free at WhatsApp).
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              setConfirm(false);
              toggle('enabled');
            }}
          >
            Turn on
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
