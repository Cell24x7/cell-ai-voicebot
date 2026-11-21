import { useQuery } from '@tanstack/react-query';

import { usePermission, isLimitedImpersonation } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';
import { billingApi } from '@/services/api/billing';
import { walletApi } from '@/services/api/wallet';

import { billingKeys, walletKeys } from './keys';

/**
 * Can this user see a wallet? `wallet.read`, and never in the platform account
 * (it pays nothing — superadmins see billing under /admin/billing).
 */
export const useHasWallet = (): boolean => {
  const canRead = usePermission('wallet.read');
  const platform = useAuthStore((s) => Boolean(s.session?.account.isPlatform));
  return canRead && !platform;
};

/** The account wallet (only fetched when the user has one; WS keeps it fresh). */
export const useWallet = () => {
  const hasWallet = useHasWallet();
  return useQuery({ queryKey: walletKeys.wallet, queryFn: walletApi.get, enabled: hasWallet });
};

export const useRates = () => useQuery({ queryKey: walletKeys.rates, queryFn: walletApi.rates });

export const useBillingProfile = (enabled = true) =>
  useQuery({ queryKey: billingKeys.profile, queryFn: billingApi.profile, enabled });

export const useGstStates = () =>
  useQuery({ queryKey: billingKeys.states, queryFn: billingApi.states, staleTime: Infinity });

/**
 * Can this user add money right now (permission, and never from a login-as session —
 * SAC: Full access too; superadmins use Admin → Wallet → Adjust).
 */
export const useCanTopUp = (): boolean => {
  const canTopUp = usePermission('wallet.topup');
  const loggedInAs = useAuthStore((s) => Boolean(s.session?.impersonation));
  return canTopUp && !loggedInAs;
};

/**
 * `true` while a login-as session can't act as the owner (`view` / `act`). SAC: a superadmin
 * Full access session is not limited — it works like the owner.
 */
export const useImpersonating = (): boolean =>
  useAuthStore((s) => isLimitedImpersonation(s.session));
