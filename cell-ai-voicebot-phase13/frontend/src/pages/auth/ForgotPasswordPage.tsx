import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link as RouterLink } from 'react-router';

import { AuthLayout } from '@/features/auth/AuthLayout';
import { forgotSchema, type ForgotValues } from '@/features/auth/schemas';
import { authApi } from '@/services/api/auth';
import { getErrorMessage } from '@/services/api/errors';

export function ForgotPasswordPage() {
  const form = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });
  const forgot = useMutation({
    mutationFn: (v: ForgotValues) => authApi.forgotPassword(v.email),
    meta: { silent: true },
  });

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link."
      footer={
        <Link component={RouterLink} to="/login">
          Back to sign in
        </Link>
      }
    >
      {forgot.isSuccess ? (
        <Alert severity="success">
          If an account exists for this email, we sent a reset link. It expires in 30 minutes.
        </Alert>
      ) : (
        <Stack
          component="form"
          spacing={2}
          noValidate
          onSubmit={(e) => void form.handleSubmit((v) => forgot.mutate(v))(e)}
        >
          {forgot.error && <Alert severity="error">{getErrorMessage(forgot.error)}</Alert>}
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            autoFocus
            {...form.register('email')}
            error={Boolean(form.formState.errors.email)}
            helperText={form.formState.errors.email?.message}
          />
          <Button type="submit" variant="contained" size="large" disabled={forgot.isPending}>
            Send reset link
          </Button>
        </Stack>
      )}
    </AuthLayout>
  );
}
