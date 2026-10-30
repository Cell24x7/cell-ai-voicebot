import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import { useMutation } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router';

import { AuthLayout } from '@/features/auth/AuthLayout';
import { PasswordField } from '@/features/auth/PasswordField';
import { resetSchema, type ResetValues } from '@/features/auth/schemas';
import { authApi } from '@/services/api/auth';
import { applyFieldErrors, getErrorMessage, toApiError } from '@/services/api/errors';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const form = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirm: '' },
  });
  const reset = useMutation({
    mutationFn: (v: ResetValues) => authApi.resetPassword({ token, password: v.password }),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Password changed. Please sign in.', { variant: 'success' });
      void navigate('/login', { replace: true });
    },
    onError: (error) => {
      applyFieldErrors(form.setError, error);
    },
  });
  const error = reset.error ? toApiError(reset.error) : null;
  const invalid = !token || error?.code === 'AUTH_CODE_INVALID';
  const { errors } = form.formState;

  return (
    <AuthLayout
      title="Choose a new password"
      footer={
        <Link component={RouterLink} to="/login">
          Back to sign in
        </Link>
      }
    >
      {invalid ? (
        <Stack spacing={2}>
          <Alert severity="error">This reset link is invalid or has expired.</Alert>
          <Button component={RouterLink} to="/forgot-password" variant="contained">
            Request a new link
          </Button>
        </Stack>
      ) : (
        <Stack
          component="form"
          spacing={2}
          noValidate
          onSubmit={(e) => void form.handleSubmit((v) => reset.mutate(v))(e)}
        >
          {error && error.code !== 'VALIDATION_FAILED' && (
            <Alert severity="error">{getErrorMessage(error)}</Alert>
          )}
          <PasswordField
            label="New password"
            autoComplete="new-password"
            autoFocus
            {...form.register('password')}
            error={Boolean(errors.password)}
            helperText={errors.password?.message}
          />
          <PasswordField
            label="Repeat new password"
            autoComplete="new-password"
            {...form.register('confirm')}
            error={Boolean(errors.confirm)}
            helperText={errors.confirm?.message}
          />
          <Button type="submit" variant="contained" size="large" disabled={reset.isPending}>
            Change password
          </Button>
        </Stack>
      )}
    </AuthLayout>
  );
}
