import { getErrorMessage, type ApiError } from '@/services/api/errors';
import type {
  WhatsAppPriceNote,
  WhatsAppTemplateCategory,
  WhatsAppTemplateQuality,
  WhatsAppTemplateStatus,
  WhatsAppVariableSourceKind,
} from '@/services/api/types';

type Tone = 'default' | 'success' | 'warning' | 'error' | 'info';

export const TEMPLATE_STATUS: Record<WhatsAppTemplateStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'default' },
  PENDING: { label: 'In review', tone: 'info' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'error' },
  PAUSED: { label: 'Paused', tone: 'warning' },
  DISABLED: { label: 'Disabled', tone: 'error' },
  IN_APPEAL: { label: 'In appeal', tone: 'info' },
  FLAGGED: { label: 'Flagged', tone: 'warning' },
  PENDING_DELETION: { label: 'Being deleted', tone: 'default' },
  DELETED: { label: 'Deleted', tone: 'default' },
  ARCHIVED: { label: 'Archived', tone: 'default' },
  LIMIT_EXCEEDED: { label: 'Limit reached', tone: 'error' },
};

/** Meta's own descriptions (shown in the builder's category picker). */
export const TEMPLATE_CATEGORY: Record<
  WhatsAppTemplateCategory,
  { label: string; description: string }
> = {
  UTILITY: {
    label: 'Utility',
    description:
      'Updates about an order, account or payment the customer started — reminders, confirmations, alerts.',
  },
  MARKETING: {
    label: 'Marketing',
    description: 'Offers, announcements and invitations — anything that is not a utility update.',
  },
  AUTHENTICATION: {
    label: 'Authentication',
    description: 'One-time passcodes. Created in WhatsApp Manager.',
  },
};

export const TEMPLATE_QUALITY: Record<
  WhatsAppTemplateQuality,
  { label: string; color: 'success' | 'warning' | 'error' | 'disabled' }
> = {
  GREEN: { label: 'High quality', color: 'success' },
  YELLOW: { label: 'Medium quality', color: 'warning' },
  RED: { label: 'Low quality', color: 'error' },
  UNKNOWN: { label: 'Quality not rated yet', color: 'disabled' },
};

/** Meta's rejection reasons (`statusReason.reason`) in plain words. */
const REASONS: Record<string, string> = {
  INVALID_FORMAT: 'The format is not valid (variables, examples or length).',
  TAG_CONTENT_MISMATCH: "The content doesn't match the category.",
  PROMOTIONAL: 'The template looks like marketing — choose the Marketing category.',
  ABUSIVE_CONTENT: 'WhatsApp found content against its policies.',
  INCORRECT_CATEGORY: 'WhatsApp chose a different category.',
  SCAM: 'WhatsApp thinks this template could mislead customers.',
  NONE: 'No reason given by WhatsApp.',
};

/** The reason text of a status (Meta's title / description when given). */
export const reasonText = (
  reason: { reason: string; title: string | null; description: string | null } | null,
): string | null => {
  if (!reason) return null;
  return reason.description ?? reason.title ?? REASONS[reason.reason] ?? reason.reason;
};

export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'en_US', label: 'English (US)' },
  { code: 'en_GB', label: 'English (UK)' },
  { code: 'hi', label: 'Hindi' },
  { code: 'bn', label: 'Bengali' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'kn', label: 'Kannada' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'mr', label: 'Marathi' },
  { code: 'pa', label: 'Punjabi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'ur', label: 'Urdu' },
  { code: 'ar', label: 'Arabic' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt_BR', label: 'Portuguese (Brazil)' },
  { code: 'id', label: 'Indonesian' },
];

export const languageLabel = (code: string): string =>
  LANGUAGES.find((l) => l.code === code)?.label ?? code;

export const VARIABLE_SOURCE_LABELS: Record<WhatsAppVariableSourceKind, string> = {
  'contact.name': 'Contact name',
  'contact.phone': 'Contact phone',
  'contact.email': 'Contact email',
  field: 'Custom field',
  static: 'Fixed text',
  ask: 'Type here',
};

/** Send / manage errors per code (the server message is the fallback). */
export const TEMPLATE_ERROR_TEXT: Record<string, string> = {
  TEMPLATE_NOT_APPROVED: 'This template is not approved by WhatsApp.',
  TEMPLATE_PAUSED: 'WhatsApp paused this template for low quality. Try again later.',
  TEMPLATE_VARIABLES_MISSING: 'Fill in every variable.',
  TEMPLATE_PARAMS_INVALID: "The values don't match the template. Sync the templates and try again.",
  TEMPLATE_EDIT_NOT_ALLOWED: "This template can't be edited now.",
  TEMPLATE_NAME_TAKEN:
    'A template with this name and language already exists (or was deleted in the last 30 days).',
  TEMPLATE_LIMIT_REACHED: 'The WhatsApp template limit of this number is reached.',
  TEMPLATE_MARKETING_BLOCKED: "Marketing templates can't be sent to this customer.",
  WHATSAPP_FREQUENCY_LIMIT:
    'This customer already got a marketing template in the last 24 hours. Try again later.',
  WALLET_INSUFFICIENT_BALANCE: 'Add money to your wallet to send WhatsApp messages.',
  WALLET_BUDGET_EXCEEDED: 'The monthly WhatsApp budget is reached. Raise it in Wallet → Settings.',
  RATE_LIMITED: 'Too many tries. Wait a minute and try again.',
};

/** Why marketing is refused for a contact (`TEMPLATE_MARKETING_BLOCKED` detail). */
export const MARKETING_BLOCK_TEXT: Record<string, string> = {
  opted_out: 'The customer opted out of messages.',
  dnd: 'The number is on the Do-not-disturb list.',
  stopped_marketing: 'The customer stopped marketing messages on WhatsApp.',
};

export const PRICE_CATEGORY_LABELS: Record<string, string> = {
  marketing: 'Marketing',
  utility: 'Utility',
  authentication: 'Authentication',
  authentication_international: 'Authentication (international)',
  service: 'Service',
};

export const PRICE_NOTE_TEXT: Record<WhatsAppPriceNote, string> = {
  billed_when_delivered: 'Charged only when WhatsApp delivers it.',
  free_tier_may_apply:
    'Free for the first 1,000 replies each month and when the customer is in a free entry window.',
  customer_pays_meta: 'Billed by Meta to your WhatsApp account.',
};

/** A template / send error in plain words (the code's text, else the usual message). */
export const templateErrorMessage = (err: ApiError): string =>
  TEMPLATE_ERROR_TEXT[err.code] ?? getErrorMessage(err);
