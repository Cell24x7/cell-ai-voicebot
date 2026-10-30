import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { usePermission, useSession } from '@/features/auth/hooks';
import { NOTIFY_MODE_LABELS } from '@/features/inbox/labels';
import { useInboxConfig, useInboxSettings, useUpdateInboxSettings } from '@/features/inbox/queries';
import { getErrorMessage } from '@/services/api/errors';
import type { InboxSettingsPatch } from '@/services/api/inbox';
import type { InboxNotifyMode, InboxSettings } from '@/services/api/types';

import { addKeyword, KEYWORDS_MAX, REPLY_TEXT_MAX, retentionText } from './inbox-settings';

type Draft = Required<InboxSettingsPatch>;
const draftOf = (s: InboxSettings): Draft => ({
  sendReadReceipts: s.sendReadReceipts,
  optOutKeywords: [...s.optOutKeywords],
  optInKeywords: [...s.optInKeywords],
  optOutReply: s.optOutReply,
  optOutReplyText: s.optOutReplyText,
  optInReply: s.optInReply,
  optInReplyText: s.optInReplyText,
  notifyOnNewMessage: s.notifyOnNewMessage,
});

/** Settings → Inbox (account.read; account.update edits). */
export function InboxSettingsTab() {
  const session = useSession();
  const canUpdate = usePermission('account.update');
  const settings = useInboxSettings();
  const config = useInboxConfig();
  const canEdit = canUpdate && session?.account.status === 'active' && !session.impersonation;
  if (settings.isPending) return <Skeleton variant="rounded" height={320} />;
  if (settings.isError) return <Alert severity="error">{getErrorMessage(settings.error)}</Alert>;
  return (
    <InboxSettingsForm
      key={JSON.stringify(draftOf(settings.data))}
      settings={settings.data}
      retentionDays={config.data?.retentionDays ?? settings.data.retentionDays}
      canEdit={canEdit}
    />
  );
}

function KeywordChips({
  label,
  help,
  values,
  other,
  disabled,
  onChange,
}: {
  label: string;
  help: string;
  values: string[];
  /** The other list: a keyword can't be in both. */
  other: string[];
  disabled: boolean;
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const add = () => {
    const r = addKeyword(values, other, input);
    setProblem(r.error);
    if (!r.error) {
      onChange(r.keywords);
      setInput('');
    }
  };
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">{label}</Typography>
      <Typography variant="body2" color="text.secondary">
        {help}
      </Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }} aria-label={label} role="list">
        {values.map((k) => (
          <Chip
            key={k}
            role="listitem"
            label={k}
            onDelete={disabled ? undefined : () => onChange(values.filter((v) => v !== k))}
          />
        ))}
      </Stack>
      {!disabled && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <TextField
            size="small"
            label={`Add to ${label.toLowerCase()}`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            error={Boolean(problem)}
            helperText={problem ?? `${String(values.length)} / ${String(KEYWORDS_MAX)}`}
          />
          <Button onClick={add} disabled={!input.trim()}>
            Add
          </Button>
        </Stack>
      )}
    </Stack>
  );
}

function InboxSettingsForm({
  settings,
  retentionDays,
  canEdit,
}: {
  settings: InboxSettings;
  retentionDays: number;
  canEdit: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(settings));
  const save = useUpdateInboxSettings();
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(settings));
  const invalid =
    draft.optOutKeywords.length === 0 ||
    (draft.optOutReply && !draft.optOutReplyText.trim()) ||
    (draft.optInReply && !draft.optInReplyText.trim());

  return (
    <Paper variant="outlined" sx={{ p: 3 }} component="section" aria-label="Inbox settings">
      <Stack spacing={3}>
        {!canEdit && (
          <Alert severity="info">Only owners and admins can change these settings.</Alert>
        )}
        <FormControlLabel
          control={
            <Switch
              checked={draft.sendReadReceipts}
              disabled={!canEdit}
              onChange={(e) => set({ sendReadReceipts: e.target.checked })}
            />
          }
          label="Send read receipts (blue ticks) when an agent opens a chat"
        />
        <Divider />
        <KeywordChips
          label="Opt-out keywords"
          help="A customer message that is exactly one of these opts them out of marketing (DND). Not case-sensitive."
          values={draft.optOutKeywords}
          other={draft.optInKeywords}
          disabled={!canEdit}
          onChange={(optOutKeywords) => set({ optOutKeywords })}
        />
        {draft.optOutKeywords.length === 0 && (
          <Alert severity="warning">Keep at least one opt-out keyword.</Alert>
        )}
        <FormControlLabel
          control={
            <Switch
              checked={draft.optOutReply}
              disabled={!canEdit}
              onChange={(e) => set({ optOutReply: e.target.checked })}
            />
          }
          label="Confirm opt-outs with an automatic reply"
        />
        {draft.optOutReply && (
          <TextField
            label="Opt-out reply"
            multiline
            minRows={2}
            disabled={!canEdit}
            value={draft.optOutReplyText}
            onChange={(e) => set({ optOutReplyText: e.target.value })}
            error={!draft.optOutReplyText.trim()}
            helperText={`${String(draft.optOutReplyText.length)} / ${String(REPLY_TEXT_MAX)}`}
            slotProps={{ htmlInput: { maxLength: REPLY_TEXT_MAX } }}
          />
        )}
        <Divider />
        <KeywordChips
          label="Opt-in keywords"
          help="A customer who opted out can opt in again by sending one of these."
          values={draft.optInKeywords}
          other={draft.optOutKeywords}
          disabled={!canEdit}
          onChange={(optInKeywords) => set({ optInKeywords })}
        />
        <FormControlLabel
          control={
            <Switch
              checked={draft.optInReply}
              disabled={!canEdit}
              onChange={(e) => set({ optInReply: e.target.checked })}
            />
          }
          label="Confirm opt-ins with an automatic reply"
        />
        {draft.optInReply && (
          <TextField
            label="Opt-in reply"
            multiline
            minRows={2}
            disabled={!canEdit}
            value={draft.optInReplyText}
            onChange={(e) => set({ optInReplyText: e.target.value })}
            error={!draft.optInReplyText.trim()}
            helperText={`${String(draft.optInReplyText.length)} / ${String(REPLY_TEXT_MAX)}`}
            slotProps={{ htmlInput: { maxLength: REPLY_TEXT_MAX } }}
          />
        )}
        <Divider />
        <TextField
          select
          label="New message notifications"
          disabled={!canEdit}
          value={draft.notifyOnNewMessage}
          onChange={(e) => set({ notifyOnNewMessage: e.target.value as InboxNotifyMode })}
          helperText="The bell shows the contact's name and a link — never the message text."
        >
          {(Object.keys(NOTIFY_MODE_LABELS) as InboxNotifyMode[]).map((mode) => (
            <MenuItem key={mode} value={mode}>
              {NOTIFY_MODE_LABELS[mode]}
            </MenuItem>
          ))}
        </TextField>
        <Typography variant="body2" color="text.secondary">
          {retentionText(retentionDays)}
        </Typography>
        {save.isError && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
        {canEdit && (
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              disabled={!dirty || Boolean(invalid) || save.isPending}
              onClick={() =>
                save.mutate(draft, {
                  onSuccess: () => enqueueSnackbar('Inbox settings saved', { variant: 'success' }),
                })
              }
            >
              Save
            </Button>
            <Button disabled={!dirty} onClick={() => setDraft(draftOf(settings))}>
              Discard changes
            </Button>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
