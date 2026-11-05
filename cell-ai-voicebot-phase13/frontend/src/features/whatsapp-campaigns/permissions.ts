import { usePermission, useSession } from '@/features/auth/hooks';

/** Ordinary campaign writes are allowed in login-as act mode. */
export const useCanWriteWaCampaigns = (): boolean => {
  const canWrite = usePermission('whatsapp.campaigns.write');
  const session = useSession();
  return canWrite && (!session?.impersonation || session.impersonation.mode === 'act');
};

/** `whatsapp.campaigns.read` (the list / detail / report). */
export const useCanReadWaCampaigns = (): boolean => usePermission('whatsapp.campaigns.read');
