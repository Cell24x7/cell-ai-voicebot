import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router';

import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { ChatView } from '@/features/inbox/chat/ChatView';
import { ConversationList } from '@/features/inbox/list/ConversationList';
import { ContactPanel } from '@/features/inbox/panel/ContactPanel';
import { useInboxConfig, useInboxLiveUpdates } from '@/features/inbox/queries';
import { useChannels } from '@/features/whatsapp/queries';
import { useCallingLiveUpdates } from '@/features/whatsapp-calling/queries';
import { toApiError } from '@/services/api/errors';

const LIST_WIDTH = 300;
const PANEL_WIDTH = 280;

/**
 * `/inbox`, `/inbox/:conversationId` (lazy chunk). Three panes from 1200 px
 * (list · chat · contact details), two from 900 px (details in a drawer),
 * stacked below (list → chat → details) with back buttons.
 */
export function InboxPage() {
  const { conversationId = null } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('lg'));
  const medium = useMediaQuery(theme.breakpoints.up('md'));
  const [detailsOpen, setDetailsOpen] = useState(false);
  useInboxLiveUpdates();
  useCallingLiveUpdates();
  const config = useInboxConfig();
  const channels = useChannels();

  const header = (
    <PageHeader title="Inbox" subtitle="WhatsApp conversations with your customers." />
  );
  if (config.isError && toApiError(config.error).code === 'WHATSAPP_NOT_CONFIGURED') {
    return (
      <>
        {header}
        <EmptyState
          title="WhatsApp isn't set up on this server"
          description="Ask your platform admin to turn WhatsApp on."
        />
      </>
    );
  }
  if (channels.isPending) {
    return (
      <>
        {header}
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress aria-label="Loading inbox" />
        </Box>
      </>
    );
  }
  // the list of numbers failing does not block the inbox (it only feeds the number select)
  const numbers = channels.data?.items;
  if (numbers?.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="Connect a WhatsApp number first"
          description="Customer chats appear here once a WhatsApp Business number is connected."
          action={
            <Button variant="contained" component={RouterLink} to="/whatsapp/numbers">
              Connect a number
            </Button>
          }
        />
      </>
    );
  }
  const connected = (numbers ?? []).filter((n) => n.status !== 'disconnected');

  const list = <ConversationList selectedId={conversationId} channels={connected} />;
  const chat = conversationId ? (
    <ChatView
      key={conversationId}
      conversationId={conversationId}
      onBack={medium ? undefined : () => void navigate('/inbox')}
      onShowDetails={wide ? undefined : () => setDetailsOpen(true)}
    />
  ) : (
    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <EmptyState
        title="Select a conversation"
        description="Pick a chat on the left to read and reply."
      />
    </Box>
  );
  const drawer = conversationId && !wide && (
    <Drawer
      anchor="right"
      open={detailsOpen}
      onClose={() => setDetailsOpen(false)}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: PANEL_WIDTH } } } }}
    >
      <ContactPanel conversationId={conversationId} onClose={() => setDetailsOpen(false)} />
    </Drawer>
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: { xs: 'calc(100vh - 56px - 32px)', sm: 'calc(100vh - 64px - 48px)' },
        minHeight: 480,
      }}
    >
      {header}
      <Paper variant="outlined" sx={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        {medium ? (
          <>
            <Box sx={{ width: LIST_WIDTH, flexShrink: 0, borderRight: 1, borderColor: 'divider' }}>
              {list}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0, display: 'flex' }}>{chat}</Box>
            {wide && conversationId && (
              <>
                <Divider orientation="vertical" flexItem />
                <Box sx={{ width: PANEL_WIDTH, flexShrink: 0 }}>
                  <ContactPanel conversationId={conversationId} />
                </Box>
              </>
            )}
          </>
        ) : (
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex' }}>{conversationId ? chat : list}</Box>
        )}
      </Paper>
      {drawer}
    </Box>
  );
}
