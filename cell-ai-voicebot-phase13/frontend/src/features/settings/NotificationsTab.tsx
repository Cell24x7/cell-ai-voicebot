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
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { useConfirm } from '@/components/confirm-context';
import { DataTable } from '@/components/DataTable';
import { usePermission, useSession } from '@/features/auth/hooks';
import { getErrorMessage } from '@/services/api/errors';
import { reportSubscriptionsApi } from '@/services/api/report-subscriptions';
import type { ReportSubscription } from '@/services/api/types';

import { settingsKeys } from './keys';
import {
  draftProblem,
  EMAIL_TABS,
  FREQUENCY_LABELS,
  hourLabel,
  REPORT_EMAILS_MAX,
  tabsLabel,
  type ReportEmailDraft,
} from './report-emails';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const NEW: ReportEmailDraft = { frequency: 'weekly', tabs: ['overview'], hour: 9 };

function ReportEmailDialog({
  initial,
  editingId,
  timezone,
  onClose,
}: {
  initial: ReportEmailDraft;
  editingId: string | null;
  timezone: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(initial);
  const [touched, setTouched] = useState(false);
  const problem = draftProblem(draft);
  const save = useMutation({
    mutationFn: () =>
      editingId
        ? reportSubscriptionsApi.update(editingId, draft)
        : reportSubscriptionsApi.create(draft),
    meta: { silent: true },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.reportEmails });
      enqueueSnackbar(editingId ? 'Report e-mail saved' : 'Report e-mail added', {
        variant: 'success',
      });
      onClose();
    },
  });
  const toggleTab = (key: ReportEmailDraft['tabs'][number], on: boolean) =>
    setDraft({
      ...draft,
      tabs: on ? [...draft.tabs, key] : draft.tabs.filter((t) => t !== key),
    });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{editingId ? 'Change report e-mail' : 'Add a report e-mail'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {save.error && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
          <TextField
            select
            label="How often"
            value={draft.frequency}
            onChange={(e) =>
              setDraft({ ...draft, frequency: e.target.value as ReportEmailDraft['frequency'] })
            }
          >
            {Object.entries(FREQUENCY_LABELS).map(([key, label]) => (
              <MenuItem key={key} value={key}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Send at"
            value={draft.hour}
            onChange={(e) => setDraft({ ...draft, hour: Number(e.target.value) })}
            helperText={`Account time (${timezone})`}
          >
            {HOURS.map((h) => (
              <MenuItem key={h} value={h}>
                {hourLabel(h)}
              </MenuItem>
            ))}
          </TextField>
          <div>
            <FormLabel component="legend">Sections</FormLabel>
            <FormGroup>
              {EMAIL_TABS.map((t) => (
                <FormControlLabel
                  key={t.key}
                  control={
                    <Checkbox
                      checked={draft.tabs.includes(t.key)}
                      onChange={(e) => {
                        setTouched(true);
                        toggleTab(t.key, e.target.checked);
                      }}
                    />
                  }
                  label={t.label}
                />
              ))}
            </FormGroup>
            {touched && problem && <FormHelperText error>{problem}</FormHelperText>}
          </div>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={Boolean(problem) || save.isPending}
          onClick={() => save.mutate()}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Settings → Notifications: e-mailed reports (each person's own; reports.read). */
export function NotificationsTab() {
  const canReports = usePermission('reports.read');
  const session = useSession();
  const readOnly = Boolean(session?.impersonation);
  const timezone = session?.account.timezone ?? 'Asia/Kolkata';
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{ id: string | null; draft: ReportEmailDraft } | null>(
    null,
  );
  const list = useQuery({
    queryKey: settingsKeys.reportEmails,
    queryFn: reportSubscriptionsApi.list,
    enabled: canReports,
    meta: { silent: true },
  });
  const done = () => void queryClient.invalidateQueries({ queryKey: settingsKeys.reportEmails });
  const pause = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      reportSubscriptionsApi.update(id, { active }),
    meta: { silent: true },
    onSuccess: done,
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => reportSubscriptionsApi.remove(id),
    meta: { silent: true },
    onSuccess: () => {
      done();
      enqueueSnackbar('Report e-mail removed', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });

  if (!canReports)
    return (
      <Alert severity="info">Your role can't see reports, so there is nothing to e-mail.</Alert>
    );
  const rows = list.data ?? [];
  const full = rows.length >= REPORT_EMAILS_MAX;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
        >
          <div>
            <Typography variant="h6" component="h2">
              Email reports
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Key numbers sent to {session?.user.email ?? 'you'}, compared with the period before.
              Numbers only — no names, phone numbers or messages.
            </Typography>
          </div>
          <Button
            variant="contained"
            disabled={readOnly || full || list.isPending}
            onClick={() => setEditing({ id: null, draft: NEW })}
          >
            Add report e-mail
          </Button>
        </Stack>
        {full && (
          <Typography variant="caption" color="text.secondary">
            You have the most report e-mails allowed ({String(REPORT_EMAILS_MAX)}). Remove one to
            add another.
          </Typography>
        )}
        <DataTable<ReportSubscription>
          aria-label="Report e-mails"
          columns={[
            { key: 'frequency', header: 'When', render: (s) => FREQUENCY_LABELS[s.frequency] },
            { key: 'hour', header: 'At', render: (s) => hourLabel(s.hour) },
            { key: 'tabs', header: 'Sections', render: (s) => tabsLabel(s.tabs) },
            {
              key: 'active',
              header: 'On',
              render: (s) => (
                <Switch
                  disabled={readOnly || pause.isPending}
                  checked={s.active}
                  onChange={(e) => pause.mutate({ id: s.id, active: e.target.checked })}
                  slotProps={{
                    input: { 'aria-label': s.active ? 'Pause this e-mail' : 'Resume this e-mail' },
                  }}
                />
              ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (s) => (
                <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                  <Button
                    size="small"
                    disabled={readOnly}
                    onClick={() =>
                      setEditing({
                        id: s.id,
                        draft: { frequency: s.frequency, tabs: [...s.tabs], hour: s.hour },
                      })
                    }
                  >
                    Change
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    disabled={readOnly || remove.isPending}
                    onClick={() =>
                      void confirm({
                        title: 'Stop this report e-mail?',
                        message: 'You can add it again any time.',
                        confirmText: 'Remove',
                        destructive: true,
                      }).then((ok) => {
                        if (ok) remove.mutate(s.id);
                      })
                    }
                  >
                    Remove
                  </Button>
                </Stack>
              ),
            },
          ]}
          rows={list.data}
          getRowId={(s) => s.id}
          loading={list.isPending}
          error={list.error}
          onRetry={() => void list.refetch()}
          emptyTitle="No report e-mails yet"
          emptyDescription="Get yesterday's, last week's or last month's numbers by e-mail."
        />
      </Stack>
      {editing && (
        <ReportEmailDialog
          initial={editing.draft}
          editingId={editing.id}
          timezone={timezone}
          onClose={() => setEditing(null)}
        />
      )}
    </Paper>
  );
}
