import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { useNavigate } from 'react-router';

import { formatCurrencyMicros } from '@/utils/format';

import { useCanTopUp, useHasWallet, useWallet } from './queries';

/** Low / exhausted wallet banner (users with `wallet.read`; "Add money" with `wallet.topup`). */
export function WalletBanner() {
  const canRead = useHasWallet();
  const canTopUp = useCanTopUp();
  const wallet = useWallet();
  const navigate = useNavigate();
  if (!canRead || !wallet.data || wallet.data.status === 'ok') return null;
  const exhausted = wallet.data.status === 'exhausted';
  return (
    <Alert
      severity={exhausted ? 'error' : 'warning'}
      sx={{ mb: 2 }}
      action={
        canTopUp ? (
          <Button color="inherit" size="small" onClick={() => void navigate('/wallet?add=1')}>
            Add money
          </Button>
        ) : undefined
      }
    >
      {exhausted
        ? 'No money available in the wallet — calls and WhatsApp messages cannot start until money is added.'
        : `Low wallet balance: ${formatCurrencyMicros(wallet.data.availableMicros)} available. Calls and WhatsApp messages stop when it runs out.`}
    </Alert>
  );
}
