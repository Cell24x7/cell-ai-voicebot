import type { MetaCalling, MetaCallingStepKey } from '@/services/api/types';

/** PMC: texts of "Calling on karo (Meta direct)" (managed numbers). */
export const META_CALLING_EXPLAIN =
  'Messages, templates, campaigns aur credit line Pinnacle par hi rahenge. Sirf calls Meta Graph se chalengi. Call ka Meta charge Pinnacle credit line se hi jayega.';

export const META_CALLING_STEP_LABELS: Record<MetaCallingStepKey, string> = {
  token: 'Meta access mila',
  verify: 'Number verified (same WhatsApp account + number)',
  app_subscribed: 'Hamara app WhatsApp account par subscribed',
  fields: '`calls` webhook humare URL par',
  calling_on: 'Calling ON at WhatsApp',
};

export const META_CALLING_STATUS_LABELS: Record<MetaCalling['status'], string> = {
  off: 'Calls off (partner)',
  on: 'Calls via Meta',
  error: 'Calls via Meta — stopped',
};

export const META_CALLING_METHOD_LABELS: Record<NonNullable<MetaCalling['method']>, string> = {
  embedded_signup: 'Continue with Facebook',
  system_user_token: 'System User token',
};
