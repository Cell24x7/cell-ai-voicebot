import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { usePermission, useSession } from '@/features/auth/hooks';
import { reloadMe } from '@/features/auth/session';
import { CallingWindowField } from '@/features/campaigns/fields/CallingWindowField';
import { accountApi, type AccountUpdate } from '@/services/api/account';
import { getErrorMessage } from '@/services/api/errors';
import type { AccountWithWarning, PublicAccount } from '@/services/api/types';

import { settingsKeys } from './keys';

const NOTICE_MAX = 200;
/** Mirrors the backend CALL_CAP_RANGES. */
const CAP_RANGES = {
  perDay: { min: 1, max: 10 },
  perWeek: { min: 1, max: 50 },
  minGapMinutes: { min: 0, max: 1_440 },
} as const;

const WARNING_TEXT: Record<NonNullable<AccountWithWarning['callingWindowWarning']>, string> = {
  outside_trai:
    'Part of this window is outside 09:00–21:00. Live calls never go out then (TRAI) — only that part is used.',
  outside_rbi_recovery:
    'Part of this window is outside 08:00–19:00. Live recovery calls never go out then (RBI) — only that part is used for them.',
};

type Settings = PublicAccount['settings'];
type Draft = Pick<Settings, 'callingWindow' | 'callCaps' | 'recordingEnabled' | 'recordingNotice'>;
const draftOf = (a: PublicAccount): Draft => ({
  callingWindow: { ...a.settings.callingWindow, days: [...a.settings.callingWindow.days] },
  callCaps: { ...a.settings.callCaps },
  recordingEnabled: a.settings.recordingEnabled,
  recordingNotice: a.settings.recordingNotice,
});

/**
 * Settings → Calls: the calling window (+ compliance warning), how often one
 * contact may be called (owner / admin), call recording and its notice.
 */
export function CallsTab() {
  const session = useSession();
  const canUpdate = usePermission('account.update');
  const account = session?.account;
  if (!account) return null;
  const canEdit = canUpdate && account.status !== 'suspended' && !session.impersonation;
  return (
    <CallsForm
      key={JSON.stringify(draftOf(account))}
      account={account}
      canEdit={canEdit}
      canEditCaps={canEdit && ['owner', 'admin'].includes(session.role.key)}
    />
  );
}

const capProblem = (caps: Draft['callCaps']): string | null => {
  for (const k of ['perDay', 'perWeek', 'minGapMinutes'] as const) {
    const v = caps[k];
    const r = CAP_RANGES[k];
    if (!Number.isInteger(v) || v < r.min || v > r.max) {
      return `Use whole numbers between ${String(r.min)} and ${String(r.max)}.`;
    }
  }
  return caps.perWeek < caps.perDay ? 'Calls per week must be at least the calls per day.' : null;
};

