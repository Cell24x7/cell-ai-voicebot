import CloseOutlined from '@mui/icons-material/CloseOutlined';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';

import { CopyButton } from '@/components/CopyButton';
import { RelativeTime } from '@/components/RelativeTime';
import { useCustomFields } from '@/features/contacts/queries';
import { CallButton } from '@/features/whatsapp-calling/live/CallButton';
import { CallingPanelSection } from '@/features/whatsapp-calling/panel/CallingPanelSection';
import { useCanCall } from '@/features/whatsapp-calling/queries';
import { formatFieldValue } from '@/utils/format';
import { formatPhone } from '@/utils/phone';

import { useContactPanel, useConversation } from '../queries';

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <Box>
    <Typography variant="overline" color="text.secondary">
      {title}
    </Typography>
    {children}
  </Box>
);

/**
 * Right pane (region "Contact details"): the Phase 3 contact (name, number,
 * WhatsApp name, tags, lists, fields, DND / opt-out), number + assignee,
 * WhatsApp calling (Phase 12: permission, request, last calls), recent calls and other chats.
 */
export function ContactPanel({
  conversationId,
  onClose,
}: {
  conversationId: string;
  /** Drawer mode: a close button. */
  onClose?: (() => void) | undefined;
}) {
  const panel = useContactPanel(conversationId);
  const detail = useConversation(conversationId);
  const fields = useCustomFields();
  const contact = panel.data?.contact;
  const conv = detail.data;
  const labelOf = new Map((fields.data ?? []).map((f) => [f.key, f]));
  const canCallHere = useCanCall();

  return (
    <Box
      component="section"
      aria-label="Contact details"
      sx={{ p: 2, overflowY: 'auto', height: '100%' }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          Contact details
        </Typography>
        {onClose && (
          <IconButton aria-label="Close contact details" onClick={onClose} size="small">
            <CloseOutlined fontSize="small" />
          </IconButton>
        )}
      </Stack>
      {panel.isPending ? (
        <Skeleton variant="rounded" height={80} />
      ) : !panel.data ? (
        <Typography variant="body2" color="error">
          Contact details could not be loaded.
        </Typography>
      ) : (
        <Stack spacing={2} divider={<Divider flexItem />}>
          {contact ? (
            <Stack spacing={0.5}>
              <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                {contact.name ?? 'No name'}
              </Typography>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <Typography variant="body2">{formatPhone(contact.phoneE164)}</Typography>
                <CopyButton value={contact.phoneE164} label="Copy number" />
              </Stack>
              {contact.email && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ overflowWrap: 'anywhere' }}
                >
                  {contact.email}
                </Typography>
              )}
              {contact.whatsapp?.profileName && (
                <Typography variant="body2" color="text.secondary">
                  WhatsApp name: {contact.whatsapp.profileName}
                </Typography>
              )}
              {contact.whatsapp?.lastInboundAt && (
                <Typography variant="caption" color="text.secondary">
                  Last message from them <RelativeTime value={contact.whatsapp.lastInboundAt} />
                </Typography>
              )}
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, pt: 0.5 }}>
                {contact.optedOutAt && <Chip size="small" color="warning" label="Opted out" />}
                {contact.dnd && <Chip size="small" color="warning" label="DND" />}
                {contact.whatsapp?.blocked && <Chip size="small" color="error" label="Blocked" />}
              </Stack>
              <Link component={RouterLink} to={`/contacts/c/${contact.id}`} variant="body2">
                Open contact
              </Link>
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              This contact was deleted. The chat is kept.
            </Typography>
          )}

          {conv && (
            <Section title="Conversation">
              <Typography variant="body2">
                Number: {conv.channel ? conv.channel.label : 'Removed'}
              </Typography>
              <Typography variant="body2">
                Assigned to: {conv.assignedTo?.name ?? 'Nobody'}
              </Typography>
            </Section>
          )}

          {contact && (contact.tags.length > 0 || contact.lists.length > 0) && (
            <Section title="Tags and lists">
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                {contact.tags.map((t) => (
                  <Chip key={`t-${t}`} size="small" label={t} />
                ))}
                {contact.lists.map((l) => (
                  <Chip key={`l-${l.id}`} size="small" variant="outlined" label={l.name} />
                ))}
              </Stack>
            </Section>
          )}

          {contact && Object.keys(contact.variables).length > 0 && (
            <Section title="Fields">
              {Object.entries(contact.variables).map(([key, value]) => {
                const f = labelOf.get(key);
                return (
                  <Typography key={key} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                    <Box component="span" sx={{ color: 'text.secondary' }}>
                      {f?.label ?? key}:
                    </Box>{' '}
                    {formatFieldValue(
                      f?.type ?? 'text',
                      typeof value === 'number' ? value : String(value),
                      formatPhone,
                    )}
                  </Typography>
                );
              })}
            </Section>
          )}

          {contact && conv?.channel && (
            <Section title="WhatsApp calling">
              <CallingPanelSection
                channelId={conv.channel.id}
                contactId={contact.id}
                windowExpiresAt={conv.windowExpiresAt}
                initial={panel.data.callPermission}
                actions={
                  canCallHere ? (
                    <CallButton
                      channelId={conv.channel.id}
                      contactId={contact.id}
                      phoneE164={contact.phoneE164}
                      label={conv.label}
                      conversationId={conv.id}
                      windowExpiresAt={conv.windowExpiresAt}
                    />
                  ) : undefined
                }
              />
            </Section>
          )}

          <Section title="Recent calls">
            {panel.data.recentCalls.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No calls yet.
              </Typography>
            ) : (
              panel.data.recentCalls.map((call) => (
                <Link
                  key={call.id}
                  component={RouterLink}
                  to={`/calls/${call.id}`}
                  variant="body2"
                  sx={{ display: 'block' }}
                >
                  {call.status.replace(/_/g, ' ')}
                  {call.disposition ? ` · ${call.disposition.replace(/_/g, ' ')}` : ''}
                  {call.durationSec !== null ? ` · ${String(call.durationSec)} s` : ''}
                </Link>
              ))
            )}
          </Section>

          {panel.data.otherConversations.length > 0 && (
            <Section title="Other chats">
              {panel.data.otherConversations.map((o) => (
                <Link
                  key={o.id}
                  component={RouterLink}
                  to={`/inbox/${o.id}`}
                  variant="body2"
                  sx={{ display: 'block' }}
                >
                  {o.channelLabel} · {o.status}
                </Link>
              ))}
            </Section>
          )}
        </Stack>
      )}
    </Box>
  );
}
