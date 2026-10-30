import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import { useSession } from '@/features/auth/hooks';
import { endImpersonation } from '@/features/auth/session';
import { useAuthStore } from '@/features/auth/store';
import { WalletBanner } from '@/features/wallet/WalletBanner';

/** Impersonation, suspended-account and wallet banners above the page. */
export function Banners() {
  const session = useSession();
  const savedAccountId = useAuthStore((s) => s.savedSession?.account.id);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  if (!session) return null;
  const stop = async () => {
    const accountId = session.account.id;
    await endImpersonation(queryClient);
    void navigate(savedAccountId ? `/admin/accounts/${accountId}` : '/');
  };
  return (
    <>
      {session.impersonation && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => void stop()}>
              Stop
            </Button>
          }
        >
          Viewing as {session.user.name} ({session.account.name}). Actions are recorded in the audit
          log.
        </Alert>
      )}
      {session.account.status === 'suspended' && (
        <Alert severity="error" sx={{ mb: 2 }}>
          This account is suspended — it is read-only.{' '}
          {session.account.suspendReason ? `Reason: ${session.account.suspendReason}. ` : ''}
          Contact support to restore it.
        </Alert>
      )}
      <WalletBanner />
    </>
  );
}
