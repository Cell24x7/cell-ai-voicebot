import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import { usePermission } from '@/features/auth/hooks';
import { ContactFormDialog } from '@/features/contacts/ContactFormDialog';
import { useCustomFields } from '@/features/contacts/queries';
import { CallButton } from '@/features/whatsapp-calling/live/CallButton';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import type { InboxMessage } from '@/services/api/types';

import { BubbleActions } from '../composer/BubbleActions';
import { Composer } from '../composer/Composer';
import { windowState } from '../format';
import { inboxErrorMessage } from '../labels';
import { isOptimistic } from '../optimistic';
import {
  useCanAssign,
  useCanReply,
  useConversation,
  useConversationTopic,
  useMarkRead,
  useRetryMessage,
  useSendMessage,
} from '../queries';

import { ChatHeader } from './ChatHeader';
import { AssignSelect, ConversationActions } from './ConversationActions';
import type { SharedContact } from './MessageCards';
import { MessageList } from './MessageList';

/** Messages one can reply / react to (not notes, system lines, deleted or unsent ones). */
const actionable = (m: InboxMessage) =>
  m.type !== 'note' && m.type !== 'system' && m.status !== 'deleted' && !isOptimistic(m);

/**
 * Middle pane (region "Chat with <name>"): live topic, read marker on open,
 * header, messages (Reply / React), typing indicator, composer, "Add contact" from cards.
 */
export function ChatView({
  conversationId,
  onBack,
  onShowDetails,
}: {
  conversationId: string;
  onBack?: (() => void) | undefined;
  onShowDetails?: (() => void) | undefined;
}) {
  const detail = useConversation(conversationId);
  const { typingName } = useConversationTopic(conversationId);
  useMarkRead(conversationId, detail.data?.unreadCount ?? 0);
  const canReply = useCanReply(detail.data?.channel ?? null);
  const canAssign = useCanAssign();
  const canAddContacts = usePermission('contacts.write');
  const retry = useRetryMessage(conversationId);
  const react = useSendMessage(conversationId);
  const [card, setCard] = useState<SharedContact | null>(null);
  const [replyTo, setReplyTo] = useState<InboxMessage | null>(null);
  const fields = useCustomFields();

  if (detail.isPending) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress aria-label="Loading conversation" />
      </Box>
    );
  }
  if (detail.isError) {
    return (
      <Alert
        severity="error"
        sx={{ m: 2 }}
        action={
          <Button color="inherit" size="small" onClick={() => void detail.refetch()}>
            Retry
          </Button>
        }
      >
        {toApiError(detail.error).status === 404
          ? 'This conversation was not found.'
          : getErrorMessage(detail.error)}
      </Alert>
    );
  }
  const c = detail.data;
  // replies and reactions are WhatsApp messages: open window, not blocked
  const canAct = canReply && !c.blocked && windowState(c.windowExpiresAt).open;
  const renderActions = canAct
    ? (m: InboxMessage) =>
        actionable(m) ? (
          <BubbleActions
            message={m}
            onReply={setReplyTo}
            onReact={(target, emoji) =>
              react.mutate({
                clientId: crypto.randomUUID(),
                type: 'reaction',
                messageId: target.id,
                emoji,
              })
            }
          />
        ) : null
    : undefined;
  return (
    <Box
      component="section"
      aria-label={`Chat with ${c.label}`}
      sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      <ChatHeader
        conversation={c}
        onBack={onBack}
        onShowDetails={onShowDetails}
        assignee={<AssignSelect conversation={c} />}
        actions={
          <>
            {c.channel && !c.contact.deleted && (
              <CallButton
                channelId={c.channelId}
                contactId={c.contact.id}
                phoneE164={c.phoneE164}
                label={c.label}
                conversationId={c.id}
                windowExpiresAt={c.windowExpiresAt}
              />
            )}
            <ConversationActions conversation={c} />
          </>
        }
      />
      {retry.isError && (
        <Alert severity="error" onClose={() => retry.reset()} sx={{ borderRadius: 0 }}>
          {inboxErrorMessage(toApiError(retry.error))}
        </Alert>
      )}
      <MessageList
        conversation={c}
        canReply={canReply}
        canAssign={canAssign}
        onRetry={(m) => retry.mutate(m)}
        onAddContact={canAddContacts ? setCard : undefined}
        renderActions={renderActions}
      />
      {typingName && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 0.5 }} role="status">
          {typingName} is typing…
        </Typography>
      )}
      <Composer conversation={c} replyTo={replyTo} onClearReply={() => setReplyTo(null)} />
      {card && (
        <ContactFormDialog
          open
          onClose={() => setCard(null)}
          fields={fields.data ?? []}
          initial={{
            phone: card.phones[0]?.phone,
            name: card.name,
            email: card.emails[0]?.email ?? '',
          }}
        />
      )}
    </Box>
  );
}
