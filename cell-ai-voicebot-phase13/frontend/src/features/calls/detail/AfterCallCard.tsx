import Alert from '@mui/material/Alert';
import Chip, { type ChipProps } from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router';

import { usePermission } from '@/features/auth/hooks';
import { integrationKeys } from '@/features/integrations/keys';
import { getErrorMessage } from '@/services/api/errors';
import { outcomeRulesApi } from '@/services/api/outcome-rules';
import type { AfterCallMessage } from '@/services/api/types';
import { formatInAccountTz } from '@/utils/datetime';

import { reasonOf } from './after-call';

/** While a message waits, the card re-checks (the send runs on the worker). */
export const AFTER_CALL_POLL_MS = 15_000;

const STATUS: Record<AfterCallMessage['status'], { label: string; color: ChipProps['color'] }> = {
  scheduled: { label: 'Scheduled', color: 'info' },
  sent: { label: 'Sent', color: 'success' },
  skipped: { label: 'Skipped', color: 'default' },
  failed: { label: 'Failed', color: 'error' },
};

/** "After the call": WhatsApp messages from flow steps and outcome rules, with why any was skipped. */
export function AfterCallCard({ callId, timezone }: { callId: string; timezone: string }) {
  const canSeeInbox = usePermission('inbox.read');
  const rows = useQuery({
    queryKey: integrationKeys.afterCall(callId),
    queryFn: () => outcomeRulesApi.afterCall(callId),
    refetchInterval: (q) =>
      q.state.data?.some((m) => m.status === 'scheduled') ? AFTER_CALL_POLL_MS : false,
    meta: { silent: true },
  });
  if (rows.isSuccess && !rows.data.length) return null;
  return (
    <Paper variant="outlined" sx={{ p: 2 }} component="section" aria-label="After the call">
      <Typography variant="subtitle1" component="h2" gutterBottom>
        After the call
      </Typography>
      {rows.isPending && <Skeleton variant="rounded" height={48} />}
      {rows.error && <Alert severity="error">{getErrorMessage(rows.error)}</Alert>}
      <Stack spacing={1.5}>
        {rows.data?.map((m) => {
          const s = STATUS[m.status];
          const reason = reasonOf(m.reason);
          const at = m.sentAt ?? m.scheduledAt;
          return (
            <Stack key={m.id} spacing={0.5}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Chip size="small" variant="outlined" color={s.color} label={s.label} />
                <Typography variant="body2">
                  WhatsApp <code>{m.templateName}</code> ({m.language})
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {m.source === 'rule' ? `Rule "${m.ruleName ?? 'removed'}"` : 'Flow step'} ·{' '}
                {m.status === 'sent' ? 'sent' : m.status === 'scheduled' ? 'due' : 'at'}{' '}
                {formatInAccountTz(at, timezone)}
                {reason && ` · ${reason}`}
              </Typography>
              {m.conversationId && canSeeInbox && (
                <Link
                  component={RouterLink}
                  to={`/inbox/${m.conversationId}`}
                  variant="caption"
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Open the chat
                </Link>
              )}
            </Stack>
          );
        })}
      </Stack>
    </Paper>
  );
}
