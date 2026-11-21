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

type ImpersonationOf =
  { impersonation: { mode: 'view' | 'act' | 'full' } | null } | null | undefined;

/**
 * SAC: a login-as session that can't act as the owner (`view` / `act`). A superadmin
 * **Full access** session acts as the owner everywhere (the server asks for a step-up on
 * danger actions), so it is not limited.
 */
export const isLimitedImpersonation = (session: ImpersonationOf): boolean =>
  Boolean(session?.impersonation && session.impersonation.mode !== 'full');

/** `'view' | 'act' | 'full'` while logged in as someone, else null. */
export const useImpersonationMode = (): 'view' | 'act' | 'full' | null =>
  useAuthStore((s) => s.session?.impersonation?.mode ?? null);

/** A superadmin Full access session. */
export const useIsFullAccess = (): boolean => useImpersonationMode() === 'full';

/** The owner's actions are allowed (not a limited login-as). */
export const useCanActAsOwner = (): boolean =>
  useAuthStore((s) => !isLimitedImpersonation(s.session));
