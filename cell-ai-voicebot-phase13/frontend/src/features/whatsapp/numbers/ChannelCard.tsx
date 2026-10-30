import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { enqueueSnackbar } from 'notistack';

import { useConfirm } from '@/components/confirm-context';
import { RelativeTime } from '@/components/RelativeTime';
import { toApiError } from '@/services/api/errors';
import type { WhatsAppChannel } from '@/services/api/types';

import {
  CHANNEL_STATUS_LABELS,
  channelStatusColor,
  MODE_LABELS,
  nameStatusLabel,
  QUALITY_LABELS,
  qualityColor,
  SYNC_STATUS_LABELS,
  tierLabel,
  whatsappErrorMessage,
} from '../labels';
import {
  useCoexistenceSync,
  useDisconnectChannel,
  useRetrySetup,
  useSyncChannel,
} from '../queries';

import { DISCONNECT_TEXT, WHATSAPP_MANAGER_URL } from './texts';

const RETRYABLE_SYNC = new Set(['not_requested', 'failed', 'declined']);

/** Who pays Meta for this number (and what is missing). */
function BillingLine({ channel }: { channel: WhatsAppChannel }) {
  const { metaPayer, creditLine, paymentMethodOk } = channel.billing;
  if (metaPayer === 'platform') {
    if (creditLine.status === 'attached') {
      return <Typography variant="body2">Meta billed to: platform credit line ✓</Typography>;
    }
    return (
      <Typography
        variant="body2"
        color={creditLine.status === 'failed' ? 'error' : 'text.secondary'}
      >
        Meta billed to: platform credit line —{' '}
        {creditLine.status === 'failed' ? 'not attached yet' : 'set up during connect'}
      </Typography>
    );
  }
  if (paymentMethodOk) {
    return (
      <Typography variant="body2">
        Meta billed to: your WhatsApp Manager payment method ✓
      </Typography>
    );
  }
  return (
    <Typography variant="body2" color="warning.main">
      Meta billed to: your WhatsApp Manager payment method —{' '}
      <Link href={WHATSAPP_MANAGER_URL} target="_blank" rel="noopener noreferrer">
        Add a payment method in WhatsApp Manager ↗
      </Link>
    </Typography>
  );
}

function CoexistenceSection({
  channel,
  canManage,
}: {
  channel: WhatsAppChannel;
  canManage: boolean;
}) {
  const retry = useCoexistenceSync();
  const coex = channel.coexistence;
  if (!coex) return null;
  const canRetry =
    canManage &&
    channel.status === 'connected' &&
    (RETRYABLE_SYNC.has(coex.contactsSync) || RETRYABLE_SYNC.has(coex.historySync));
  const history =
    coex.historySync === 'requested' && coex.historyProgress !== null
      ? `${SYNC_STATUS_LABELS.requested} (${String(coex.historyProgress)}%)`
      : SYNC_STATUS_LABELS[coex.historySync];
  return (
    <Stack spacing={0.5} sx={{ mt: 1 }}>
      <Typography variant="body2">Messages from your phone appear in this app.</Typography>
      <Typography variant="body2" color="text.secondary">
        Contacts sync: {SYNC_STATUS_LABELS[coex.contactsSync]} · Chat history: {history}
      </Typography>
      {canRetry && (
        <div>
          <Button
            size="small"
            disabled={retry.isPending}
            onClick={() =>
              retry.mutate(channel.id, {
                onSuccess: () => enqueueSnackbar('Sync requested', { variant: 'success' }),
                onError: (err) =>
                  enqueueSnackbar(whatsappErrorMessage(toApiError(err)), { variant: 'error' }),
              })
            }
          >
            Retry sync
          </Button>
        </div>
      )}
    </Stack>
  );
}

