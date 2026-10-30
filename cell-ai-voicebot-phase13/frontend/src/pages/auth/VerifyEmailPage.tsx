import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { AuthLayout } from '@/features/auth/AuthLayout';
import { OtpInput } from '@/features/auth/OtpInput';
import { retryText } from '@/features/auth/schemas';
import { useAuthStore } from '@/features/auth/store';
import { authApi } from '@/services/api/auth';
import { getErrorMessage, toApiError } from '@/services/api/errors';

export const RESEND_SECONDS = 60;

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const email = params.get('email') ?? '';
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const verify = useMutation({
    mutationFn: (body: { email: string; code: string }) => authApi.verifyEmail(body),
    meta: { silent: true },
    onSuccess: (session) => {
      useAuthStore.getState().setSession(session);
      void navigate('/', { replace: true });
    },
    onError: () => setCode(''),
  });
  const resend = useMutation({
    mutationFn: () => authApi.resendVerification(email),
    meta: { silent: true },
    onSuccess: () => {
      setCooldown(RESEND_SECONDS);
      setNotice('If your email still needs verifying, a new code is on its way.');
    },
  });

  const submit = (value: string) => {
    if (value.length === 6 && !verify.isPending) verify.mutate({ email, code: value });
  };

  const error = verify.error ? toApiError(verify.error) : null;
  const message =
    error?.code === 'AUTH_TOO_MANY_ATTEMPTS'
      ? `Too many wrong codes. Request a new code. ${retryText(error.retryAfterSec)}`
      : error?.code === 'AUTH_CODE_INVALID'
        ? 'That code is wrong or has expired.'
        : error
          ? getErrorMessage(error)
          : null;

  return (
    <AuthLayout
      title="Check your email"
      subtitle={
        email ? (
          <>
            We sent a 6-digit code to <strong>{email}</strong>. It expires in 10 minutes.
          </>
        ) : (
          'Open the link from your email again.'
        )
      }
    >
      <Stack
        component="form"
        spacing={3}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit(code);
        }}
      >
        {message && <Alert severity="error">{message}</Alert>}
        {notice && !message && <Alert severity="info">{notice}</Alert>}
        <OtpInput
          value={code}
          disabled={verify.isPending || !email}
          error={Boolean(error)}
          onChange={(value) => {
            setCode(value);
            if (value.length === 6) submit(value);
          }}
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={code.length !== 6 || verify.isPending || !email}
        >
          {verify.isPending ? 'Verifying…' : 'Verify email'}
        </Button>
        <Button
          variant="text"
          disabled={cooldown > 0 || resend.isPending || !email}
          onClick={() => resend.mutate()}
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </Button>
      </Stack>
    </AuthLayout>
  );
}
