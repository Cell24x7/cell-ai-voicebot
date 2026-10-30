import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { enqueueSnackbar } from 'notistack';

import { BillingProfileForm } from '@/features/billing/BillingProfileForm';
import { useBillingProfile, useCanTopUp } from '@/features/wallet/queries';
import { getErrorMessage } from '@/services/api/errors';

/** Settings → Billing details: GST details used on invoices (edit with `wallet.topup`). */
export function BillingTab() {
  const profile = useBillingProfile();
  const canEdit = useCanTopUp();
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          These details appear on every GST invoice. Use English letters as on your GST
          registration; the state decides CGST + SGST or IGST.
        </Typography>
        {!canEdit && (
          <Alert severity="info">Only the owner and admins can change billing details.</Alert>
        )}
        {profile.isPending && <Skeleton variant="rounded" height={240} />}
        {profile.isError && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => void profile.refetch()}>
                Retry
              </Button>
            }
          >
            {getErrorMessage(profile.error)}
          </Alert>
        )}
        {profile.data && (
          <BillingProfileForm
            key={profile.data.profile?.updatedAt ?? 'new'}
            profile={profile.data.profile}
            readOnly={!canEdit}
            onSaved={() => enqueueSnackbar('Billing details saved', { variant: 'success' })}
          />
        )}
      </Stack>
    </Paper>
  );
}
