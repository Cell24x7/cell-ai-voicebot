/** The exact skip reasons (backend `POSTCALL_SKIP_REASONS`) in plain words. */
export const SKIP_REASON_TEXT: Record<string, string> = {
  opted_out: 'The customer opted out of WhatsApp messages',
  dnd: 'The customer is on Do Not Disturb',
  no_template: 'The template no longer exists',
  template_not_approved: 'The template is not approved on this number',
  no_number: 'No connected WhatsApp number',
  no_phone: 'The contact has no phone number',
  low_balance: 'Not enough wallet balance',
  marketing_limit: 'Marketing message limit reached for this customer',
  rule_disabled: 'The rule was turned off before sending',
  call_not_eligible: 'The call no longer matches the rule',
};

export const reasonOf = (reason: string | null): string | null =>
  reason ? (SKIP_REASON_TEXT[reason] ?? reason.replace(/_/g, ' ')) : null;
