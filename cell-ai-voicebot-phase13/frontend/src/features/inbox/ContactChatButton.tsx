import ForumOutlined from '@mui/icons-material/ForumOutlined';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { usePermission } from '@/features/auth/hooks';
import { useChannels } from '@/features/whatsapp/queries';
import { inboxApi } from '@/services/api/inbox';

import { inboxKeys } from './keys';
import { REPLY_CHANNEL_STATUSES } from './permissions';
import { useCanReply, useInboxConfig, useStartConversation } from './queries';

/** The latest open (else closed) conversation of a contact, found by its number. */
const findConversation = async (contactId: string, phoneE164: string) => {
  const q = phoneE164.replace(/\D/g, '');
  for (const status of ['open', 'closed'] as const) {
    const page = await inboxApi.conversations({ q, status, limit: 50 });
    const hit = page.data.find((c) => c.contact.id === contactId);
    if (hit) return hit;
  }
  return null;
};

/**
 * Contact page (lazy): "Open chat" when the contact has a conversation,
 * otherwise "Start chat" (number picker when there is more than one). A
 * started chat with a closed window opens with the banner — notes only.
 */
export function ContactChatButton({
  contactId,
  phoneE164,
}: {
  contactId: string;
  phoneE164: string;
}) {
  const navigate = useNavigate();
  const canRead = usePermission('inbox.read');
  const canReply = useCanReply();
  const config = useInboxConfig(canRead);
  const channels = useChannels(canRead && config.isSuccess);
  const existing = useQuery({
    queryKey: [...inboxKeys.all, 'contact-chat', contactId],
    queryFn: () => findConversation(contactId, phoneE164),
    enabled: canRead && config.isSuccess,
    meta: { silent: true },
  });
  const start = useStartConversation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (!canRead || !config.isSuccess || existing.isPending) return null;

  const found = existing.data;
  if (found) {
    return (
      <Button startIcon={<ForumOutlined />} onClick={() => void navigate(`/inbox/${found.id}`)}>
        Open chat
      </Button>
    );
  }
  const numbers = (channels.data?.items ?? []).filter((n) =>
    REPLY_CHANNEL_STATUSES.includes(n.status),
  );
  if (!canReply || numbers.length === 0) return null;
  const startOn = (channelId: string) => {
    setAnchor(null);
    start.mutate({ channelId, contactId }, { onSuccess: (c) => void navigate(`/inbox/${c.id}`) });
  };
  return (
    <>
      <Button
        startIcon={<ForumOutlined />}
        disabled={start.isPending}
        onClick={(e) => {
          const only = numbers.length === 1 ? numbers[0] : undefined;
          if (only) startOn(only.id);
          else setAnchor(e.currentTarget);
        }}
      >
        Start chat
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {numbers.map((n) => (
          <MenuItem key={n.id} onClick={() => startOn(n.id)}>
            {n.label}
            {n.displayPhoneNumber ? ` · ${n.displayPhoneNumber}` : ''}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
