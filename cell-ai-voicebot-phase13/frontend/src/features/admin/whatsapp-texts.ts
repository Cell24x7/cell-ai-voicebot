/** Shown before a superadmin changes who pays Meta (PHASE_9_PLAN §1o). */
export const BILLING_CONFIRM =
  "Applies to numbers connected from now on — a credit line can't be removed from a WhatsApp account once attached.";

/* ── PN: managed numbers (Pinnacle partner API) ───────────────────────────── */

export const MANAGED_TEXTS = {
  add: 'Add managed number (Pinnacle)',
  title: 'Add managed number',
  intro:
    'A number onboarded at the partner (Pinnacle). Every message and call for it goes through the partner, and its events come back to us.',
  help: 'Copy these from the partner panel: Whatsapp → Manage Accounts (WABA ID, phone number ID) and Admin → Manage API Keys (API key).',
  creditLine: 'Credit line at the partner',
  requested: 'Requested (the number waits until it is active)',
  active: 'Active (approved in the partner panel)',
  progress: 'Checking the key and setting the webhook…',
  added: 'Managed number added',
  activeConfirm:
    'Only switch to Active after the partner approved the credit line in their panel. Messages and calls are then billed to the platform.',
  balanceLow: 'Partner balance low',
} as const;
