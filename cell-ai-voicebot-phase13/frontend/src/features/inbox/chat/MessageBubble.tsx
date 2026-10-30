import ForwardOutlined from '@mui/icons-material/ForwardOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

import { TemplateButtons } from '@/features/templates/send/TemplateBubble';
import { CallBubbleContent } from '@/features/whatsapp-calling/bubbles';
import type { InboxMessage } from '@/services/api/types';

import { timeLabel } from '../format';
import { originLabel, systemText } from '../labels';

import { MediaContent } from './MediaContent';
import {
  ContactsCard,
  InteractiveContent,
  LocationCard,
  OrderCard,
  ReferralCard,
  ReplyQuote,
  type SharedContact,
} from './MessageCards';
import { MessageText } from './MessageText';
import { StatusTicks } from './StatusTicks';

export interface BubbleProps {
  message: InboxMessage;
  timezone: string;
  /** `inbox.reply`: Retry on failed sends. */
  canReply: boolean;
  /** `inbox.assign`: Retry on failed downloads. */
  canAssign: boolean;
  /** Briefly outlined after jumping to it. */
  highlighted?: boolean;
  onJump: (messageId: string) => void;
  onRetry: (message: InboxMessage) => void;
  onAddContact?: ((card: SharedContact) => void) | undefined;
  /** Reply / react buttons (composer, T10.9). */
  actions?: ReactNode;
}

const Caption = ({ children }: { children: ReactNode }) => (
  <Typography variant="caption" color="text.secondary" component="div">
    {children}
  </Typography>
);

/** The content of one message by type (text is a caption for media). */
function Content({
  message: m,
  canAssign,
  onAddContact,
}: Pick<BubbleProps, 'message' | 'canAssign' | 'onAddContact'>) {
  switch (m.type) {
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'sticker':
      return (
        <Stack spacing={0.5}>
          {m.media && <MediaContent message={m} canRetry={canAssign} />}
          {m.text && <MessageText text={m.text} />}
        </Stack>
      );
    case 'location':
      return m.location ? <LocationCard location={m.location} /> : <Caption>Location</Caption>;
    case 'contacts':
      return <ContactsCard contacts={m.contacts ?? []} onAdd={onAddContact} />;
    case 'interactive':
      return m.interactive ? (
        <InteractiveContent interactive={m.interactive} />
      ) : (
        <Caption>Interactive message</Caption>
      );
    case 'button':
      return (
        <Stack spacing={0.25}>
          <Caption>Tapped a button</Caption>
          <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
            {m.button?.text ?? m.button?.payload ?? 'Button'}
          </Typography>
        </Stack>
      );
    case 'order':
      return m.order ? <OrderCard order={m.order} text={m.text} /> : <Caption>Order</Caption>;
    case 'call':
      return m.call ? <CallBubbleContent call={m.call} /> : <Caption>WhatsApp call</Caption>;
    case 'template':
      return (
        <Stack spacing={0.5}>
          <Caption>Template · {m.template?.name ?? 'WhatsApp template'}</Caption>
          {m.media && <MediaContent message={m} canRetry={canAssign} />}
          {m.location && <LocationCard location={m.location} />}
          {m.text && <MessageText text={m.text} />}
          {m.template && <TemplateButtons templateId={m.template.templateId} />}
        </Stack>
      );
    default:
      return m.text ? <MessageText text={m.text} /> : null;
  }
}

