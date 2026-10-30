import CloseOutlined from '@mui/icons-material/CloseOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';

import { getErrorMessage } from '@/services/api/errors';
import { insightsApi } from '@/services/api/insights';
import type { ChatSummary } from '@/services/api/types';
import { useWsEvent } from '@/services/realtime';
import { formatInAccountTz } from '@/utils/datetime';

import { insightKeys } from './keys';
import { reasonText } from './labels';

/** Inbox "Summary" (Phase 14): earlier chat summaries + "Summarize new messages". */
export function ChatSummaryDrawer({
  conversationId,
  open,
  onClose,
  canSummarize,
  timezone,
}: {
  conversationId: string;
  open: boolean;
  onClose: () => void;
  canSummarize: boolean;
  timezone: string;
}) {
  const queryClient = useQueryClient();
  const summaries = useQuery({
    queryKey: insightKeys.chat(conversationId),
    queryFn: () => insightsApi.chatSummaries(conversationId),
    enabled: open,
  });
  useWsEvent('inbox.conversation.summary', (event) => {
    if (event.data.conversationId === conversationId)
      void queryClient.invalidateQueries({ queryKey: insightKeys.chat(conversationId) });
  });
  const request = useMutation({
    mutationFn: () => insightsApi.requestChatSummary(conversationId),
    meta: { silent: true },
    onSuccess: (list) =>
      queryClient.setQueryData<ChatSummary[]>(insightKeys.chat(conversationId), list),
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  const working = summaries.data?.some((s) => s.status === 'pending') ?? false;

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Stack
        spacing={2}
        sx={{ width: { xs: '100vw', sm: 420 }, p: 2 }}
        role="region"
        aria-label="Chat summary"
      >
        <Stack direction="row" sx={{ alignItems: 'center' }}>
          <Typography variant="h6" component="h2" sx={{ flex: 1 }}>
            Chat summary
          </Typography>
          <IconButton aria-label="Close summary" onClick={onClose}>
            <CloseOutlined />
          </IconButton>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          The AI summarises the messages since the last summary (notes are left out). Each summary
          uses AI credit.
        </Typography>
        {canSummarize && (
          <Button
            variant="contained"
            onClick={() => request.mutate()}
            disabled={request.isPending || working}
            sx={{ alignSelf: 'flex-start' }}
          >
            Summarize new messages
          </Button>
        )}
        {working && <LinearProgress aria-label="Summarising" />}
        <Divider />
        {summaries.isPending && <Skeleton variant="rounded" height={120} />}
        {summaries.isError && (
          <Alert
            severity="error"
            action={<Button onClick={() => void summaries.refetch()}>Retry</Button>}
          >
            {getErrorMessage(summaries.error)}
          </Alert>
        )}
        {summaries.data?.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No summaries yet.
          </Typography>
        )}
        {summaries.data?.map((s) => (
          <Stack key={s.id} spacing={0.5}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                {formatInAccountTz(s.createdAt, timezone)} ·{' '}
                {s.createdBy ? s.createdBy.name : 'when the chat was closed'}
                {s.messageCount ? ` · ${String(s.messageCount)} messages` : ''}
              </Typography>
              <Chip size="small" variant="outlined" label="AI" />
            </Stack>
            {s.status === 'done' && (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {s.summary}
              </Typography>
            )}
            {s.status === 'pending' && (
              <Typography variant="body2" color="text.secondary">
                Working on it…
              </Typography>
            )}
            {(s.status === 'skipped' || s.status === 'failed') && (
              <Typography variant="body2" color="text.secondary">
                Not made: {reasonText(s.reason)}
              </Typography>
            )}
          </Stack>
        ))}
      </Stack>
    </Drawer>
  );
}
