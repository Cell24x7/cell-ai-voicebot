import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router';

import { AuthLayout } from '@/features/auth/AuthLayout';
import { PasswordField } from '@/features/auth/PasswordField';
import { loginSchema, retryText, safeNext, type LoginValues } from '@/features/auth/schemas';
import { useAuthStore } from '@/features/auth/store';
import { authApi } from '@/services/api/auth';
import { applyFieldErrors, getErrorMessage, toApiError } from '@/services/api/errors';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const login = useMutation({
    mutationFn: (values: LoginValues) => authApi.login(values),
    meta: { silent: true },
    onSuccess: (session) => {
      useAuthStore.getState().setSession(session);
      void navigate(safeNext(location.search), { replace: true });
    },
    onError: (error, values) => {
      const e = toApiError(error);
      if (e.code === 'AUTH_EMAIL_NOT_VERIFIED') {
        void navigate(`/verify-email?email=${encodeURIComponent(values.email)}`);
        return;
      }
      applyFieldErrors(form.setError, e);
    },
  });

  const error = login.error ? toApiError(login.error) : null;
  const message =
    error?.code === 'AUTH_TOO_MANY_ATTEMPTS'
      ? `Too many failed sign-ins. ${retryText(error.retryAfterSec)}`
      : error && error.code !== 'AUTH_EMAIL_NOT_VERIFIED'
        ? getErrorMessage(error)
        : null;

  return (
    <AuthLayout
      title="Sign in"
      footer={
        <>
          New here?{' '}
          <Link component={RouterLink} to="/signup">
            Create an account
          </Link>
        </>
      }
    >
      <Stack
        component="form"
        spacing={2}
        noValidate
        onSubmit={(e) => void form.handleSubmit((values) => login.mutate(values))(e)}
      >
        {message && <Alert severity="error">{message}</Alert>}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          {...form.register('email')}
          error={Boolean(form.formState.errors.email)}
          helperText={form.formState.errors.email?.message}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          {...form.register('password')}
          error={Boolean(form.formState.errors.password)}
          helperText={form.formState.errors.password?.message}
        />
        <Link
          component={RouterLink}
          to="/forgot-password"
          variant="body2"
          sx={{ alignSelf: 'flex-end' }}
        >
          Forgot password?
        </Link>
        <Button type="submit" variant="contained" size="large" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </Stack>
    </AuthLayout>
  );
}
