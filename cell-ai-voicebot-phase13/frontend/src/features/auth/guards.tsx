import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';

import { useIsPlatformAdmin } from './hooks';
import { useAuthStore } from './store';

/** Signed-in only; otherwise → /login?next=<here>. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();
  if (status !== 'authenticated') {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }
  return <>{children}</>;
}

/** Auth pages: signed-in users go to `next` (or the dashboard). */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();
  if (status === 'authenticated') {
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={next?.startsWith('/') && !next.startsWith('//') ? next : '/'} replace />;
  }
  return <>{children}</>;
}

/** Needs `perm` (all) or one of `anyOf`; otherwise the 403 page. */
export function RequirePermission({
  perm,
  anyOf,
  children,
}: {
  perm?: string;
  anyOf?: string[];
  children: ReactNode;
}) {
  const permissions = useAuthStore((s) => s.session?.permissions);
  const allowed = perm
    ? Boolean(permissions?.has(perm))
    : (anyOf ?? []).some((p) => permissions?.has(p));
  if (!allowed) return <Navigate to="/403" replace />;
  return <>{children}</>;
}

/**
 * Platform superadmins only. While impersonating, admin pages send you to the
 * customer's dashboard (the banner has "Stop") — this is also where starting
 * an impersonation lands.
 */
export function RequirePlatformAdmin({ children }: { children: ReactNode }) {
  const allowed = useIsPlatformAdmin();
  const impersonating = useAuthStore((s) => Boolean(s.session?.impersonation));
  if (impersonating) return <Navigate to="/" replace />;
  if (!allowed) return <Navigate to="/403" replace />;
  return <>{children}</>;
}
