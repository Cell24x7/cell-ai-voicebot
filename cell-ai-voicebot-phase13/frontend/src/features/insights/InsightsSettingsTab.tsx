import AddOutlined from '@mui/icons-material/AddOutlined';
import ArrowDownwardOutlined from '@mui/icons-material/ArrowDownwardOutlined';
import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { usePermission, useSession } from '@/features/auth/hooks';
import { getErrorMessage } from '@/services/api/errors';
import { insightsApi } from '@/services/api/insights';
import type { AccountDisposition, InsightsSettings } from '@/services/api/types';

import { insightKeys } from './keys';
import { keyFromLabel } from './labels';
import { useDispositions, useInsightsSettings } from './queries';

const MAX = 30;
const LABEL_MAX = 40;

function Switches({ settings, canEdit }: { settings: InsightsSettings; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (body: Partial<InsightsSettings>) => insightsApi.updateSettings(body),
    meta: { silent: true },
    onSuccess: (next) => {
      queryClient.setQueryData(insightKeys.settings, next);
      enqueueSnackbar('Saved', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  const rows: [keyof InsightsSettings, string, string][] = [
    [
      'enabled',
      'AI insights after calls',
      'A summary, the outcome, the customer’s mood and key facts for every answered call. Uses AI credit.',
    ],
    [
      'transcribeHumanCalls',
      'Transcribe team calls',
      'Recorded WhatsApp calls answered by a team member are turned into text first, so they get insights too. Charged per minute.',
    ],
    [
      'chatSummaryOnClose',
      'Summarise chats when they are closed',
      'A short summary of the new messages each time a WhatsApp chat is closed. Uses AI credit.',
    ],
  ];
  return (
    <Stack spacing={1.5}>
      {rows.map(([key, label, help]) => (
        <Stack key={key}>
          <FormControlLabel
            control={
              <Switch
                checked={settings[key]}
                disabled={!canEdit || save.isPending || (key !== 'enabled' && !settings.enabled)}
                onChange={(e) => save.mutate({ [key]: e.target.checked })}
              />
            }
            label={label}
          />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 6 }}>
            {help}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

function OutcomesEditor({ initial, canEdit }: { initial: AccountDisposition[]; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [list, setList] = useState(initial);
  const [draft, setDraft] = useState('');
  const save = useMutation({
    mutationFn: () => insightsApi.updateDispositions(list),
    meta: { silent: true },
    onSuccess: (next) => {
      queryClient.setQueryData(insightKeys.dispositions, next);
      setList(next.dispositions);
      enqueueSnackbar('Call outcomes saved', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  const update = (i: number, patch: Partial<AccountDisposition>) =>
    setList((l) => l.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const move = (i: number, by: number) =>
    setList((l) => {
      const next = [...l];
      const [item] = next.splice(i, 1);
      if (item) next.splice(i + by, 0, item);
      return next;
    });
  const emptyLabel = list.some((d) => !d.label.trim());
  const changed = JSON.stringify(list) !== JSON.stringify(initial);
  const add = () => {
    const label = draft.trim();
    if (!label) return;
    setList((l) => [
      ...l,
      {
        key: keyFromLabel(
          label,
          l.map((d) => d.key),
        ),
        label,
        active: true,
      },
    ]);
    setDraft('');
  };
  return (
    <Stack spacing={1}>
      {list.map((d, i) => (
        <Stack key={d.key} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <TextField
            size="small"
            label={`Outcome ${String(i + 1)}`}
            value={d.label}
            disabled={!canEdit}
            onChange={(e) => update(i, { label: e.target.value })}
            error={!d.label.trim()}
            helperText={d.label.trim() ? undefined : 'Give it a name'}
            slotProps={{ htmlInput: { maxLength: LABEL_MAX } }}
            sx={{ flex: 1 }}
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={d.active}
                disabled={!canEdit}
                onChange={(e) => update(i, { active: e.target.checked })}
              />
            }
            label={d.active ? 'On' : 'Off'}
          />
          {canEdit && (
            <>
              <IconButton
                size="small"
                aria-label={`Move ${d.label || 'outcome'} up`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUpwardOutlined fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                aria-label={`Move ${d.label || 'outcome'} down`}
                disabled={i === list.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDownwardOutlined fontSize="small" />
              </IconButton>
            </>
          )}
        </Stack>
      ))}
      {canEdit && (
        <>
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              label="New outcome"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={list.length >= MAX}
              helperText={list.length >= MAX ? `At most ${String(MAX)} outcomes` : undefined}
              slotProps={{ htmlInput: { maxLength: LABEL_MAX } }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add();
              }}
            />
            <Button
              startIcon={<AddOutlined />}
              onClick={add}
              disabled={!draft.trim() || list.length >= MAX}
            >
              Add
            </Button>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              onClick={() => save.mutate()}
              disabled={!changed || emptyLabel || save.isPending}
            >
              Save outcomes
            </Button>
            <Button onClick={() => setList(initial)} disabled={!changed || save.isPending}>
              Undo changes
            </Button>
          </Stack>
        </>
      )}
    </Stack>
  );
}

/** Settings → AI & outcomes (Phase 14). */
export function InsightsSettingsTab() {
  const session = useSession();
  const canUpdate = usePermission('account.update');
  const settings = useInsightsSettings();
  const dispositions = useDispositions();
  const canEdit = canUpdate && session?.account.status !== 'suspended' && !session?.impersonation;
  return (
    <Stack spacing={3}>
      <Paper
        variant="outlined"
        sx={{ p: 2 }}
        component="section"
        aria-label="AI after calls and chats"
      >
        <Typography variant="h6" component="h2" gutterBottom>
          AI after calls and chats
        </Typography>
        {settings.isPending && <Skeleton variant="rounded" height={120} />}
        {settings.isError && <Alert severity="error">{getErrorMessage(settings.error)}</Alert>}
        {settings.data && <Switches settings={settings.data} canEdit={canEdit} />}
      </Paper>
      <Paper variant="outlined" sx={{ p: 2 }} component="section" aria-label="Call outcomes">
        <Typography variant="h6" component="h2" gutterBottom>
          Call outcomes
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          What a call ended with. The AI picks one of the outcomes that are on; your team can change
          it on the call page. Outcomes used by calls can be turned off but not removed.
        </Typography>
        {dispositions.isPending && <Skeleton variant="rounded" height={160} />}
        {dispositions.isError && (
          <Alert severity="error">{getErrorMessage(dispositions.error)}</Alert>
        )}
        {dispositions.data && (
          <OutcomesEditor
            key={JSON.stringify(dispositions.data)}
            initial={dispositions.data}
            canEdit={canEdit}
          />
        )}
      </Paper>
    </Stack>
  );
}
