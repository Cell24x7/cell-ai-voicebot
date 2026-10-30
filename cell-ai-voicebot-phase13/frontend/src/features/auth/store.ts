import { create } from 'zustand';

import type { AuthMe, AuthSession, PublicAccount, PublicUser } from '@/services/api/types';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface SessionState {
  accessToken: string;
  expiresAt: number;
  user: PublicUser;
  account: PublicAccount;
  role: { key: string; name: string };
  permissions: ReadonlySet<string>;
  impersonation: AuthMe['impersonation'];
}

export interface AuthState {
  status: AuthStatus;
  session: SessionState | null;
  /** The superadmin's own session while impersonating (restored on stop). */
  savedSession: SessionState | null;
  setSession: (session: AuthSession) => void;
  /** Updates user / account / permissions from `GET /auth/me`, keeping the token. */
  setMe: (me: AuthMe) => void;
  setAnonymous: () => void;
  startImpersonation: (session: AuthSession) => void;
  /** Restores the saved superadmin session (null when there was none). */
  stopImpersonation: () => SessionState | null;
}

const toState = (s: AuthSession): SessionState => ({
  accessToken: s.accessToken,
  expiresAt: Date.now() + s.expiresIn * 1000,
  user: s.user,
  account: s.account,
  role: s.role,
  permissions: new Set(s.permissions),
  impersonation: s.impersonation,
});

/**
 * Session store (memory only — never localStorage, ADR 0009). A page reload
 * restores the session from the httpOnly refresh cookie.
 */
export const useAuthStore = create<AuthState>()((set, get) => ({
  status: 'loading',
  session: null,
  savedSession: null,
  setSession: (session) => set({ status: 'authenticated', session: toState(session) }),
  setMe: (me) => {
    const current = get().session;
    if (!current) return;
    set({
      session: {
        ...current,
        user: me.user,
        account: me.account,
        role: me.role,
        permissions: new Set(me.permissions),
        impersonation: me.impersonation,
      },
    });
  },
  setAnonymous: () => set({ status: 'anonymous', session: null, savedSession: null }),
  startImpersonation: (session) =>
    set((state) => ({
      savedSession: state.savedSession ?? state.session,
      session: toState(session),
      status: 'authenticated',
    })),
  stopImpersonation: () => {
    const saved = get().savedSession;
    set(saved ? { session: saved, savedSession: null } : { savedSession: null });
    return saved;
  },
}));

export const getAccessToken = (): string | null =>
  useAuthStore.getState().session?.accessToken ?? null;
