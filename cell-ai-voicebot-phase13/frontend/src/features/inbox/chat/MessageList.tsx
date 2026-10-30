import ArrowDownwardOutlined from '@mui/icons-material/ArrowDownwardOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Fab from '@mui/material/Fab';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { getErrorMessage } from '@/services/api/errors';
import type { InboxConversationDetail, InboxMessage } from '@/services/api/types';

import { useAccountTimezone, useNow } from '../hooks';
import { flattenMessages } from '../optimistic';
import { useMessages } from '../queries';

import { MessageBubble, type BubbleProps } from './MessageBubble';
import { buildTimeline, HIGHLIGHT_MS, NEVER_READ } from './timeline';

/** Within this many pixels of the end counts as "at the bottom". */
const BOTTOM_SLACK = 48;
/** Older messages load when scrolled this close to the top. */
const TOP_SLACK = 80;

type ListBubbleProps = Omit<
  BubbleProps,
  'message' | 'timezone' | 'highlighted' | 'onJump' | 'actions'
> & {
  /** Reply / React under a bubble (none for read-only users). */
  renderActions?: ((m: InboxMessage) => ReactNode) | undefined;
};

const scrollToMessage = (root: HTMLElement | null, id: string) => {
  // ids are ObjectIds / `tmp_<uuid>` — safe inside the selector
  const el = root?.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
  el?.scrollIntoView({ block: 'center' });
  return Boolean(el);
};

/**
 * The chat (`role="log"` "Messages"): older pages load at the top keeping the
 * scroll position, date separators, one unread divider, "New messages" when
 * scrolled up, jump to a quoted message (loads the page `around` it) and
 * "Load newer" back to the latest page.
 */
export function MessageList({
  conversation,
  renderActions,
  ...bubble
}: { conversation: InboxConversationDetail } & ListBubbleProps) {
  const timezone = useAccountTimezone();
  const now = useNow();
  const [around, setAround] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [newCount, setNewCount] = useState(0);
  // the divider stays where it was when the chat opened (the read marker clears the count)
  const [unreadAfter] = useState(() =>
    conversation.unreadCount > 0 ? (conversation.lastReadAt ?? NEVER_READ) : null,
  );
  const query = useMessages(conversation.id, around);
  const messages = flattenMessages(query.data);
  const items = buildTimeline(messages, timezone, now, unreadAfter);
  const hasNewer = Boolean(around && query.data?.pages[0]?.meta.hasNewer);

  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const restoreFromBottom = useRef<number | null>(null);
  const first = messages[0]?.id;
  const last = messages.at(-1);

  // the scroller box is always rendered (also while loading)
  const scrollToBottom = () => {
    const el = scroller.current as HTMLDivElement;
    el.scrollTop = el.scrollHeight;
    atBottom.current = true;
    setNewCount(0);
  };

  // older page loaded: keep the same message under the reader's eyes
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && restoreFromBottom.current !== null) {
      el.scrollTop = el.scrollHeight - restoreFromBottom.current;
      restoreFromBottom.current = null;
    }
  }, [first]);

  // a new last message: follow it when at the bottom (or when it is ours), else count it
  const lastKey = last ? (last.clientId ?? last.id) : null;
  const seenLast = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!lastKey || around) return;
    const firstLoad = seenLast.current === null;
    seenLast.current = lastKey;
    if (firstLoad || atBottom.current || last?.direction === 'out') scrollToBottom();
    else setNewCount((n) => n + 1);
  }, [lastKey, around, last?.direction]);

  // a jump target that needed its own page: scroll once it is rendered
  const pendingJump = useRef<string | null>(null);
  useEffect(() => {
    const id = pendingJump.current;
    if (id && !query.isPending && scrollToMessage(scroller.current, id)) pendingJump.current = null;
  }, [query.isPending, query.data]);

  useEffect(() => {
    if (!highlight) return undefined;
    const timer = setTimeout(() => setHighlight(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlight]);

  const loadOlder = () => {
    const el = scroller.current as HTMLDivElement;
    restoreFromBottom.current = el.scrollHeight - el.scrollTop;
    void query.fetchNextPage();
  };

  const onScroll = () => {
    const el = scroller.current as HTMLDivElement;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK;
    if (atBottom.current) setNewCount(0);
    if (el.scrollTop < TOP_SLACK && query.hasNextPage && !query.isFetchingNextPage) loadOlder();
  };

  const onJump = (id: string) => {
    if (messages.some((m) => m.id === id)) {
      scrollToMessage(scroller.current, id);
      setHighlight(id);
      return;
    }
    seenLast.current = null;
    pendingJump.current = id;
    setHighlight(id);
    setAround(id);
  };

  const backToLatest = () => {
    seenLast.current = null;
    setAround(null);
  };

  return (
    <Box sx={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
      <Box
        ref={scroller}
        role="log"
        aria-label="Messages"
        aria-live="polite"
        onScroll={onScroll}
        sx={{ flex: 1, overflowY: 'auto', px: { xs: 1, sm: 2 }, py: 1, bgcolor: 'action.hover' }}
      >
        {query.isPending ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} aria-label="Loading messages" />
          </Box>
        ) : query.isError ? (
          <Alert
            severity="error"
            sx={{ m: 2 }}
            action={
              <Button color="inherit" size="small" onClick={() => void query.refetch()}>
                Retry
              </Button>
            }
          >
            {getErrorMessage(query.error)}
          </Alert>
        ) : (
          <>
            {query.hasNextPage && (
              <Box sx={{ textAlign: 'center', py: 1 }}>
                <Button size="small" onClick={loadOlder} disabled={query.isFetchingNextPage}>
                  {query.isFetchingNextPage ? 'Loading…' : 'Load older messages'}
                </Button>
              </Box>
            )}
            {messages.length === 0 && (
              <Box
                sx={{ textAlign: 'center', py: 4, color: 'text.secondary', typography: 'body2' }}
              >
                No messages yet.
              </Box>
            )}
            {items.map((item) =>
              item.kind === 'day' ? (
                <Box key={item.key} sx={{ textAlign: 'center', my: 1.5 }}>
                  <Chip size="small" label={item.label} />
                </Box>
              ) : item.kind === 'unread' ? (
                <Divider
                  key={item.key}
                  sx={{ my: 1.5, color: 'success.main', typography: 'caption' }}
                >
                  Unread messages
                </Divider>
              ) : (
                <MessageBubble
                  key={item.key}
                  message={item.message}
                  timezone={timezone}
                  highlighted={highlight === item.message.id}
                  onJump={onJump}
                  actions={renderActions?.(item.message)}
                  {...bubble}
                />
              ),
            )}
            {hasNewer && (
              <Box sx={{ textAlign: 'center', py: 1 }}>
                <Button size="small" onClick={backToLatest}>
                  Load newer messages
                </Button>
              </Box>
            )}
          </>
        )}
      </Box>
      {newCount > 0 && (
        <Fab
          variant="extended"
          size="small"
          color="success"
          onClick={scrollToBottom}
          sx={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)' }}
        >
          <ArrowDownwardOutlined fontSize="small" sx={{ mr: 0.5 }} />
          New messages
        </Fab>
      )}
    </Box>
  );
}
