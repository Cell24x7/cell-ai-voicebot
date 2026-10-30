import { usePermission, useSession } from '@/features/auth/hooks';
import { useImpersonating } from '@/features/wallet/queries';

/**
 * Owners / admins / managers (`templates.manage`), not while impersonating, account
 * active. Everyone else (and impersonating superadmins) reads templates only.
 */
export const useCanManageTemplates = (): boolean => {
  const can = usePermission('templates.manage');
  const impersonating = useImpersonating();
  const active = useSession()?.account.status === 'active';
  return can && !impersonating && active;
};
