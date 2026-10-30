import CallMadeOutlined from '@mui/icons-material/CallMadeOutlined';
import CallOutlined from '@mui/icons-material/CallOutlined';
import CallReceivedOutlined from '@mui/icons-material/CallReceivedOutlined';
import PhoneMissedOutlined from '@mui/icons-material/PhoneMissedOutlined';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router';

import type { InboxInteractive, InboxMessage } from '@/services/api/types';

import { callBubbleText, REQUEST_STATE_LABELS } from './labels';

const answerText = (p: NonNullable<InboxInteractive['callPermission']>): string =>
  p.response === 'reject'
    ? 'Declined calls'
    : p.isPermanent
      ? 'Allowed calls (always)'
      : 'Allowed calls for 7 days';

/** The permission request we sent (state chip) and the customer's reply. Text stays text. */
export function CallPermissionContent({ interactive: i }: { interactive: InboxInteractive }) {
  if (i.kind === 'call_permission_reply') {
    const p = i.callPermission;
    return (
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
        <CallOutlined fontSize="small" color="action" aria-hidden />
        <Chip
          size="small"
          color={p?.response === 'accept' ? 'success' : 'default'}
          label={p ? answerText(p) : 'Answered the call request'}
        />
        {p?.source === 'automatic' && (
          <Typography variant="caption" color="text.secondary">
            after calling you
          </Typography>
        )}
      </Stack>
    );
  }
  const state = i.requestState;
  return (
    <Stack spacing={0.75}>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
        <CallOutlined fontSize="small" color="action" aria-hidden />
        <Typography variant="caption" color="text.secondary">
          {i.kind === 'voice_call' ? 'Call button' : 'Call permission request'}
        </Typography>
      </Stack>
      {i.body && (
        <Typography variant="body2" sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
          {i.body}
        </Typography>
      )}
      {i.kind === 'voice_call' ? (
        <Chip
          size="small"
          variant="outlined"
          icon={<CallOutlined />}
          label={i.voiceCall?.displayText ?? 'Call now'}
          sx={{ alignSelf: 'flex-start' }}
        />
      ) : (
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
          {state && (
            <Chip
              size="small"
              color={state === 'answered' ? 'success' : state === 'failed' ? 'error' : 'default'}
              label={REQUEST_STATE_LABELS[state]}
            />
          )}
          {i.callPermission && (
            <Chip size="small" variant="outlined" label={answerText(i.callPermission)} />
          )}
        </Stack>
      )}
    </Stack>
  );
}

/** "Call · 2:14" / "Missed call" — links to the call. */
export function CallBubbleContent({ call }: { call: NonNullable<InboxMessage['call']> }) {
  const icon =
    call.outcome === 'missed' || call.outcome === 'no_answer' ? (
      <PhoneMissedOutlined fontSize="small" color="error" aria-hidden />
    ) : call.direction === 'in' ? (
      <CallReceivedOutlined fontSize="small" color="action" aria-hidden />
    ) : (
      <CallMadeOutlined fontSize="small" color="action" aria-hidden />
    );
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Box sx={{ display: 'flex' }}>{icon}</Box>
      <Link component={RouterLink} to={`/calls/${call.callId}`} variant="body2" underline="hover">
        {callBubbleText(call)}
      </Link>
      <Typography variant="caption" color="text.secondary">
        {call.direction === 'in' ? 'Incoming' : 'Outgoing'}
      </Typography>
    </Stack>
  );
}
