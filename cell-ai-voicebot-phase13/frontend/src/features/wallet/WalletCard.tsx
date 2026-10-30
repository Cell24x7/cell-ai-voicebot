import Alert from '@mui/material/Alert';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router';

import { getErrorMessage } from '@/services/api/errors';
import { formatCurrencyMicros } from '@/utils/format';

import { WalletStatusChip } from './OverviewTab';
import { useWallet } from './queries';

/** Dashboard: available balance + status (users with `wallet.read`). */
export function WalletCard() {
  const wallet = useWallet();
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="overline" color="text.secondary">
          Wallet
        </Typography>
        {wallet.isPending && <Skeleton width={160} height={40} />}
        {wallet.isError && <Alert severity="error">{getErrorMessage(wallet.error)}</Alert>}
        {wallet.data && (
          <Stack spacing={0.5}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                {formatCurrencyMicros(wallet.data.availableMicros)}
              </Typography>
              <WalletStatusChip status={wallet.data.status} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Available · {formatCurrencyMicros(wallet.data.monthSpend.totalMicros)} spent this
              month
            </Typography>
          </Stack>
        )}
      </CardContent>
      <CardActions>
        <Link component={RouterLink} to="/wallet" sx={{ px: 1 }}>
          Open wallet
        </Link>
      </CardActions>
    </Card>
  );
}
