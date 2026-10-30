import SearchOutlined from '@mui/icons-material/SearchOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import { useState } from 'react';

import { EmptyState } from '@/components/EmptyState';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getErrorMessage } from '@/services/api/errors';
import type { WhatsAppChannel } from '@/services/api/types';

import { useAccountTimezone, useNow } from '../hooks';
import { INBOX_TABS, tabQuery, type InboxTab } from '../labels';
import { conversationRows, useConversations } from '../queries';

import { ConversationRow } from './ConversationRow';

/** Searches need two characters (same rule as the API). */
const MIN_SEARCH = 2;

/** Left pane: search, filter tabs, number select, rows, Load more (region "Conversations"). */
export function ConversationList({
  selectedId,
  channels,
}: {
  selectedId: string | null;
  /** Connected numbers; the select shows when there is more than one. */
  channels: WhatsAppChannel[];
}) {
  const [tab, setTab] = useState<InboxTab>('all');
  const [search, setSearch] = useState('');
  const [channelId, setChannelId] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const query = {
    ...tabQuery(tab),
    ...(channelId ? { channelId } : {}),
    ...(q.length >= MIN_SEARCH ? { q } : {}),
  };
  const list = useConversations(query);
  const rows = conversationRows(list.data);
  const timezone = useAccountTimezone();
  const now = useNow();
  const searching = Boolean(query.q);

  return (
    <Box
      component="section"
      aria-label="Conversations"
      sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', width: '100%' }}
    >
      <Stack spacing={1} sx={{ p: 1.5, pb: 0 }}>
        <TextField
          size="small"
          placeholder="Search name, number or message"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            htmlInput: { 'aria-label': 'Search conversations', type: 'search' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        {channels.length > 1 && (
          <TextField
            select
            size="small"
            label="Number"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
          >
            <MenuItem value="">All numbers</MenuItem>
            {channels.map((ch) => (
              <MenuItem key={ch.id} value={ch.id}>
                {ch.label}
                {ch.displayPhoneNumber ? ` · ${ch.displayPhoneNumber}` : ''}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Stack>
      <Tabs
        value={tab}
        onChange={(_e, value: InboxTab) => setTab(value)}
        variant="scrollable"
        scrollButtons={false}
        aria-label="Conversation filters"
        sx={{ px: 1, minHeight: 40, '& .MuiTab-root': { minHeight: 40, minWidth: 0, px: 1.5 } }}
      >
        {INBOX_TABS.map((t) => (
          <Tab key={t.value} value={t.value} label={t.label} />
        ))}
      </Tabs>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {list.isPending ? (
          <Stack spacing={1} sx={{ p: 2 }} aria-label="Loading conversations">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={56} />
            ))}
          </Stack>
        ) : list.isError ? (
          <Alert
            severity="error"
            sx={{ m: 2 }}
            action={
              <Button color="inherit" size="small" onClick={() => void list.refetch()}>
                Retry
              </Button>
            }
          >
            {getErrorMessage(list.error)}
          </Alert>
        ) : rows.length === 0 ? (
          searching ? (
            <EmptyState
              title="No conversations match your search"
              description="Try a name, part of a number or a word from a message."
            />
          ) : (
            <EmptyState
              title={tab === 'all' ? 'No conversations yet' : 'Nothing here'}
              description={
                tab === 'all'
                  ? 'When customers message your WhatsApp number, their chats appear here.'
                  : 'No conversations match this filter.'
              }
            />
          )
        ) : (
          <>
            <List disablePadding aria-label="Conversation list">
              {rows.map((c) => (
                <ConversationRow
                  key={c.id}
                  conversation={c}
                  selected={c.id === selectedId}
                  timezone={timezone}
                  now={now}
                />
              ))}
            </List>
            {list.hasNextPage && (
              <Box sx={{ textAlign: 'center', py: 1.5 }}>
                <Button
                  size="small"
                  onClick={() => void list.fetchNextPage()}
                  disabled={list.isFetchingNextPage}
                >
                  {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
                </Button>
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
