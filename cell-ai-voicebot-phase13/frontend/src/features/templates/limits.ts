const MB = 1024 * 1024;

/**
 * Copy of the backend `TEMPLATE_LIMITS` the builder needs (Meta's template rules,
 * PHASE_11_PLAN §1c). Not served by an endpoint — `limits.test.ts` pins every value.
 */
export const TEMPLATE_LIMITS = {
  nameMax: 512,
  namePattern: /^[a-z0-9_]+$/,
  headerTextMax: 60,
  headerVariablesMax: 1,
  bodyMax: 1024,
  footerMax: 60,
  buttonsMax: 10,
  quickRepliesMax: 10,
  urlButtonsMax: 2,
  phoneButtonsMax: 1,
  copyCodeButtonsMax: 1,
  voiceCallButtonsMax: 1,
  buttonTextMax: 25,
  urlMax: 2000,
  phoneMax: 20,
  copyCodeExampleMax: 20,
  variablesMax: 20,
  variableValueMax: 1024,
  approvedEditsPer30Days: 10,
  /** Meta keeps a deleted template's name locked for 30 days. */
  deletedNameLockDays: 30,
  headerExampleMaxBytes: { image: 5 * MB, video: 16 * MB, document: 100 * MB },
  /** `message_send_ttl_seconds` (30 s – 30 days). */
  ttlMinSeconds: 30,
  ttlMaxSeconds: 30 * 86_400,
  /** Buttons beyond this show as "See all options" on the phone. */
  visibleButtons: 3,
} as const;

/** File types Meta accepts as a header example, per header format. */
export const HEADER_EXAMPLE_TYPES = {
  IMAGE: ['image/jpeg', 'image/png'],
  VIDEO: ['video/mp4'],
  DOCUMENT: ['application/pdf'],
} as const;
