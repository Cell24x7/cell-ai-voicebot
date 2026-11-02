import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { useCan, useSession } from '@/features/auth/hooks';
import { reloadMe } from '@/features/auth/session';
import { accountApi } from '@/services/api/account';
import { getErrorMessage } from '@/services/api/errors';
import { formatDateOnly } from '@/utils/format';

const EXPORTS_KEY = ['account-exports'];

function ExportDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [recordings, setRecordings] = useState(false);
  const start = useMutation({
    mutationFn: () => accountApi.startExport({ password, includeRecordings: recordings }),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar("Export started. We'll e-mail you when it's ready.", { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: EXPORTS_KEY });
      onClose();
    },
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="export-title">
      <DialogTitle id="export-title">Export all data</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          You get one zip file with contacts, calls, chats and settings. It includes sensitive
          fields, so keep it safe. Secrets and passwords are left out.
        </DialogContentText>
        <Stack spacing={2}>
          {start.error && <Alert severity="error">{getErrorMessage(start.error)}</Alert>}
          <TextField
            label="Your password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FormControlLabel
            control={
              <Checkbox checked={recordings} onChange={(e) => setRecordings(e.target.checked)} />
            }
            label="Include call recordings (a much larger file)"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!password || start.isPending}
          onClick={() => start.mutate()}
        >
          Start export
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DeleteDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const remove = useMutation({
    mutationFn: () => accountApi.scheduleDelete({ password, confirmName: typed }),
    meta: { silent: true },
    onSuccess: async () => {
      enqueueSnackbar('Your account will be deleted in 7 days', { variant: 'warning' });
      await reloadMe();
      onClose();
    },
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="delete-account-title">
      <DialogTitle id="delete-account-title">Delete this account?</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          All data is permanently deleted after 7 days, and you can cancel until then. Campaigns
          pause and webhooks stop now. API keys are revoked now and stay revoked even if you cancel.
          Export your data first. Invoices and payment records are kept, as the law requires.
        </DialogContentText>
        <Stack spacing={2}>
          {remove.error && <Alert severity="error">{getErrorMessage(remove.error)}</Alert>}
          <TextField
            label={`Type "${name}" to confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <TextField
            label="Your password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Keep account</Button>
        <Button
          variant="contained"
          color="error"
          disabled={typed !== name || !password || remove.isPending}
          onClick={() => remove.mutate()}
        >
          Delete account
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Settings → Account: the owner's whole-account export and deletion. */
export function DataRightsSection() {
  const can = useCan();
  const session = useSession();
  const [dialog, setDialog] = useState<'export' | 'delete' | null>(null);
  const canExport = can('account.export') && !session?.impersonation;
  const canDelete = can('account.delete') && !session?.impersonation;
  const exports = useQuery({
    queryKey: EXPORTS_KEY,
    queryFn: () => accountApi.exports(),
    enabled: canExport,
    meta: { silent: true },
    refetchInterval: (query) =>
      query.state.data?.some((e) => e.status === 'queued' || e.status === 'running')
        ? 5_000
        : false,
  });
  const download = useMutation({
    mutationFn: (id: string) => accountApi.exportDetail(id),
    meta: { silent: true },
    onSuccess: (detail) => {
      if (detail.url) window.location.assign(detail.url);
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  const cancel = useMutation({
    mutationFn: () => accountApi.cancelDelete(),
    meta: { silent: true },
    onSuccess: async () => {
      enqueueSnackbar('Deletion canceled', { variant: 'success' });
      await reloadMe();
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  if (!canExport && !canDelete) return null;
  const deletion = session?.account.deletion;
  const latest = exports.data?.[0];
  const busy = latest?.status === 'queued' || latest?.status === 'running';
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Typography variant="h6">Your data</Typography>
        {deletion && (
          <Alert
            severity="warning"
            action={
              <Button color="inherit" size="small" onClick={() => cancel.mutate()}>
                Cancel deletion
              </Button>
            }
          >
            This account will be deleted on {formatDateOnly(deletion.scheduledFor.slice(0, 10))}.
          </Alert>
        )}
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          {canExport && (
            <Button variant="outlined" disabled={busy} onClick={() => setDialog('export')}>
              {busy ? 'Export running…' : 'Export all data'}
            </Button>
          )}
          {latest?.status === 'ready' && (
            <Button onClick={() => download.mutate(latest.id)} disabled={download.isPending}>
              Download latest export
            </Button>
          )}
          {canDelete && !deletion && (
            <Button color="error" variant="outlined" onClick={() => setDialog('delete')}>
              Delete account
            </Button>
          )}
        </Stack>
        {latest?.status === 'failed' && (
          <Alert severity="error">The last export could not be finished. Try again.</Alert>
        )}
      </Stack>
      {dialog === 'export' && <ExportDialog onClose={() => setDialog(null)} />}
      {dialog === 'delete' && session && (
        <DeleteDialog name={session.account.name} onClose={() => setDialog(null)} />
      )}
    </Paper>
  );
}
