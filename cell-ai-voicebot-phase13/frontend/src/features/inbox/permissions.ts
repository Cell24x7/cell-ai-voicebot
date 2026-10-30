import { usePermission, useSession } from '@/features/auth/hooks';
import { useImpersonating } from '@/features/wallet/queries';
import type { InboxConversationDetail } from '@/services/api/types';

type ChannelStatus = NonNullable<InboxConversationDetail['channel']>['status'];

/** Numbers that can still send replies (restricted = business-initiated limits only). */
export const REPLY_CHANNEL_STATUSES: readonly ChannelStatus[] = ['connected', 'restricted'];

export const channelCanReply = (channel: InboxConversationDetail['channel']): boolean =>
  Boolean(channel && REPLY_CHANNEL_STATUSES.includes(channel.status));

const useActiveActor = (): boolean => {
  const impersonating = useImpersonating();
  const active = useSession()?.account.status === 'active';
  return !impersonating && active;
};

/**
 * `inbox.reply`, not impersonating, account active and — when a conversation is
 * given — its number can send. Viewers / impersonators read only.
 */
export const useCanReply = (channel?: InboxConversationDetail['channel']): boolean => {
  const can = usePermission('inbox.reply');
  const actor = useActiveActor();
  return can && actor && (channel === undefined || channelCanReply(channel));
};

/** `inbox.assign` (assign anyone, block / unblock, retry media), not impersonating. */
export const useCanAssign = (): boolean => {
  const can = usePermission('inbox.assign');
  const actor = useActiveActor();
  return can && actor;
};
