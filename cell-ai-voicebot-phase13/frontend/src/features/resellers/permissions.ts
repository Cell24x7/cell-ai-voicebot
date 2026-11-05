import { usePermission, useSession } from '@/features/auth/hooks';

/** The signed-in account is a reseller (not while logged in as a customer). */
export const useIsReseller = (): boolean => {
  const session = useSession();
  return session?.account.kind === 'reseller' && !session.impersonation;
};

export const useCanManageReseller = (): boolean => {
  const can = usePermission('reseller.manage');
  return useIsReseller() && can;
};
