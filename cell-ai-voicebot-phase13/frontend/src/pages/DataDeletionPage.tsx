import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink, useSearchParams } from 'react-router';

import { AuthLayout } from '@/features/auth/AuthLayout';
import { legalValues } from '@/features/legal/config';
import { metaPublicApi } from '@/services/api/meta-public';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

/** Public `/data-deletion` (Meta's data deletion callback URL + status lookup by `?code=`). */
export function DataDeletionPage() {
  const { values, missing } = legalValues();
  const appName = values.appName;
  const email = missing.includes('email') ? null : values.email;
  const [params] = useSearchParams();
  const code = params.get('code') ?? '';
  const status = useQuery({
    queryKey: ['meta', 'data-deletion', code],
    queryFn: () => metaPublicApi.deletionStatus(code),
    enabled: Boolean(code),
    retry: false,
    meta: { silent: true },
  });

  return (
    <AuthLayout title="Data deletion">
      <Stack spacing={2}>
        {code && status.isPending && <Skeleton height={48} />}
        {status.data && (
          <Alert severity={status.data.status === 'completed' ? 'success' : 'info'}>
            Request <strong>{code}</strong>:{' '}
            {status.data.status === 'completed'
              ? `completed ${status.data.completedAt ? when(status.data.completedAt) : ''}`
              : `received ${when(status.data.receivedAt)} — being processed`}
            .
          </Alert>
        )}
        {status.isError && (
          <Alert severity="warning">We couldn&apos;t find a deletion request with that code.</Alert>
        )}
        <Typography variant="subtitle1" component="h2">
          How to delete your data
        </Typography>
        <Box component="ol" sx={{ m: 0, pl: 3 }}>
          <Typography component="li" variant="body2" sx={{ mb: 1 }}>
            <strong>Connected WhatsApp through Facebook?</strong> Remove the {appName} app in
            Facebook → Settings &amp; privacy → Settings → Business integrations. Meta sends us a
            deletion request; we delete the access tokens and your Meta user id, the numbers stop
            syncing, and this page shows the request status with the code Meta gives you.
          </Typography>
          <Typography component="li" variant="body2" sx={{ mb: 1 }}>
            <strong>Delete an account and its data:</strong> the account owner writes to{' '}
            {email ? <Link href={`mailto:${email}`}>{email}</Link> : 'our support e-mail'} from the
            owner&apos;s e-mail address.
          </Typography>
          <Typography component="li" variant="body2">
            <strong>Inside the app:</strong> owners and admins can delete contacts, turn off call
            recording and disconnect a WhatsApp number at any time.
          </Typography>
        </Box>
        <Typography variant="body2">
          What we store from Meta when a business connects WhatsApp: an access token for the
          connected WhatsApp Business Account (encrypted), the account and phone number ids and
          details (names, statuses, quality), and the WhatsApp webhook events Meta sends for those
          numbers (kept up to 30 days). Read the{' '}
          <Link component={RouterLink} to="/privacy">
            Privacy Policy
          </Link>{' '}
          for everything else.
        </Typography>
      </Stack>
    </AuthLayout>
  );
}
