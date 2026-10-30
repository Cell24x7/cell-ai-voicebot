import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router';

import { useInboxSummary } from './summary';

/** Dashboard (lazy): "Inbox: N unread · M assigned to you" → /inbox; hidden when WhatsApp is off. */
export function InboxDashboardCard() {
  const summary = useInboxSummary();
  if (!summary.data) return null;
  const { unreadConversations, assignedToMeUnread, open } = summary.data;
  return (
    <Card variant="outlined" sx={{ height: '100%' }} component="section" aria-label="Inbox">
      <CardContent>
        <Stack
          direction="row"
          sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}
        >
          <Typography variant="subtitle1">Inbox</Typography>
          <Link component={RouterLink} to="/inbox" variant="body2">
            Open inbox
          </Link>
        </Stack>
        <Typography variant="body2">
          Inbox: {unreadConversations} unread · {assignedToMeUnread} assigned to you
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {open} open {open === 1 ? 'conversation' : 'conversations'}
        </Typography>
      </CardContent>
    </Card>
  );
}