function CallsForm({
  account,
  canEdit,
  canEditCaps,
}: {
  account: PublicAccount;
  canEdit: boolean;
  canEditCaps: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => draftOf(account));
  const saved = useQuery({ queryKey: settingsKeys.account, queryFn: accountApi.get });
  const save = useMutation({
    mutationFn: (d: Draft) => {
      const settings: NonNullable<AccountUpdate['settings']> = {
        callingWindow: d.callingWindow,
        recordingEnabled: d.recordingEnabled,
        recordingNotice: d.recordingNotice.trim(),
      };
      if (canEditCaps) settings.callCaps = d.callCaps;
      return accountApi.update({ settings });
    },
    meta: { silent: true },
    onSuccess: async (updated) => {
      queryClient.setQueryData(settingsKeys.account, updated);
      await reloadMe().catch(() => undefined);
      enqueueSnackbar('Call settings saved', { variant: 'success' });
    },
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(account));
  const notice = draft.recordingNotice.trim();
  const badNotice = draft.recordingEnabled && (notice.length === 0 || notice.length > NOTICE_MAX);
  const w = draft.callingWindow;
  const badWindow = w.start >= w.end || w.days.length === 0;
  const caps = capProblem(draft.callCaps);
  const warning = saved.data?.callingWindowWarning;
  const setCap = (k: keyof Draft['callCaps'], v: string) =>
    setDraft({ ...draft, callCaps: { ...draft.callCaps, [k]: v === '' ? NaN : Number(v) } });
  return (
    <Paper variant="outlined" sx={{ p: 3 }} component="section" aria-label="Call settings">
      <Stack spacing={2} sx={{ maxWidth: 720 }}>
        {!canEdit && (
          <Alert severity="info">Only the owner and admins can change call settings.</Alert>
        )}
        {save.isError && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
        <CallingWindowField
          label={`Calling window (${account.timezone})`}
          value={draft.callingWindow}
          disabled={!canEdit}
          onChange={(callingWindow) => setDraft({ ...draft, callingWindow })}
        />
        {warning && !dirty && <Alert severity="warning">{WARNING_TEXT[warning]}</Alert>}
        <Typography variant="body2" color="text.secondary">
          No call goes out of this window — campaigns can only narrow it.
        </Typography>
        <Divider />
        <Typography variant="subtitle2">How often one contact may be called</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Calls per day"
            type="number"
            value={Number.isNaN(draft.callCaps.perDay) ? '' : draft.callCaps.perDay}
            disabled={!canEditCaps}
            onChange={(e) => setCap('perDay', e.target.value)}
            slotProps={{ htmlInput: CAP_RANGES.perDay }}
          />
          <TextField
            label="Calls per week"
            type="number"
            value={Number.isNaN(draft.callCaps.perWeek) ? '' : draft.callCaps.perWeek}
            disabled={!canEditCaps}
            onChange={(e) => setCap('perWeek', e.target.value)}
            slotProps={{ htmlInput: CAP_RANGES.perWeek }}
          />
          <TextField
            label="Minutes between calls"
            type="number"
            value={Number.isNaN(draft.callCaps.minGapMinutes) ? '' : draft.callCaps.minGapMinutes}
            disabled={!canEditCaps}
            onChange={(e) => setCap('minGapMinutes', e.target.value)}
            slotProps={{ htmlInput: CAP_RANGES.minGapMinutes }}
          />
        </Stack>
        {caps ? (
          <Alert severity="error">{caps}</Alert>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {canEdit && !canEditCaps ? 'Only the owner and admins can change these limits. ' : ''}
            Campaigns and “Call now” both respect them; a contact over the limit waits for the next
            day or week.
          </Typography>
        )}
        <Divider />
        <FormControlLabel
          control={
            <Switch
              checked={draft.recordingEnabled}
              disabled={!canEdit}
              onChange={(e) => setDraft({ ...draft, recordingEnabled: e.target.checked })}
            />
          }
          label="Record calls"
        />
        <Typography variant="body2" color="text.secondary">
          Recordings are kept for the retention period (default 180 days), opened only with a
          5-minute link, and every opening is logged. Turned off, calls still keep their transcript
          and timeline.
        </Typography>
        <TextField
          label="Recording notice"
          helperText={
            badNotice
              ? `Required, at most ${String(NOTICE_MAX)} characters`
              : 'Said at the start of every recorded call, before the flow or agent speaks.'
          }
          error={badNotice}
          value={draft.recordingNotice}
          disabled={!canEdit || !draft.recordingEnabled}
          onChange={(e) => setDraft({ ...draft, recordingNotice: e.target.value })}
          multiline
          minRows={2}
          slotProps={{ htmlInput: { maxLength: NOTICE_MAX + 50 } }}
        />
        {canEdit && (
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
            <Button disabled={!dirty} onClick={() => setDraft(draftOf(account))}>
              Discard
            </Button>
            <Button
              variant="contained"
              disabled={!dirty || badNotice || badWindow || Boolean(caps) || save.isPending}
              onClick={() => save.mutate(draft)}
            >
              Save changes
            </Button>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
