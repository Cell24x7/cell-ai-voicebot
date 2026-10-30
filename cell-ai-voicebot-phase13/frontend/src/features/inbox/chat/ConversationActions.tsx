import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';

import { useConfirm } from '@/components/confirm-context';
import { useSession } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';
import { ChatSummaryDrawer } from '@/features/insights/ChatSummaryDrawer';
import { useImpersonating } from '@/features/wallet/queries';
import { teamApi } from '@/services/api/team';
import type { InboxConversationDetail } from '@/services/api/types';

import { BLOCK_TEXT } from '../labels';
import {
  useAssignConversation,
  useBlockConversation,
  useCanAssign,
  useCanReply,
  useCloseConversation,
  useInboxConfig,
  useMarkUnread,
  useReopenConversation,
  useUnblockConversation,
} from '../queries';

const SimulateCustomerDrawer = lazy(() =>
  import('./SimulateCustomerDrawer').then((m) => ({ default: m.SimulateCustomerDrawer })),
);

/**
 * "Assigned to": anyone (inbox.assign), yourself or nobody (inbox.reply),
 * read only otherwise.
 */
export function AssignSelect({ conversation: c }: { conversation: InboxConversationDetail }) {
  const canAssign = useCanAssign();
  const canReply = useCanReply();
  const me = useSession()?.user;
  const assign = useAssignConversation();
  const team = useQuery({
    queryKey: ['team', 'assignable'],
    queryFn: () => teamApi.list({ status: 'active', limit: 100 }),
    enabled: canAssign,
    staleTime: 60_000,
    meta: { silent: true },
  });
  const people = new Map<string, string>();
  if (canAssign) for (const m of team.data?.data ?? []) people.set(m.id, m.name);
  if (me) people.set(me.id, `${me.name} (me)`);
  if (c.assignedTo && !people.has(c.assignedTo.id)) people.set(c.assignedTo.id, c.assignedTo.name);
  const editable = canAssign || canReply;
  return (
    <TextField
      select
      size="small"
      label="Assigned to"
      value={c.assignedTo?.id ?? ''}
      disabled={!editable || assign.isPending}
      onChange={(e) => assign.mutate({ id: c.id, assignedTo: e.target.value || null })}
      sx={{ minWidth: 170 }}
      slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
    >
      <MenuItem value="">Unassigned</MenuItem>
      {[...people].map(([id, name]) => (
        <MenuItem key={id} value={id} disabled={!canAssign && id !== me?.id}>
          {name}
        </MenuItem>
      ))}
    </TextField>
  );
}

/** Close / Reopen, and a menu with Block / Unblock, Mark as unread and the dev simulator. */
export function ConversationActions({
  conversation: c,
}: {
  conversation: InboxConversationDetail;
}) {
  const canReply = useCanReply();
  const canAssign = useCanAssign();
  const impersonating = useImpersonating();
  const confirm = useConfirm();
  const close = useCloseConversation();
  const reopen = useReopenConversation();
  const block = useBlockConversation();
  const unblock = useUnblockConversation();
  const unread = useMarkUnread();
  const config = useInboxConfig();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [summary, setSummary] = useState(false);
  const timezone = useAuthStore((st) => st.session?.account.timezone ?? 'Asia/Kolkata');
  const simulator = Boolean(import.meta.env.DEV && config.data?.fakeProvider && c.channel);

  const onBlock = async () => {
    setAnchor(null);
    const ok = await confirm({
      title: 'Block this customer?',
      message: BLOCK_TEXT,
      confirmText: 'Block',
      destructive: true,
    });
    if (ok) block.mutate(c.id);
  };

  return (
    <>
      {canReply &&
        (c.status === 'open' ? (
          <Button size="small" onClick={() => close.mutate(c.id)} disabled={close.isPending}>
            Close conversation
          </Button>
        ) : (
          <Button size="small" onClick={() => reopen.mutate(c.id)} disabled={reopen.isPending}>
            Reopen conversation
          </Button>
        ))}
      <Button size="small" startIcon={<AutoAwesomeOutlined />} onClick={() => setSummary(true)}>
        Summary
      </Button>
      {summary && (
        <ChatSummaryDrawer
          conversationId={c.id}
          open={summary}
          onClose={() => setSummary(false)}
          canSummarize={canReply}
          timezone={timezone}
        />
      )}
      <IconButton aria-label="More actions" onClick={(e) => setAnchor(e.currentTarget)}>
        <MoreVertOutlined />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {canAssign &&
          (c.blocked ? (
            <MenuItem
              onClick={() => {
                setAnchor(null);
                unblock.mutate(c.id);
              }}
            >
              Unblock
            </MenuItem>
          ) : (
            <MenuItem onClick={() => void onBlock()}>Block</MenuItem>
          ))}
        <MenuItem
          disabled={impersonating}
          onClick={() => {
            setAnchor(null);
            unread.mutate(c.id);
          }}
        >
          Mark as unread
        </MenuItem>
        {simulator && (
          <MenuItem
            onClick={() => {
              setAnchor(null);
              setSimulating(true);
            }}
          >
            Simulate customer
          </MenuItem>
        )}
      </Menu>
      {simulating && c.channel && (
        <Suspense fallback={null}>
          <SimulateCustomerDrawer
            channelId={c.channel.id}
            conversationId={c.id}
            from={c.phoneE164}
            onClose={() => setSimulating(false)}
          />
        </Suspense>
      )}
    </>
  );
}
