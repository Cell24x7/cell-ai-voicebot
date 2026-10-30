import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router';

import { AuthLayout } from '@/features/auth/AuthLayout';
import { PasswordField } from '@/features/auth/PasswordField';
import { acceptInviteSchema, type AcceptInviteValues } from '@/features/auth/schemas';
import { useAuthStore } from '@/features/auth/store';
import { authApi } from '@/services/api/auth';
import { applyFieldErrors, getErrorMessage, toApiError } from '@/services/api/errors';

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const info = useQuery({
    queryKey: ['auth', 'invite', token],
    queryFn: () => authApi.inviteInfo(token),
    enabled: Boolean(token),
    retry: false,
    meta: { silent: true },
  });
  const form = useForm<AcceptInviteValues>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: { name: '', password: '', confirm: '' },
  });
  useEffect(() => {
    if (info.data) form.setValue('name', info.data.name);
  }, [info.data, form]);

  const accept = useMutation({
    mutationFn: (v: AcceptInviteValues) =>
      authApi.acceptInvite({ token, password: v.password, name: v.name }),
    meta: { silent: true },
    onSuccess: (session) => {
      useAuthStore.getState().setSession(session);
      void navigate('/', { replace: true });
    },
    onError: (error) => {
      applyFieldErrors(form.setError, error);
    },
  });

  const invalid = !token || info.isError || toApiError(accept.error).code === 'AUTH_CODE_INVALID';
  const { errors } = form.formState;

  if (invalid) {
    return (
      <AuthLayout title="Invitation not valid">
        <Stack spacing={2}>
          <Alert severity="error">
            This invitation link is invalid, already used or expired. Ask your admin to send a new
            one.
          </Alert>
          <Button component={RouterLink} to="/login" variant="contained">
            Go to sign in
          </Button>
        </Stack>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Join your team"
      subtitle={
        info.data ? (
          <>
            {info.data.inviterName} invited <strong>{info.data.email}</strong> to{' '}
            <strong>{info.data.accountName}</strong> as {info.data.roleName}.
          </>
        ) : (
          <Skeleton width="80%" />
        )
      }
    >
      <Stack
        component="form"
        spacing={2}
        noValidate
        onSubmit={(e) => void form.handleSubmit((v) => accept.mutate(v))(e)}
      >
        {accept.error && toApiError(accept.error).code !== 'VALIDATION_FAILED' && (
          <Alert severity="error">{getErrorMessage(accept.error)}</Alert>
        )}
        <TextField
          label="Your name"
          autoComplete="name"
          {...form.register('name')}
          error={Boolean(errors.name)}
          helperText={errors.name?.message}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          {...form.register('password')}
          error={Boolean(errors.password)}
          helperText={errors.password?.message}
        />
        <PasswordField
          label="Repeat password"
          autoComplete="new-password"
          {...form.register('confirm')}
          error={Boolean(errors.confirm)}
          helperText={errors.confirm?.message}
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={accept.isPending || !info.data}
        >
          Accept invitation
        </Button>
      </Stack>
    </AuthLayout>
  );
}
