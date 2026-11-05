import { zodResolver } from '@hookform/resolvers/zod';
import BusinessOutlined from '@mui/icons-material/BusinessOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useNavigate } from 'react-router';

import { AuthLayout } from '@/features/auth/AuthLayout';
import { PasswordField } from '@/features/auth/PasswordField';
import { PASSWORD_MIN, signupSchema, type SignupValues } from '@/features/auth/schemas';
import { useAuthStore } from '@/features/auth/store';
import { authApi, type SignupAccountType } from '@/services/api/auth';
import { applyFieldErrors, getErrorMessage, toApiError } from '@/services/api/errors';
import { browserTimezone } from '@/utils/timezone';

const TYPES: {
  key: SignupAccountType;
  title: string;
  text: string;
  icon: typeof BusinessOutlined;
}[] = [
  {
    key: 'business',
    title: 'Business',
    text: 'Use the platform for your own business: calls, WhatsApp and campaigns.',
    icon: BusinessOutlined,
  },
  {
    key: 'reseller',
    title: 'Reseller',
    text: 'Create and manage accounts for your customers, and give them credit.',
    icon: GroupsOutlined,
  },
];

/**
 * Phase 19: open signup without e-mail — pick Business or Reseller, fill the form, and you are
 * signed in at once.
 */
export function SignupPage() {
  const navigate = useNavigate();
  const options = useQuery({
    queryKey: ['auth', 'signup-options'],
    queryFn: () => authApi.signupOptions(),
    staleTime: 60_000,
    meta: { silent: true },
  });
  const [type, setType] = useState<SignupAccountType | null>(null);
  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      businessName: '',
      name: '',
      email: '',
      password: '',
      phone: '',
      timezone: browserTimezone(),
      acceptTerms: false,
      website: '',
    },
  });
  const signup = useMutation({
    mutationFn: (v: SignupValues) =>
      authApi.signup({
        accountType: type ?? 'business',
        businessName: v.businessName,
        name: v.name,
        email: v.email,
        password: v.password,
        timezone: v.timezone,
        acceptTerms: true,
        ...(v.phone === '' ? {} : { phone: v.phone }),
        ...(v.website ? { website: v.website } : {}),
      }),
    meta: { silent: true },
    onSuccess: (session) => {
      useAuthStore.getState().setSession(session);
      void navigate(session.account.kind === 'reseller' ? '/reseller' : '/', { replace: true });
    },
    onError: (error) => applyFieldErrors(form.setError, error),
  });
  const { errors } = form.formState;
  const apiError = signup.error ? toApiError(signup.error) : null;
  const generalError =
    signup.error && !Object.keys(errors).length && apiError?.code !== 'AUTH_EMAIL_TAKEN'
      ? getErrorMessage(signup.error)
      : null;
  const resellerOpen = options.data?.resellerSignup !== 'closed';
  const footer = (
    <>
      Already have an account?{' '}
      <Link component={RouterLink} to="/login">
        Sign in
      </Link>
    </>
  );

  if (options.data && !options.data.open) {
    return (
      <AuthLayout title="Create your account" footer={footer}>
        <Alert severity="info">Signups are closed. Contact us to get an account.</Alert>
      </AuthLayout>
    );
  }

  if (!type) {
    if (options.isPending) {
      return (
        <AuthLayout title="Create your account" footer={footer}>
          <Typography color="text.secondary">Loading…</Typography>
        </AuthLayout>
      );
    }
    return (
      <AuthLayout
        title="Create your account"
        subtitle="What kind of account do you need?"
        footer={footer}
      >
        <Stack spacing={1.5}>
          {TYPES.filter((t) => t.key === 'business' || resellerOpen).map((t) => (
            <Card key={t.key} variant="outlined">
              <CardActionArea onClick={() => setType(t.key)} aria-label={t.title}>
                <CardContent>
                  <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                    <t.icon color="primary" />
                    <Box>
                      <Typography variant="subtitle1">{t.title}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t.text}
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
          {options.data?.resellerSignup === 'approval' && (
            <Typography variant="caption" color="text.secondary">
              New reseller accounts are approved by our team before they can add customers.
            </Typography>
          )}
        </Stack>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={type === 'reseller' ? 'Create your reseller account' : 'Create your account'}
      subtitle="No e-mail code — you are signed in right after this form."
      footer={footer}
    >
      <Stack
        component="form"
        spacing={2}
        noValidate
        onSubmit={(e) => void form.handleSubmit((v) => signup.mutate(v))(e)}
      >
        <Link
          component="button"
          type="button"
          onClick={() => setType(null)}
          sx={{ alignSelf: 'flex-start' }}
        >
          ← Change account type
        </Link>
        {generalError && <Alert severity="error">{generalError}</Alert>}
        {apiError?.code === 'AUTH_EMAIL_TAKEN' && (
          <Alert severity="warning">
            An account with this e-mail already exists.{' '}
            <Link component={RouterLink} to="/login">
              Log in instead
            </Link>
          </Alert>
        )}
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
        {/* honeypot: hidden from people, bots fill it */}
        <Box
          aria-hidden="true"
          sx={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}
        >
          <input tabIndex={-1} autoComplete="off" {...form.register('website')} />
        </Box>
        <Box>
          <FormControlLabel
            control={<Checkbox {...form.register('acceptTerms')} />}
            label={
              <Typography variant="body2">
                I agree to the{' '}
                <Link component={RouterLink} to="/terms">
                  Terms of Service
                </Link>{' '}
                and the{' '}
                <Link component={RouterLink} to="/privacy">
                  Privacy Policy
                </Link>
              </Typography>
            }
          />
          {errors.acceptTerms && (
            <FormHelperText error>{errors.acceptTerms.message}</FormHelperText>
          )}
        </Box>
        <Button type="submit" variant="contained" size="large" disabled={signup.isPending}>
          {signup.isPending ? 'Creating…' : 'Create account'}
        </Button>
      </Stack>
    </AuthLayout>
  );
}