/** One message: labels, quote, content, sender · time · ticks, reactions. */
export function MessageBubble(props: BubbleProps) {
  const { message: m, timezone, canReply, highlighted = false, onJump, onRetry, actions } = props;
  const out = m.direction === 'out';
  const anchor = {
    id: `msg-${m.id}`,
    'data-message-id': m.id,
    'data-highlighted': highlighted ? 'true' : undefined,
  };

  if (m.type === 'system') {
    return (
      <Box {...anchor} sx={{ textAlign: 'center', my: 1 }}>
        <Typography
          variant="caption"
          sx={{
            px: 1.5,
            py: 0.5,
            borderRadius: 2,
            bgcolor: 'action.hover',
            display: 'inline-block',
          }}
        >
          {systemText(m.system)}
        </Typography>
      </Box>
    );
  }

  const note = m.type === 'note';
  const deleted = m.status === 'deleted';
  // a call bubble is the call itself, not an automatic reply
  const origin = m.type === 'call' ? null : originLabel(m.origin);
  const forwarded = m.context?.forwarded || m.context?.frequentlyForwarded;
  const failed = out && m.status === 'failed';

  return (
    <Box
      {...anchor}
      sx={{ display: 'flex', justifyContent: out ? 'flex-end' : 'flex-start', my: 0.5 }}
    >
      <Box
        aria-label={note ? 'Internal note' : undefined}
        sx={(theme) => ({
          maxWidth: { xs: '88%', md: '70%' },
          minWidth: 120,
          px: 1.25,
          py: 0.75,
          borderRadius: 2,
          boxShadow: 1,
          bgcolor: note
            ? alpha(theme.palette.warning.main, 0.18)
            : out
              ? alpha(theme.palette.success.main, 0.14)
              : 'background.paper',
          outline: highlighted ? `2px solid ${theme.palette.info.main}` : 'none',
          transition: 'outline-color 0.3s',
          '&:hover .bubble-actions, &:focus-within .bubble-actions': { opacity: 1 },
        })}
      >
        {note && (
          <Typography
            variant="caption"
            color="warning.dark"
            component="div"
            sx={{ fontWeight: 700 }}
          >
            Internal note
          </Typography>
        )}
        {origin && <Caption>{origin}</Caption>}
        {forwarded && (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <ForwardOutlined sx={{ fontSize: 14 }} color="action" aria-hidden />
            <Caption>
              {m.context?.frequentlyForwarded ? 'Forwarded many times' : 'Forwarded'}
            </Caption>
          </Stack>
        )}
        {m.context?.referral && <ReferralCard referral={m.context.referral} />}
        {m.replyTo && <ReplyQuote replyTo={m.replyTo} onJump={onJump} />}

        {deleted ? (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            This message was deleted
          </Typography>
        ) : m.type === 'unsupported' ? (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            This type of message can&apos;t be shown here. Open WhatsApp on the phone to see it.
          </Typography>
        ) : (
          <Content message={m} canAssign={props.canAssign} onAddContact={props.onAddContact} />
        )}

        <Stack
          direction="row"
          spacing={0.5}
          sx={{ justifyContent: 'flex-end', alignItems: 'center', mt: 0.25 }}
        >
          {out && m.sentBy && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ mr: 'auto' }}>
              {m.sentBy.name}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" component="time" dateTime={m.at}>
            {timeLabel(m.at, timezone)}
          </Typography>
          {out && !note && <StatusTicks message={m} />}
        </Stack>
        {failed && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
            <Typography variant="caption" color="error" sx={{ flex: 1, overflowWrap: 'anywhere' }}>
              {m.error?.reason ?? 'Not delivered'}
            </Typography>
            {canReply && (
              <Button size="small" color="error" onClick={() => onRetry(m)}>
                Retry
              </Button>
            )}
          </Stack>
        )}
        {m.reactions.length > 0 && (
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} aria-label="Reactions">
            {m.reactions.map((r) => (
              <Box
                key={`${r.by}-${r.emoji}`}
                component="span"
                title={r.by === 'customer' ? 'Customer reacted' : 'You reacted'}
                sx={{ px: 0.75, borderRadius: 2, bgcolor: 'action.selected', fontSize: 14 }}
              >
                {r.emoji}
              </Box>
            ))}
          </Stack>
        )}
        {actions && (
          <Box
            className="bubble-actions"
            sx={{ opacity: { xs: 1, md: 0 }, transition: 'opacity 0.2s' }}
          >
            {actions}
          </Box>
        )}
      </Box>
    </Box>
  );
}
