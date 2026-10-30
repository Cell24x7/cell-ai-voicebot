import ViewQuiltOutlined from '@mui/icons-material/ViewQuiltOutlined';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router';

import { usePermission } from '@/features/auth/hooks';
import { REPLY_CHANNEL_STATUSES } from '@/features/inbox/permissions';
import { useCanReply } from '@/features/inbox/queries';
import { useChannels, useWhatsAppConfig } from '@/features/whatsapp/queries';

import type { SendContact } from './resolve';

const SendTemplateDialog = lazy(async () => ({
  default: (await import('./SendTemplateDialog')).SendTemplateDialog,
}));

/**
 * Contact page (lazy): **Send template** — picks the number when there is more
 * than one, then opens (or creates) the chat with the template.
 */
export function ContactTemplateButton({ contact }: { contact: SendContact }) {
  const navigate = useNavigate();
  const canRead = usePermission('templates.read');
  const canReply = useCanReply();
  const config = useWhatsAppConfig(canRead && canReply);
  const channels = useChannels(Boolean(config.data?.enabled));
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const numbers = (channels.data?.items ?? []).filter((n) =>
    REPLY_CHANNEL_STATUSES.includes(n.status),
  );
  if (!canRead || !canReply || numbers.length === 0) return null;
  return (
    <>
      <Button
        startIcon={<ViewQuiltOutlined />}
        onClick={(e) => {
          const only = numbers.length === 1 ? numbers[0] : undefined;
          if (only) setChannelId(only.id);
          else setAnchor(e.currentTarget);
        }}
      >
        Send template
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {numbers.map((n) => (
          <MenuItem
            key={n.id}
            onClick={() => {
              setAnchor(null);
              setChannelId(n.id);
            }}
          >
            {n.label}
            {n.displayPhoneNumber ? ` · ${n.displayPhoneNumber}` : ''}
          </MenuItem>
        ))}
      </Menu>
      {channelId && (
        <Suspense fallback={null}>
          <SendTemplateDialog
            open
            channelId={channelId}
            contact={contact}
            target={{ kind: 'start' }}
            onClose={() => setChannelId(null)}
            onSent={({ conversation }) => {
              if (conversation) void navigate(`/inbox/${conversation.id}`);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