/** One number (region "WhatsApp number <label>"): facts, billing, actions by role + state. */
export function ChannelCard({
  channel,
  canManage,
  onDetails,
  onRename,
  onPin,
  onReconnect,
}: {
  channel: WhatsAppChannel;
  canManage: boolean;
  onDetails: () => void;
  onRename: () => void;
  onPin: () => void;
  onReconnect: () => void;
}) {
  const confirm = useConfirm();
  const sync = useSyncChannel();
  const retry = useRetrySetup();
  const disconnect = useDisconnectChannel();
  const fail = (err: unknown) =>
    enqueueSnackbar(whatsappErrorMessage(toApiError(err)), { variant: 'error' });
  const done = (r: { outcome: string }) =>
    enqueueSnackbar(
      r.outcome === 'connected' ? 'Number is connected' : 'Number still needs attention',
      { variant: r.outcome === 'connected' ? 'success' : 'warning' },
    );

  const { status } = channel;
  const needsPin = status === 'action_needed' && channel.statusReason?.code === 'pin_required';
  const working = sync.isPending || retry.isPending || disconnect.isPending;
  const showReason = ['action_needed', 'needs_reconnect', 'restricted'].includes(status);

  const onDisconnect = async () => {
    const ok = await confirm({
      title: `Disconnect ${channel.label}?`,
      message: DISCONNECT_TEXT,
      confirmText: 'Disconnect',
      destructive: true,
    });
    if (!ok) return;
    disconnect.mutate(channel.id, {
      onSuccess: () => enqueueSnackbar('Number disconnected', { variant: 'success' }),
      onError: fail,
    });
  };

  return (
    <Card variant="outlined" component="section" aria-label={`WhatsApp number ${channel.label}`}>
      <CardContent>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}
        >
          <Typography variant="h6" component="h2" sx={{ mr: 1 }}>
            {channel.label}
          </Typography>
          <Chip
            size="small"
            color={channelStatusColor(status)}
            label={CHANNEL_STATUS_LABELS[status]}
          />
          <Chip
            size="small"
            variant="outlined"
            color={qualityColor(channel.qualityRating)}
            label={QUALITY_LABELS[channel.qualityRating]}
          />
          <Chip size="small" variant="outlined" label={MODE_LABELS[channel.mode]} />
        </Stack>
        <Typography sx={{ mt: 1 }}>
          {channel.displayPhoneNumber ?? 'No phone number yet'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {channel.verifiedName ?? '—'} · {nameStatusLabel(channel.nameStatus)} · Limit{' '}
          {tierLabel(channel.messagingLimitTier)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          WhatsApp account: {channel.wabaName ?? channel.wabaId}
        </Typography>
        <BillingLine channel={channel} />
        {showReason && channel.statusReason && (
          <Alert severity={status === 'action_needed' ? 'warning' : 'error'} sx={{ mt: 1 }}>
            {channel.statusReason.message}
          </Alert>
        )}
        <CoexistenceSection channel={channel} canManage={canManage} />
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
          Connected <RelativeTime value={channel.connectedAt} /> · Last synced{' '}
          <RelativeTime value={channel.syncedAt} />
        </Typography>
      </CardContent>
      <CardActions sx={{ flexWrap: 'wrap' }}>
        <Button size="small" onClick={onDetails}>
          Details
        </Button>
        {canManage && status !== 'connecting' && (
          <>
            {['connected', 'restricted', 'action_needed'].includes(status) && (
              <Button
                size="small"
                disabled={working}
                onClick={() => sync.mutate(channel.id, { onSuccess: done, onError: fail })}
              >
                Sync now
              </Button>
            )}
            {needsPin && (
              <Button size="small" variant="contained" onClick={onPin}>
                Enter PIN
              </Button>
            )}
            {status === 'action_needed' && !needsPin && (
              <Button
                size="small"
                variant="contained"
                disabled={working}
                onClick={() => retry.mutate(channel.id, { onSuccess: done, onError: fail })}
              >
                Retry setup
              </Button>
            )}
            {(status === 'needs_reconnect' || status === 'disconnected') && (
              <Button size="small" variant="contained" onClick={onReconnect}>
                {status === 'disconnected' ? 'Connect again' : 'Reconnect'}
              </Button>
            )}
            <Button size="small" onClick={onRename}>
              Rename
            </Button>
            {status !== 'disconnected' && (
              <Button
                size="small"
                color="error"
                disabled={working}
                onClick={() => void onDisconnect()}
              >
                Disconnect
              </Button>
            )}
          </>
        )}
      </CardActions>
    </Card>
  );
}
