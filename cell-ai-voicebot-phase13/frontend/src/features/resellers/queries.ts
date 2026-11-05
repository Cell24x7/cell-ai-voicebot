import { useQuery } from '@tanstack/react-query';

import { resellersApi, type ResellerCustomersQuery } from '@/services/api/resellers';

import { resellerKeys } from './keys';

export const useResellerSummary = () =>
  useQuery({ queryKey: resellerKeys.summary, queryFn: () => resellersApi.summary() });

export const useResellerCustomers = (q: ResellerCustomersQuery) =>
  useQuery({ queryKey: resellerKeys.customers(q), queryFn: () => resellersApi.customers(q) });

export const useResellerCustomer = (id: string) =>
  useQuery({ queryKey: resellerKeys.customer(id), queryFn: () => resellersApi.customer(id) });

/** A reseller's customer: who adds credit, and may the customer top up itself. */
export const useWalletProvider = (enabled: boolean) =>
  useQuery({
    queryKey: resellerKeys.provider,
    queryFn: () => resellersApi.walletProvider(),
    enabled,
    staleTime: 60_000,
    meta: { silent: true },
  });
