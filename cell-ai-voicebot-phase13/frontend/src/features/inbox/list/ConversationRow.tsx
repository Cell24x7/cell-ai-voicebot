import type { SvgIconComponent } from '@mui/icons-material';
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import EmojiEmotionsOutlined from '@mui/icons-material/EmojiEmotionsOutlined';
import MicOutlined from '@mui/icons-material/MicOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import PhotoOutlined from '@mui/icons-material/PhotoOutlined';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import StickyNote2Outlined from '@mui/icons-material/StickyNote2Outlined';
import VideocamOutlined from '@mui/icons-material/VideocamOutlined';
import Avatar from '@mui/material/Avatar';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemButton from '@mui/material/ListItemButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router';

import type { InboxConversation, InboxMessageType } from '@/services/api/types';

import { initials, listTimeLabel, windowState } from '../format';
import { previewPrefix } from '../labels';

const TYPE_ICONS: Partial<Record<InboxMessageType, SvgIconComponent>> = {
  image: PhotoOutlined,
  video: VideocamOutlined,
  audio: MicOutlined,
  document: DescriptionOutlined,
  sticker: EmojiEmotionsOutlined,
  location: PlaceOutlined,
  contacts: PersonOutlined,
  note: StickyNote2Outlined,
};

/** One conversation in the list (accessible name "Conversation with <name>"). */
export function ConversationRow({
  conversation: c,
  selected,
  timezone,
  now,
}: {
  conversation: InboxConversation;
  selected: boolean;
  timezone: string;
  now: number;
}) {
  const last = c.lastMessage;
  const Icon = last ? TYPE_ICONS[last.type] : undefined;
  const unread = c.unreadCount > 0;
  const open = c.status === 'open' && windowState(c.windowExpiresAt, now).open;
  const preview = c.match?.snippet ?? (last ? `${previewPrefix(last)}${last.preview}` : '');
  return (
    <ListItem disablePadding aria-label={`Conversation with ${c.label}`}>
      <ListItemButton
        component={RouterLink}
        to={`/inbox/${c.id}`}
        selected={selected}
        aria-current={selected ? 'page' : undefined}
        sx={{ alignItems: 'flex-start', py: 1.25 }}
      >
        <ListItemAvatar sx={{ mt: 0.5 }}>
          <Avatar aria-hidden sx={{ bgcolor: unread ? 'success.main' : 'grey.500' }}>
            {initials(c.label)}
          </Avatar>
        </ListItemAvatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
            <Typography
              noWrap
              sx={{ flex: 1, minWidth: 0, fontWeight: unread ? 700 : 500 }}
              title={c.label}
            >
              {c.label}
            </Typography>
            {last && (
              <Typography
                variant="caption"
                color={unread ? 'success.main' : 'text.secondary'}
                component="time"
                dateTime={last.at}
              >
                {listTimeLabel(last.at, timezone, now)}
              </Typography>
            )}
          </Stack>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mt: 0.25 }}>
            {Icon && !c.match && (
              <Icon fontSize="small" color="action" aria-hidden sx={{ fontSize: 16 }} />
            )}
            <Typography
              variant="body2"
              color="text.secondary"
              noWrap
              sx={{ flex: 1, minWidth: 0, fontWeight: unread ? 600 : 400 }}
            >
              {preview}
            </Typography>
            {open && (
              <Tooltip describeChild title="24-hour window open">
                <AccessTimeOutlined
                  titleAccess="Window open"
                  color="success"
                  sx={{ fontSize: 16 }}
                />
              </Tooltip>
            )}
            {c.assignedTo && (
              <Tooltip describeChild title={`Assigned to ${c.assignedTo.name || 'a teammate'}`}>
                <Avatar
                  aria-label={`Assigned to ${c.assignedTo.name || 'a teammate'}`}
                  sx={{ width: 20, height: 20, fontSize: 11 }}
                >
                  {initials(c.assignedTo.name || '?')}
                </Avatar>
              </Tooltip>
            )}
            {unread && (
              <Badge
                color="success"
                badgeContent={c.unreadCount}
                max={99}
                aria-label={`${String(c.unreadCount)} unread`}
                sx={{ '& .MuiBadge-badge': { position: 'static', transform: 'none' } }}
              />
            )}
          </Stack>
        </Box>
      </ListItemButton>
    </ListItem>
  );
}
