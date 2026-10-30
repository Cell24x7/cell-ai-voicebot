import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useNavigate } from 'react-router';

import { AuthLayout } from '@/features/auth/AuthLayout';
import { PasswordField } from '@/features/auth/PasswordField';
import { PASSWORD_MIN, signupSchema, type SignupValues } from '@/features/auth/schemas';
import { authApi } from '@/services/api/auth';
import { applyFieldErrors, getErrorMessage } from '@/services/api/errors';
import { browserTimezone } from '@/utils/timezone';

export function SignupPage() {
  const navigate = useNavigate();
  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      businessName: '',
      name: '',
      email: '',
      password: '',
      phone: '',
      timezone: browserTimezone(),
    },
  });
  const signup = useMutation({
    mutationFn: (v: SignupValues) =>
      authApi.signup({ ...v, phone: v.phone === '' ? undefined : v.phone }),
    meta: { silent: true },
    onSuccess: (_data, v) =>
      void navigate(`/verify-email?email=${encodeURIComponent(v.email.trim())}`),
    onError: (error) => {
      applyFieldErrors(form.setError, error);
    },
  });
  const { errors } = form.formState;
  const generalError =
    signup.error && !Object.keys(errors).length ? getErrorMessage(signup.error) : null;

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start running AI voice campaigns for your business."
      footer={
        <>
          Already have an account?{' '}
          <Link component={RouterLink} to="/login">
            Sign in
          </Link>
        </>
      }
    >
      <Stack
        component="form"
        spacing={2}
        noValidate
        onSubmit={(e) => void form.handleSubmit((v) => signup.mutate(v))(e)}
      >
        {generalError && <Alert severity="error">{generalError}</Alert>}
        <TextField
          label="Business name"
          autoComplete="organization"
          autoFocus
          {...form.register('businessName')}
          error={Boolean(errors.businessName)}
          helperText={errors.businessName?.message}
        />
        <TextField
          label="Your name"
          autoComplete="name"
          {...form.register('name')}
          error={Boolean(errors.name)}
          helperText={errors.name?.message}
        />
        <TextField
          label="Work email"
          type="email"
          autoComplete="email"
          {...form.register('email')}
          error={Boolean(errors.email)}
          helperText={errors.email?.message}
        />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          {...form.register('password')}
          error={Boolean(errors.password)}
          helperText={
            errors.password?.message ??
            `At least ${PASSWORD_MIN} characters. Avoid common passwords and your email.`
          }
        />
        <TextField
          label="Phone (optional)"
          autoComplete="tel"
          placeholder="+919876543210"
          {...form.register('phone')}
          error={Boolean(errors.phone)}
          helperText={errors.phone?.message}
        />
        <TextField
          label="Timezone"
          {...form.register('timezone')}
          error={Boolean(errors.timezone)}
          helperText={errors.timezone?.message ?? 'Used for calling windows and reports.'}
        />
        <Typography variant="caption" color="text.secondary">
          By creating an account you agree to the{' '}
          <Link component={RouterLink} to="/terms">
            Terms of Service
          </Link>{' '}
          and the{' '}
          <Link component={RouterLink} to="/privacy">
            Privacy Policy
          </Link>
          .
        </Typography>
        <Button type="submit" variant="contained" size="large" disabled={signup.isPending}>
          {signup.isPending ? 'Creating…' : 'Create account'}
        </Button>
      </Stack>
    </AuthLayout>
  );
}
