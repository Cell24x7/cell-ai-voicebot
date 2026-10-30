import { usePermission, useSession } from '@/features/auth/hooks';
import { useImpersonating } from '@/features/wallet/queries';

/** Owners / admins (`whatsapp.manage`), not while impersonating, account active. */
export const useCanManageWhatsApp = (): boolean => {
  const can = usePermission('whatsapp.manage');
  const impersonating = useImpersonating();
  const active = useSession()?.account.status === 'active';
  return can && !impersonating && active;
};
