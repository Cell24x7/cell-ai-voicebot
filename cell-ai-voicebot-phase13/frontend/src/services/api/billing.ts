import { apiClient, unwrap } from './client';
import type { BillingProfile, BillingProfileResponse, GstState, SuccessEnvelope } from './types';

/** Body of `PUT /billing/profile` (address line 2 and GSTIN optional). */
export type BillingProfileInput = Omit<BillingProfile, 'updatedAt' | 'addressLine2' | 'gstin'> & {
  addressLine2?: string | null;
  gstin?: string | null;
};

/** `/api/v1/billing` — GST billing details of the account. */
export const billingApi = {
  profile: () => unwrap(apiClient.get<SuccessEnvelope<BillingProfileResponse>>('/billing/profile')),
  saveProfile: (body: BillingProfileInput) =>
    unwrap(apiClient.put<SuccessEnvelope<BillingProfileResponse>>('/billing/profile', body)),
  states: () => unwrap(apiClient.get<SuccessEnvelope<GstState[]>>('/billing/states')),
};
