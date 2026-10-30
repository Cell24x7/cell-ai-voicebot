import { useCallback } from 'react';

import { useAuthStore } from './store';

/** The signed-in session (null while loading / signed out). */
export const useSession = () => useAuthStore((s) => s.session);
export const useAuthStatus = () => useAuthStore((s) => s.status);

/** `true` when the user has the permission (platform permissions included for superadmins). */
export const usePermission = (permission: string): boolean =>
  useAuthStore((s) => s.session?.permissions.has(permission) ?? false);

/** `can('team.invite')` — for lists of actions. */
export const useCan = (): ((permission: string) => boolean) => {
  const permissions = useAuthStore((s) => s.session?.permissions);
  return useCallback((permission: string) => permissions?.has(permission) ?? false, [permissions]);
};

export const useIsPlatformAdmin = (): boolean =>
  useAuthStore((s) => s.session?.user.platformRole === 'superadmin' && !s.session.impersonation);
