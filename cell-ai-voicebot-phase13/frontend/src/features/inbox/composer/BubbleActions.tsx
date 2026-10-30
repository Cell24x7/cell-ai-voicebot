import AddReactionOutlined from '@mui/icons-material/AddReactionOutlined';
import ReplyOutlined from '@mui/icons-material/ReplyOutlined';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import { useState } from 'react';

import type { InboxMessage } from '@/services/api/types';

import { QUICK_REACTIONS } from './emoji';

/** Reply / React under a bubble; tapping our current reaction removes it. */
export function BubbleActions({
  message,
  onReply,
  onReact,
}: {
  message: InboxMessage;
  onReply: (m: InboxMessage) => void;
  /** `''` removes our reaction. */
  onReact: (m: InboxMessage, emoji: string) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const mine = message.reactions.find((r) => r.by === 'agent')?.emoji ?? null;
  return (
    <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end', mt: 0.25 }}>
      <IconButton size="small" aria-label="Reply" onClick={() => onReply(message)}>
        <ReplyOutlined fontSize="small" />
      </IconButton>
      <IconButton size="small" aria-label="React" onClick={(e) => setAnchor(e.currentTarget)}>
        <AddReactionOutlined fontSize="small" />
      </IconButton>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Stack
          direction="row"
          spacing={0.5}
          sx={{ p: 0.5 }}
          role="group"
          aria-label="Reactions to send"
        >
          {QUICK_REACTIONS.map((emoji) => (
            <ButtonBase
              key={emoji}
              aria-label={mine === emoji ? `Remove ${emoji}` : `React ${emoji}`}
              aria-pressed={mine === emoji}
              onClick={() => {
                setAnchor(null);
                onReact(message, mine === emoji ? '' : emoji);
              }}
              sx={{
                fontSize: 22,
                p: 0.5,
                borderRadius: 1,
                bgcolor: mine === emoji ? 'action.selected' : undefined,
              }}
            >
              {emoji}
            </ButtonBase>
          ))}
        </Stack>
      </Popover>
    </Stack>
  );
}
