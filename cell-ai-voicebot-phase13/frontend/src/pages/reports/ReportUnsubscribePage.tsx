import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMutation } from '@tanstack/react-query';
import { Link as RouterLink, useSearchParams } from 'react-router';

import { AuthLayout } from '@/features/auth/AuthLayout';
import { toApiError } from '@/services/api/errors';
import { reportSubscriptionsApi } from '@/services/api/report-subscriptions';

/**
 * `/report-emails/unsubscribe?token=` (public, Phase 14): the link in a report e-mail.
 * Asks for a click first — mail scanners open links, and must not stop the e-mail.
 */
export function ReportUnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const stop = useMutation({
    mutationFn: () => reportSubscriptionsApi.unsubscribe(token),
    meta: { silent: true },
  });
  const error = stop.error ? toApiError(stop.error) : null;
  const invalid = !token || error?.code === 'VALIDATION_FAILED';

  return (
    <AuthLayout
      title="Report e-mails"
      footer={
        <Link component={RouterLink} to="/settings/notifications">
          Manage report e-mails
        </Link>
      }
    >
      {stop.isSuccess ? (
        <Alert severity="success">
          Done — you won't get this report e-mail any more. You can turn it back on in Settings →
          Notifications.
        </Alert>
      ) : invalid ? (
        <Alert severity="error">
          This link is not valid any more. Sign in and change your report e-mails in Settings →
          Notifications.
        </Alert>
      ) : (
        <Stack spacing={2}>
          <Typography>Stop getting this report by e-mail?</Typography>
          {error && <Alert severity="error">{error.message}</Alert>}
          <Button variant="contained" onClick={() => stop.mutate()} disabled={stop.isPending}>
            Stop these e-mails
          </Button>
        </Stack>
      )}
    </AuthLayout>
  );
}
