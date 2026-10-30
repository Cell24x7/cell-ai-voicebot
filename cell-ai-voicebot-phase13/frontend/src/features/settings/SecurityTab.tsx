import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { useConfirm } from '@/components/confirm-context';
import { DataTable } from '@/components/DataTable';
import { RelativeTime } from '@/components/RelativeTime';
import { useSession } from '@/features/auth/hooks';
import { PasswordField } from '@/features/auth/PasswordField';
import { PASSWORD_MIN } from '@/features/auth/schemas';
import { useAuthStore } from '@/features/auth/store';
import { authApi } from '@/services/api/auth';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import type { Session } from '@/services/api/types';

import { settingsKeys } from './keys';

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const change = useMutation({
    mutationFn: () => authApi.changePassword({ currentPassword: current, newPassword: next }),
    meta: { silent: true },
    onSuccess: (session) => {
      useAuthStore.getState().setSession(session);
      setCurrent('');
      setNext('');
      setRepeat('');
      enqueueSnackbar('Password changed. Your other sessions were signed out.', {
        variant: 'success',
      });
    },
  });
  const error = change.error ? toApiError(change.error) : null;
  const mismatch = repeat !== '' && repeat !== next;
  return (
    <Stack spacing={2} sx={{ maxWidth: 420 }}>
      <Typography variant="subtitle1">Change password</Typography>
      {error && (
        <Alert severity="error">{error.details[0]?.message ?? getErrorMessage(error)}</Alert>
      )}
      <PasswordField
        label="Current password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <PasswordField
        label="New password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        helperText={`At least ${PASSWORD_MIN} characters.`}
      />
      <PasswordField
        label="Repeat new password"
        autoComplete="new-password"
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
        error={mismatch}
        helperText={mismatch ? 'Passwords do not match' : ' '}
      />
      <Button
        variant="contained"
        sx={{ alignSelf: 'flex-start' }}
        disabled={!current || next.length < PASSWORD_MIN || next !== repeat || change.isPending}
        onClick={() => change.mutate()}
      >
        Change password
      </Button>
    </Stack>
  );
}

function Sessions() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const sessions = useQuery({
    queryKey: settingsKeys.sessions,
    queryFn: authApi.sessions,
    meta: { silent: true },
  });
  const revoke = useMutation({
    mutationFn: (s: Session) => authApi.revokeSession(s.id),
    meta: { silent: true },
    onSuccess: (_d, s) => {
      if (s.current) {
        useAuthStore.getState().setAnonymous();
        queryClient.clear();
        void navigate('/login');
        return;
      }
      void queryClient.invalidateQueries({ queryKey: settingsKeys.sessions });
      enqueueSnackbar('Session signed out', { variant: 'success' });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: 'error' }),
  });
  const logoutAll = async () => {
    const ok = await confirm({
      title: 'Sign out everywhere?',
      message: 'Every session ends, including this one.',
      confirmText: 'Sign out everywhere',
      destructive: true,
    });
    if (!ok) return;
    await authApi.logoutAll();
    useAuthStore.getState().setAnonymous();
    queryClient.clear();
    void navigate('/login');
  };
  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="subtitle1">Active sessions</Typography>
        <Button color="error" onClick={() => void logoutAll()}>
          Sign out everywhere
        </Button>
      </Stack>
      <DataTable
        aria-label="Sessions"
        columns={[
          {
            key: 'device',
            header: 'Device',
            render: (s) => (
              <>
                {s.userAgent ?? 'Unknown device'}{' '}
                {s.current && <Chip size="small" label="This session" sx={{ ml: 1 }} />}
              </>
            ),
          },
          { key: 'ip', header: 'IP', render: (s) => s.ip ?? '—' },
          {
            key: 'started',
            header: 'Signed in',
            render: (s) => <RelativeTime value={s.createdAt} />,
          },
          {
            key: 'used',
            header: 'Last active',
            render: (s) => <RelativeTime value={s.lastUsedAt} />,
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (s) => (
              <Button size="small" onClick={() => revoke.mutate(s)}>
                Sign out
              </Button>
            ),
          },
        ]}
        rows={sessions.data}
        getRowId={(s) => s.id}
        loading={sessions.isPending}
        error={sessions.error}
        onRetry={() => void sessions.refetch()}
      />
    </Stack>
  );
}

export function SecurityTab() {
  const session = useSession();
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={4}>
        {session?.impersonation ? (
          <Alert severity="info">
            Password changes are not available while viewing as another user.
          </Alert>
        ) : (
          <ChangePassword />
        )}
        {!session?.impersonation && <Sessions />}
      </Stack>
    </Paper>
  );
}
