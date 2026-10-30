import { usePermission } from '@/features/auth/hooks';
import { useImpersonating } from '@/features/wallet/queries';

// a module of its own: eager pages (lists, segments) use these without the campaign queries

const useCan = (permission: string): boolean => {
  const can = usePermission(permission);
  const impersonating = useImpersonating();
  return can && !impersonating;
};

/** campaigns.write and not impersonating (create / edit / duplicate / delete). */
export const useCanWriteCampaigns = (): boolean => useCan('campaigns.write');
/** campaigns.run and not impersonating (start / pause / resume / cancel). */
export const useCanRunCampaigns = (): boolean => useCan('campaigns.run');
/** campaigns.export and not impersonating. */
export const useCanExportCampaigns = (): boolean => useCan('campaigns.export');
