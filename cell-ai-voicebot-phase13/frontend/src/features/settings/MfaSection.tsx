import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { useIsPlatformAdmin } from '@/features/auth/hooks';
import { authApi } from '@/services/api/auth';
import { getErrorMessage } from '@/services/api/errors';

const MFA_STATUS_KEY = ['auth', 'mfa-status'];
const VERIFIED_FLAG = 'cav-mfa-verified';

const readFlag = (): boolean => {
  try {
    return sessionStorage.getItem(VERIFIED_FLAG) === '1';
  } catch {
    return false;
  }
};
const writeFlag = () => {
  try {
    sessionStorage.setItem(VERIFIED_FLAG, '1');
  } catch {
    // private window: the prompt simply comes back next time
  }
};

/**
 * After sign-in, a superadmin with two-step sign-in is asked for a code. The server enforces it on
 * big actions, so "Later" only postpones the prompt.
 */
export function MfaPrompt() {
  const isSuperadmin = useIsPlatformAdmin();
  const [dismissed, setDismissed] = useState(readFlag);
  const [code, setCode] = useState('');
  const status = useQuery({
    queryKey: MFA_STATUS_KEY,
    queryFn: () => authApi.mfaStatus(),
    enabled: isSuperadmin && !dismissed,
    meta: { silent: true },
  });
  const verify = useMutation({
    mutationFn: () => authApi.mfaVerify(code.trim()),
    meta: { silent: true },
    onSuccess: () => {
      writeFlag();
      setDismissed(true);
    },
  });
  if (dismissed || !status.data?.enabled || !status.data.enforced) return null;
  return (
    <Dialog open fullWidth maxWidth="xs" aria-labelledby="mfa-prompt-title">
      <DialogTitle id="mfa-prompt-title">Enter your two-step code</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {verify.error && <Alert severity="error">{getErrorMessage(verify.error)}</Alert>}
          <TextField
            label="Code from your app, or a recovery code"
            autoFocus
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setDismissed(true)}>Later</Button>
        <Button
          variant="contained"
          disabled={code.trim().length < 6 || verify.isPending}
          onClick={() => verify.mutate()}
        >
          Continue
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SetupDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const setup = useQuery({
    queryKey: ['auth', 'mfa-setup'],
    queryFn: () => authApi.mfaSetup(),
    gcTime: 0,
    staleTime: Infinity,
    meta: { silent: true },
  });
  const confirm = useMutation({
    mutationFn: () => authApi.mfaConfirm(code.trim()),
    meta: { silent: true },
    onSuccess: (data) => {
      setRecovery(data.recoveryCodes);
      void queryClient.invalidateQueries({ queryKey: MFA_STATUS_KEY });
    },
  });
  if (recovery) {
    return (
      <Dialog open fullWidth maxWidth="xs" aria-labelledby="mfa-recovery-title">
        <DialogTitle id="mfa-recovery-title">Save your recovery codes</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Each works once if you lose your phone. They won&apos;t be shown again.
          </DialogContentText>
          <Typography component="pre" sx={{ fontFamily: 'monospace', m: 0 }}>
            {recovery.join('\n')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => void navigator.clipboard.writeText(recovery.join('\n'))}>
            Copy
          </Button>
          <Button variant="contained" onClick={onClose}>
            I saved them
          </Button>
        </DialogActions>
      </Dialog>
    );
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="mfa-setup-title">
      <DialogTitle id="mfa-setup-title">Set up two-step sign-in</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {(setup.error ?? confirm.error) && (
            <Alert severity="error">{getErrorMessage(setup.error ?? confirm.error)}</Alert>
          )}
          <DialogContentText>
            Add this key to an authenticator app, then enter the 6-digit code it shows.
          </DialogContentText>
          <TextField
            label="Setup key"
            value={setup.data?.secret ?? ''}
            slotProps={{ input: { readOnly: true } }}
          />
          {setup.data && <Button href={setup.data.otpauthUrl}>Open in authenticator app</Button>}
          <TextField
            label="6-digit code"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!/^\d{6}$/.test(code.trim()) || confirm.isPending}
          onClick={() => confirm.mutate()}
        >
          Turn on
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DisableDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const disable = useMutation({
    mutationFn: () => authApi.mfaDisable({ password, code: code.trim() }),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Two-step sign-in is off', { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: MFA_STATUS_KEY });
      onClose();
    },
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="mfa-disable-title">
      <DialogTitle id="mfa-disable-title">Turn off two-step sign-in?</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {disable.error && <Alert severity="error">{getErrorMessage(disable.error)}</Alert>}
          <TextField
            label="Your password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <TextField
            label="Code from your app, or a recovery code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          color="error"
          variant="contained"
          disabled={!password || code.trim().length < 6 || disable.isPending}
          onClick={() => disable.mutate()}
        >
          Turn off
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Settings → Security, for a superadmin. */
export function MfaSection() {
  const isSuperadmin = useIsPlatformAdmin();
  const [dialog, setDialog] = useState<'setup' | 'disable' | null>(null);
  const status = useQuery({
    queryKey: MFA_STATUS_KEY,
    queryFn: () => authApi.mfaStatus(),
    enabled: isSuperadmin,
    meta: { silent: true },
  });
  if (!isSuperadmin || !status.data) return null;
  const { enabled, enforced } = status.data;
  return (
    <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
      <Typography variant="h6">Two-step sign-in</Typography>
      <Typography variant="body2" color="text.secondary">
        {enabled
          ? 'On. Impersonating, adding an account and deleting one can ask for a code.'
          : 'Off. Protect this superadmin login with a code from an authenticator app.'}
      </Typography>
      {enforced && !enabled && (
        <Alert severity="warning">This platform requires it. Set it up now.</Alert>
      )}
      <Button
        variant="outlined"
        color={enabled ? 'error' : 'primary'}
        onClick={() => setDialog(enabled ? 'disable' : 'setup')}
      >
        {enabled ? 'Turn off' : 'Set up'}
      </Button>
      {dialog === 'setup' && <SetupDialog onClose={() => setDialog(null)} />}
      {dialog === 'disable' && <DisableDialog onClose={() => setDialog(null)} />}
    </Stack>
  );
}
