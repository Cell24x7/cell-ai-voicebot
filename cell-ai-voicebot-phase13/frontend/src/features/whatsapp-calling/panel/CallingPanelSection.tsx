import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';

import { RelativeTime } from '@/components/RelativeTime';
import { useAuthStore } from '@/features/auth/store';
import { useCalls } from '@/features/calls/queries';
import { windowState } from '@/features/inbox/format';
import type { WhatsAppCallPermission } from '@/services/api/types';
import { formatInAccountTz } from '@/utils/datetime';

import {
  CALL_OUTCOME_LABELS,
  cannotCallText,
  formatCallDuration,
  PERMISSION_STATUS_LABELS,
  permissionColor,
  permissionText,
} from '../labels';
import { useCallPermission, useCanRequestPermission } from '../queries';

import { RequestPermissionDialog } from './RequestPermissionDialog';

type PanelPermission = Omit<WhatsAppCallPermission, 'history'> & {
  history?: WhatsAppCallPermission['history'];
};

const callLine = (c: {
  status: string;
  direction: 'inbound' | 'outbound';
  durationSec: number | null;
}) => {
  const way = c.direction === 'inbound' ? 'Incoming' : 'Outgoing';
  if (c.status === 'completed') return `${way} · ${formatCallDuration(c.durationSec ?? 0)}`;
  if (c.status === 'no_answer' || (c.direction === 'inbound' && c.status === 'failed'))
    return `${way} · ${c.direction === 'inbound' ? CALL_OUTCOME_LABELS.missed : CALL_OUTCOME_LABELS.no_answer}`;
  return `${way} · ${c.status.replace(/_/g, ' ')}`;
};

/**
 * Contact panel → "WhatsApp calling": the customer's call permission on this number
 * (state, expiry, why not, history), "Ask to allow calls", the last 5 WhatsApp calls.
 * `actions` = the call buttons (chat header / panel, T12.10).
 */
export function CallingPanelSection({
  channelId,
  contactId,
  windowExpiresAt,
  initial,
  actions,
}: {
  channelId: string;
  contactId: string;
  windowExpiresAt: string | null;
  /** The panel's permission (no history) until the full answer arrives. */
  initial: PanelPermission | null;
  actions?: ReactNode;
}) {
  const timezone = useAuthStore((s) => s.session?.account.timezone ?? 'Asia/Kolkata');
  const full = useCallPermission(channelId, contactId);
  const canRequest = useCanRequestPermission();
  const [asking, setAsking] = useState(false);
  const calls = useCalls({ contactId, provider: 'whatsapp', limit: 5 });
  const p: PanelPermission | null = full.data ?? initial;
  const recent = (calls.data?.pages[0]?.data ?? []).slice(0, 5);
  if (!p) {
    return (
      <Typography variant="body2" color="text.secondary">
        Calling is not set up for this chat.
      </Typography>
    );
  }
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <Chip
          size="small"
          color={permissionColor(p.status)}
          label={PERMISSION_STATUS_LABELS[p.status]}
        />
        {(p.status === 'temporary' || p.status === 'permanent') && (
          <Typography variant="body2">{permissionText(p, timezone)}</Typography>
        )}
      </Stack>
      {!p.canCall && p.reason && p.reason !== 'requested' && (
        <Typography variant="body2" color="text.secondary">
          {cannotCallText(p.reason)}
        </Typography>
      )}
      {p.nextRequestAt && !p.canCall && (
        <Typography variant="caption" color="text.secondary">
          Next request possible {formatInAccountTz(p.nextRequestAt, timezone)}
        </Typography>
      )}
      {actions}
      {/* the call button asks for permission itself when it is there */}
      {!actions && p.canRequest && canRequest && (
        <Button
          size="small"
          variant="outlined"
          sx={{ alignSelf: 'flex-start' }}
          onClick={() => setAsking(true)}
        >
          Ask to allow calls
        </Button>
      )}
      {p.history && p.history.length > 0 && (
        <Stack component="ul" aria-label="Permission history" sx={{ m: 0, pl: 2 }}>
          {p.history
            .slice(-5)
            .reverse()
            .map((h) => (
              <Typography key={`${h.at}-${h.status}`} component="li" variant="caption">
                {PERMISSION_STATUS_LABELS[h.status as keyof typeof PERMISSION_STATUS_LABELS] ??
                  h.status}{' '}
                · <RelativeTime value={h.at} />
              </Typography>
            ))}
        </Stack>
      )}
      {recent.length > 0 && (
        <Stack aria-label="Recent WhatsApp calls">
          {recent.map((c) => (
            <Link
              key={c.id}
              component={RouterLink}
              to={`/calls/${c.id}`}
              variant="body2"
              sx={{ display: 'block' }}
            >
              {callLine(c)}
              {c.mode === 'ai' ? ' · AI' : ''}
            </Link>
          ))}
        </Stack>
      )}
      {asking && (
        <RequestPermissionDialog
          channelId={channelId}
          contactId={contactId}
          windowOpen={windowState(windowExpiresAt).open}
          onClose={() => setAsking(false)}
        />
      )}
    </Stack>
  );
}
