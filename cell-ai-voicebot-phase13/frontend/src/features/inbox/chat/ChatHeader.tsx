import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import ContactPageOutlined from '@mui/icons-material/ContactPageOutlined';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

import type { InboxConversationDetail } from '@/services/api/types';
import { formatPhone } from '@/utils/phone';

import { initials, windowLabel, windowState } from '../format';
import { useNow } from '../hooks';

/** Name / number / number label, window countdown (1-minute tick), assignee and actions. */
export function ChatHeader({
  conversation: c,
  onBack,
  onShowDetails,
  assignee,
  actions,
}: {
  conversation: InboxConversationDetail;
  /** Small screens: back to the list. */
  onBack?: (() => void) | undefined;
  /** Medium screens: open the contact panel drawer. */
  onShowDetails?: (() => void) | undefined;
  /** "Assigned to" control. */
  assignee: ReactNode;
  actions?: ReactNode;
}) {
  const now = useNow();
  const win = windowState(c.windowExpiresAt, now);
  const number = formatPhone(c.phoneE164);
  return (
    <Stack
      direction="row"
      spacing={1.5}
      useFlexGap
      sx={{
        px: 2,
        py: 1,
        flexWrap: 'wrap',
        alignItems: 'center',
        borderBottom: 1,
        borderColor: 'divider',
        minHeight: 64,
      }}
    >
      {onBack && (
        <IconButton aria-label="Back to conversations" onClick={onBack} edge="start">
          <ArrowBackOutlined />
        </IconButton>
      )}
      <Avatar aria-hidden>{initials(c.label)}</Avatar>
      {/* the name keeps 160 px: the controls wrap below on narrow chats */}
      <Box sx={{ minWidth: 0, flex: '1 1 160px' }}>
        <Typography
          variant="subtitle1"
          component="h2"
          noWrap
          sx={{ fontWeight: 600 }}
          title={c.label}
        >
          {c.label}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap component="div">
          {c.label === number ? '' : `${number} · `}
          {c.profileName && c.profileName !== c.label ? `~${c.profileName} · ` : ''}
          {c.channel ? `via ${c.channel.label}` : 'Number removed'}
        </Typography>
      </Box>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1, justifyContent: 'flex-end' }}
      >
        <Tooltip
          title={
            win.open
              ? 'Free-form replies are allowed until the 24-hour window ends.'
              : 'The customer has not written in the last 24 hours.'
          }
        >
          <Chip
            size="small"
            icon={<AccessTimeOutlined />}
            color={win.open ? 'success' : 'default'}
            variant={win.open ? 'filled' : 'outlined'}
            label={windowLabel(win)}
            aria-label={`Window ${windowLabel(win)}`}
          />
        </Tooltip>
        {c.status === 'closed' && <Chip size="small" label="Closed" variant="outlined" />}
        {assignee}
        {onShowDetails && (
          <IconButton aria-label="Contact details" onClick={onShowDetails}>
            <ContactPageOutlined />
          </IconButton>
        )}
        {actions}
      </Stack>
    </Stack>
  );
}
