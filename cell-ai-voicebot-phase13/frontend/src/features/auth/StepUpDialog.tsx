import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';

import { authApi } from '@/services/api/auth';
import { installStepUpHandler } from '@/services/api/client';
import { getErrorMessage } from '@/services/api/errors';

import { PasswordField } from './PasswordField';
import { useStepUpStore } from './step-up-store';

/**
 * SAC: the superadmin confirms a danger action in Full access with their **own** password
 * (+ two-step code when it is on). Good for 5 minutes; the original request is retried once.
 */
export function StepUpDialog() {
  const open = useStepUpStore((s) => s.open);
  const finish = useStepUpStore((s) => s.finish);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    installStepUpHandler(() => useStepUpStore.getState().request());
    return () => installStepUpHandler(null);
  }, []);

  const close = (ok: boolean) => {
    setPassword('');
    setCode('');
    setError(null);
    finish(ok);
  };
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await authApi.stepUpLoginAs({ password, ...(code.trim() ? { code: code.trim() } : {}) });
      close(true);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => close(false)} maxWidth="xs" fullWidth>
      <DialogTitle>Confirm with your password</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            This is a big action in someone else&apos;s account. Enter <b>your own</b> superadmin
            password (and two-step code if it is on). It is good for 5 minutes.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <PasswordField
            label="Your password"
            autoComplete="current-password"
            value={password}
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
          />
          <TextField
            label="Two-step code (if on)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'one-time-code' } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => close(false)}>Cancel</Button>
        <Button variant="contained" disabled={!password || busy} onClick={() => void submit()}>
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
}
