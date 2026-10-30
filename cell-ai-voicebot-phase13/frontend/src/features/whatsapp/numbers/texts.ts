import type { WhatsAppConfig, WhatsAppMode } from '@/services/api/types';
import type { SimulatorKind } from '@/services/api/whatsapp';

export const MODE_OPTIONS: { value: WhatsAppMode; label: string; hint: string }[] = [
  {
    value: 'cloud_api',
    label: 'New or Cloud API number (recommended)',
    hint: 'A number not used on the WhatsApp app — calling works.',
  },
  {
    value: 'coexistence',
    label: 'Number on the WhatsApp Business app',
    hint: 'Keep using the WhatsApp Business app on your phone (coexistence).',
  },
];

export const COEXISTENCE_WARNING =
  "Calling won't work on this number; messages you send from your phone will also appear here.";

export const WHATSAPP_MANAGER_URL = 'https://business.facebook.com/wa/manage/';
export const DISCONNECT_TEXT =
  'The number keeps working on WhatsApp; this app stops receiving its messages until you connect again.';
export const READ_ONLY_HINT = 'Only owners and admins can change WhatsApp numbers.';

export const KIND_LABELS: Record<SimulatorKind, string> = {
  quality_downgrade: 'Quality downgrade',
  quality_upgrade: 'Quality upgrade',
  flagged: 'Number flagged',
  name_approved: 'Display name approved',
  name_rejected: 'Display name rejected',
  restricted: 'Account restricted',
  unrestricted: 'Restriction lifted',
  token_revoked: 'Access revoked (token)',
  inbound_text: 'Incoming message',
  status_delivered: 'Message delivered',
  echo_text: 'Message sent from the phone (echo)',
  history_chunk: 'Chat history received',
  history_declined: 'Chat history declined',
  contacts_sync: 'Contacts received',
  payment_method_added: 'Payment method added',
  phone_number_added: 'Phone number added in WhatsApp Manager',
};

/** Dev only: the simulator exists outside production builds with the fake provider. */
export const showSimulator = (config: WhatsAppConfig | undefined, prod = import.meta.env.PROD) =>
  config?.provider === 'fake' && !prod;
