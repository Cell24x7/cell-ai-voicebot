import type { ApiError } from '@/services/api/errors';
import type { InboxFilter } from '@/services/api/inbox';
import type {
  InboxLastMessage,
  InboxMessage,
  InboxMessageOrigin,
  InboxMessageStatus,
  InboxMessageType,
  InboxNotifyMode,
} from '@/services/api/types';

/** List tabs (plan §1p): four filters + the closed list. */
export type InboxTab = InboxFilter | 'closed';
export const INBOX_TABS: { value: InboxTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'mine', label: 'Mine' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'closed', label: 'Closed' },
];

/** A tab → the list query (`closed` lists every closed conversation). */
export const tabQuery = (tab: InboxTab): { status: 'open' | 'closed'; filter: InboxFilter } =>
  tab === 'closed' ? { status: 'closed', filter: 'all' } : { status: 'open', filter: tab };

const TYPE_LABELS: Record<InboxMessageType, string> = {
  text: 'Message',
  template: 'Template',
  image: 'Photo',
  video: 'Video',
  audio: 'Audio',
  document: 'Document',
  sticker: 'Sticker',
  location: 'Location',
  contacts: 'Contact card',
  interactive: 'Interactive message',
  button: 'Button reply',
  reaction: 'Reaction',
  order: 'Order',
  system: 'System message',
  unsupported: 'Unsupported message',
  note: 'Internal note',
  call: 'WhatsApp call',
};

/** Type name; a voice note says so. */
export const messageTypeLabel = (
  type: InboxMessageType,
  media?: Pick<NonNullable<InboxMessage['media']>, 'voice'> | null,
): string => (type === 'audio' && media?.voice ? 'Voice note' : TYPE_LABELS[type]);

/** List row prefix: "You: " for outgoing, nothing for the customer. */
export const previewPrefix = (last: Pick<InboxLastMessage, 'direction' | 'type'>): string =>
  last.type === 'note' ? 'Note: ' : last.direction === 'out' ? 'You: ' : '';

export type TickKind = 'clock' | 'sent' | 'delivered' | 'read' | 'failed';

/** Tick icon of an outgoing message (plan §1p): clock · ✓ · ✓✓ · blue ✓✓ · ⚠. */
export const tickKind = (status: InboxMessageStatus): TickKind | null => {
  switch (status) {
    case 'queued':
    case 'accepted':
      return 'clock';
    case 'sent':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'read':
      return 'read';
    case 'failed':
      return 'failed';
    default:
      return null;
  }
};

const STATUS_LABELS: Record<InboxMessageStatus, string> = {
  received: 'Received',
  queued: 'Queued',
  accepted: 'Queued',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed',
  deleted: 'Deleted',
};

/** Accessible name of the ticks (`aria-label`). */
export const statusLabel = (status: InboxMessageStatus): string => STATUS_LABELS[status];

/** Still waiting for Meta (the chat polls while any outgoing message is in this state). */
export const isPending = (status: InboxMessageStatus): boolean =>
  status === 'queued' || status === 'accepted';

/** Label under messages that did not come from this dashboard. */
export const originLabel = (origin: InboxMessageOrigin): string | null => {
  switch (origin) {
    case 'business_app':
      return 'Sent from the WhatsApp Business app';
    case 'history':
      return 'Imported history';
    case 'system':
      return 'Automatic reply';
    default:
      return null;
  }
};

export const NOTIFY_MODE_LABELS: Record<InboxNotifyMode, string> = {
  assigned_or_all: 'Assigned conversations, or every new one when unassigned',
  assigned_only: 'Only conversations assigned to me',
  off: 'Off',
};

/** System lines (`type: system`). */
export const systemText = (system: InboxMessage['system']): string => {
  switch (system?.kind) {
    case 'customer_changed_number':
    case 'user_changed_number':
      return system.newWaIdLast4
        ? `The customer changed their number to one ending in ${system.newWaIdLast4}.`
        : 'The customer changed their number.';
    case 'customer_identity_changed':
      return "The customer's WhatsApp security code changed.";
    default:
      return 'WhatsApp sent an update about this chat.';
  }
};

/** Banner when the 24-hour window is closed (plan §1p, literal). */
export const WINDOW_CLOSED_TEXT =
  'The 24-hour window is closed. Send a template to start the conversation again.';
/** Block confirmation (Meta only lets a business block someone who wrote in the last 24 hours). */
export const BLOCK_TEXT =
  "They can't message this number until you unblock them. WhatsApp only allows blocking a customer who wrote in the last 24 hours.";
export const READ_ONLY_TEXT = 'You can read this conversation but not reply';

/** User-facing text for inbox API errors. */
export const inboxErrorMessage = (err: ApiError): string => {
  switch (err.code) {
    case 'WHATSAPP_WINDOW_CLOSED':
      return 'The 24-hour window is closed. You can reply when the customer writes again.';
    case 'WHATSAPP_RECIPIENT_BLOCKED':
      return 'You blocked this customer on WhatsApp. Unblock them to reply.';
    case 'WHATSAPP_CHANNEL_NOT_READY':
      return "This WhatsApp number isn't ready to send messages. Check it on the Numbers page.";
    case 'WHATSAPP_NOT_CONFIGURED':
      return "WhatsApp isn't set up on this server.";
    case 'WHATSAPP_MEDIA_TOO_LARGE':
      return 'This file is too large for WhatsApp.';
    case 'WHATSAPP_MEDIA_INVALID': {
      const detail = err.details[0]?.message;
      if (detail === 'type_mismatch') return "This file doesn't match the type you chose.";
      if (detail === 'not_allowed') return "WhatsApp doesn't accept this type of file.";
      return "This file can't be sent on WhatsApp.";
    }
    case 'INBOX_MEDIA_EXPIRED':
      return 'This media is no longer available from WhatsApp (older than 7 days).';
    case 'RATE_LIMITED':
      return "You're sending too fast. Wait a minute and try again.";
    case 'AUTH_IMPERSONATION_BLOCKED':
      return "You can't send or change conversations while viewing as a user.";
    case 'META_API_ERROR': {
      const meta = err.details[0]?.message;
      return meta
        ? `WhatsApp returned an error: ${meta}`
        : 'WhatsApp returned an error. Try again.';
    }
    default:
      return err.message;
  }
};
