import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import { useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { authApi } from '@/services/api/auth';
import { getErrorMessage } from '@/services/api/errors';

import { useSession } from './hooks';
import { endImpersonation } from './session';
import { useAuthStore } from './store';

const WARN_MS = 15 * 60_000;

const hms = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h)}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/**
 * SAC: the banner of a superadmin **Full access** session — time left, Extend (4 h steps up to
 * 12 h), Ring me too (this account's incoming calls also ring here) and Exit. A warning 15
 * minutes before the end; at the end the session returns to the admin.
 */
export function FullAccessBanner() {
  const session = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const warned = useRef(false);
  const imp = session?.impersonation;
  const end = session?.expiresAt ?? 0;
  const left = end - now;

  const exit = async () => {
    const back = imp?.returnTo ?? '/admin/accounts';
    await endImpersonation(queryClient);
    void navigate(back);
  };

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!imp || imp.mode !== 'full') return;
    if (left <= WARN_MS && left > 0 && !warned.current) {
      warned.current = true;
      enqueueSnackbar('Full access ends in 15 minutes — Extend to keep working.', {
        variant: 'warning',
      });
    }
    if (left > WARN_MS) warned.current = false;
    if (left <= 0 && end > 0) void exit();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- exit only on the clock
  }, [left, end, imp]);

  if (!session || !imp || imp.mode !== 'full') return null;
  const maxUntil = imp.maxUntil ? Date.parse(imp.maxUntil) : 0;
  const canExtend = maxUntil - end > 60_000;

  const extend = async () => {
    setBusy(true);
    try {
      const next = await authApi.extendLoginAs();
      useAuthStore.getState().setSession(next);
      enqueueSnackbar('Full access extended', { variant: 'success' });
    } catch (e) {
      enqueueSnackbar(getErrorMessage(e), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const ring = async (on: boolean) => {
    try {
      await authApi.setRingMeToo(on);
      const me = await authApi.me();
      useAuthStore.getState().setMe(me);
    } catch (e) {
      enqueueSnackbar(getErrorMessage(e), { variant: 'error' });
    }
  };

  return (
    <Alert
      severity="error"
      variant="filled"
      sx={{ mb: 2 }}
      action={
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                color="default"
                checked={Boolean(imp.ringMeToo)}
                onChange={(e) => void ring(e.target.checked)}
              />
            }
            label="Ring me too"
          />
          <Button
            color="inherit"
            size="small"
            disabled={!canExtend || busy}
            onClick={() => void extend()}
          >
            Extend
          </Button>
          <Button color="inherit" size="small" onClick={() => void exit()}>
            Exit
          </Button>
        </Stack>
      }
    >
      Superadmin full access · {session.account.name} · {hms(left)} left. You act as{' '}
      {session.user.name}; everything is recorded in the audit log.
    </Alert>
  );
}
