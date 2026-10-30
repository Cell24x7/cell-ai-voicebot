import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import { EMOJI_GROUPS, pushRecentEmoji, readRecentEmojis } from './emoji';

/** Emoji grid (lazy chunk) with the recently used ones first. */
export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [recent, setRecent] = useState(readRecentEmojis);
  const groups = recent.length
    ? [{ label: 'Recent', emojis: recent }, ...EMOJI_GROUPS]
    : EMOJI_GROUPS;
  return (
    <Box
      sx={{ p: 1, width: 296, maxHeight: 320, overflowY: 'auto' }}
      role="dialog"
      aria-label="Emoji"
    >
      {groups.map((g) => (
        <Box key={g.label} sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {g.label}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)' }}>
            {g.emojis.map((emoji) => (
              <ButtonBase
                key={`${g.label}-${emoji}`}
                aria-label={emoji}
                onClick={() => {
                  setRecent(pushRecentEmoji(emoji));
                  onPick(emoji);
                }}
                sx={{
                  fontSize: 22,
                  borderRadius: 1,
                  p: 0.5,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                {emoji}
              </ButtonBase>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
