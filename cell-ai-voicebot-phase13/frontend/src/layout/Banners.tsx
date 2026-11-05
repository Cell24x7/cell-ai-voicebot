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
    const back = session.impersonation?.returnTo ?? `/admin/accounts/${session.account.id}`;
    await endImpersonation(queryClient);
    void navigate(savedAccountId ? back : '/');
  };
  const imp = session.impersonation;
  return (
    <>
      {imp && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => void stop()}>
              {imp.kind === 'reseller' ? 'Back to reseller panel' : 'Back to admin'}
            </Button>
          }
        >
          {imp.mode === 'act' ? 'Logged in as' : 'Viewing as'} {session.user.name} (
          {session.account.name}).{' '}
          {imp.mode === 'act'
            ? 'Password, sign-in, API keys and payments are blocked.'
            : 'Read-only.'}{' '}
          Actions are recorded in the audit log.
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
