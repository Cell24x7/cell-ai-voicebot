import CallOutlined from '@mui/icons-material/CallOutlined';
import NotificationsOffOutlined from '@mui/icons-material/NotificationsOffOutlined';
import NotificationsOutlined from '@mui/icons-material/NotificationsOutlined';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { usePermission, useSession } from '@/features/auth/hooks';
import { useConversation } from '@/features/inbox/queries';
import { teamKeys } from '@/features/team/keys';
import { teamApi } from '@/services/api/team';
import { formatPhone } from '@/utils/phone';

import { answerCall, declineCall, isBusy } from './controller';
import {
  askNotificationsOnce,
  isRingMuted,
  notifyIncoming,
  setRingMuted,
  startRing,
} from './ringer';
import { useLiveCallStore, type IncomingRing } from './store';

/** How long "Taken by …" / "Call ended" stays before the popup closes. */
export const POPUP_LINGER_MS = 3_000;

const useMemberName = (userId: string | null): string | null => {
  const canRead = usePermission('team.read');
  const query = { status: 'active' as const, limit: 100 };
  const team = useQuery({
    queryKey: teamKeys.list(query),
    queryFn: () => teamApi.list(query),
    enabled: Boolean(userId) && canRead,
  });
  if (!userId) return null;
  return team.data?.data.find((m) => m.id === userId)?.name ?? null;
};

function Ring({ ring }: { ring: IncomingRing }) {
  const dismiss = useLiveCallStore((s) => s.dismiss);
  const conversation = useConversation(ring.conversationId);
  const session = useSession();
  const [muted, setMuted] = useState(isRingMuted);
  const [busy, setBusy] = useState(false);
  const taker = useMemberName(ring.takenBy);
  const c = conversation.data;
  const label = c ? c.label : 'WhatsApp customer';
  const ended = Boolean(ring.takenBy) || ring.gone;
  // ring + background notification while it rings (cleanups make Strict Mode safe)
  useEffect(() => {
    if (ended || muted) return undefined;
    return startRing();
  }, [ended, muted]);
  useEffect(() => {
    if (ended) return undefined;
    askNotificationsOnce();
    return notifyIncoming(label);
  }, [ended, label]);
  useEffect(() => {
    if (!ended) return undefined;
    const t = setTimeout(() => dismiss(ring.callId), POPUP_LINGER_MS);
    return () => clearTimeout(t);
  }, [ended, dismiss, ring.callId]);
  const recording = session?.account.settings.recordingEnabled ?? true;
  return (
    <Paper
      role="alertdialog"
      aria-label="Incoming WhatsApp call"
      elevation={8}
      sx={{ p: 2, width: { xs: 'calc(100vw - 16px)', sm: 340 } }}
    >
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <CallOutlined color="success" aria-hidden />
          <Typography variant="subtitle2" sx={{ flex: 1 }}>
            Incoming WhatsApp call
          </Typography>
          <Tooltip title={muted ? 'Ring sound off' : 'Ring sound on'}>
            <IconButton
              size="small"
              aria-label={muted ? 'Turn ring sound on' : 'Turn ring sound off'}
              onClick={() => {
                setRingMuted(!muted);
                setMuted(!muted);
              }}
            >
              {muted ? (
                <NotificationsOffOutlined fontSize="small" />
              ) : (
                <NotificationsOutlined fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        </Stack>
        <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{label}</Typography>
        {c && (
          <Typography variant="caption" color="text.secondary">
            {c.label === formatPhone(c.phoneE164) ? '' : `${formatPhone(c.phoneE164)} · `}
            {c.channel ? `to ${c.channel.label}` : ''}
          </Typography>
        )}
        {ring.takenBy ? (
          <Typography variant="body2" role="status">
            Taken by {taker ?? 'a teammate'}
          </Typography>
        ) : ring.gone ? (
          <Typography variant="body2" role="status">
            The call stopped ringing
          </Typography>
        ) : (
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
            <Button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void declineCall(ring.callId).finally(() => dismiss(ring.callId));
              }}
            >
              Decline
            </Button>
            <Button
              variant="contained"
              color="success"
              disabled={busy || isBusy()}
              onClick={() => {
                setBusy(true);
                // the call bar takes over at once (microphone, answer, connect)
                dismiss(ring.callId);
                void answerCall({
                  callId: ring.callId,
                  label,
                  conversationId: ring.conversationId,
                  recording,
                });
              }}
            >
              Accept
            </Button>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

/** Global incoming call popup (lazy): the oldest ringing call first. */
export default function IncomingPopup() {
  const ring = useLiveCallStore((s) => s.incoming[0]);
  if (!ring) return null;
  return (
    <Stack sx={{ position: 'fixed', top: 72, right: 8, zIndex: (t) => t.zIndex.snackbar }}>
      <Ring key={ring.callId} ring={ring} />
    </Stack>
  );
}
