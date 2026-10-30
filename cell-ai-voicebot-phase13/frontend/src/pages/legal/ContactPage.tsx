import Alert from '@mui/material/Alert';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router';

import { legalValues } from '@/features/legal/config';
import { PublicLayout } from '@/features/legal/PublicLayout';

/** Public `/contact`: company, address, support e-mail, grievance officer (DPDP Act). */
export function ContactPage() {
  const { values, missing } = legalValues();
  const email = missing.includes('email') ? null : values.email;
  return (
    <PublicLayout title="Contact">
      <Stack spacing={1.5}>
        {missing.length > 0 && (
          <Alert severity="warning" role="status">
            Draft — some contact details are not filled in yet.
          </Alert>
        )}
        <Typography variant="body2">
          <strong>{values.company}</strong>
          <br />
          {values.address}
        </Typography>
        <Typography variant="body2">
          Support and privacy requests:{' '}
          {email ? <Link href={`mailto:${email}`}>{email}</Link> : values.email}
        </Typography>
        <Typography variant="body2">
          Grievance Officer (Digital Personal Data Protection Act, 2023): {values.grievanceOfficer}
        </Typography>
        <Typography variant="body2">
          Read our{' '}
          <Link component={RouterLink} to="/privacy">
            Privacy Policy
          </Link>{' '}
          and{' '}
          <Link component={RouterLink} to="/terms">
            Terms of Service
          </Link>
          , or check a{' '}
          <Link component={RouterLink} to="/data-deletion">
            data deletion request
          </Link>
          .
        </Typography>
      </Stack>
    </PublicLayout>
  );
}
