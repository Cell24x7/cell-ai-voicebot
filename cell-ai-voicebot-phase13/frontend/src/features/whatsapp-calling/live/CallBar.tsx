import CallEndOutlined from '@mui/icons-material/CallEndOutlined';
import DialpadOutlined from '@mui/icons-material/DialpadOutlined';
import FiberManualRecord from '@mui/icons-material/FiberManualRecord';
import MicOffOutlined from '@mui/icons-material/MicOffOutlined';
import MicOutlined from '@mui/icons-material/MicOutlined';
import PauseOutlined from '@mui/icons-material/PauseOutlined';
import PlayArrowOutlined from '@mui/icons-material/PlayArrowOutlined';
import SignalCellularAltOutlined from '@mui/icons-material/SignalCellularAltOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import { useSession } from '@/features/auth/hooks';
import { END_REASON_LABELS } from '@/features/calls/labels';
import { useCanListenCalls } from '@/features/calls/queries';
import { Keypad } from '@/features/calls/tester/LiveCall';
import { useCallTimer } from '@/features/calls/tester/useCallTimer';
import type { CallEndReason } from '@/services/api/types';

import { formatCallDuration } from '../labels';

import {
  clearCall,
  hangupCall,
  pressKey,
  reconnectCall,
  setHeld,
  setMuted,
  takeOver,
} from './controller';
import { MicrophonePicker } from './MicrophonePicker';
import { useLiveCallStore, type ActiveWaCall } from './store';

const stateText = (c: ActiveWaCall, seconds: number): string => {
  switch (c.phase) {
    case 'starting':
      return c.mode === 'human' ? 'Getting the microphone…' : 'Starting…';
    case 'connecting':
      return c.direction === 'inbound' ? 'Connecting…' : 'Calling…';
    case 'ringing':
      return 'Ringing…';
    case 'in_call':
      return formatCallDuration(seconds);
    case 'ending':
      return 'Ending…';
    case 'ended':
      return c.ended ? `Call ended · ${formatCallDuration(c.ended.durationSec)}` : 'Call ended';
    case 'failed':
      return 'Call failed';
  }
};

/** Sticky bar while this browser is on (or watching) a WhatsApp call — any page. */
export default function CallBar() {
  const call = useLiveCallStore((s) => s.active);
  const session = useSession();
  const canTakeOver = useCanListenCalls();
  const [keys, setKeys] = useState<HTMLElement | null>(null);
  const running = call?.phase === 'in_call';
  const seconds = useCallTimer(call?.answeredAt ?? null, running);
  if (!call) return null;
  const done = call.phase === 'ended' || call.phase === 'failed';
  const agent = call.mode === 'human';
  const reason = call.ended?.reason as CallEndReason | undefined;
  return (
    <Paper
      role="region"
      aria-label="WhatsApp call"
      elevation={6}
      sx={{
        position: 'fixed',
        left: { xs: 8, md: 'auto' },
        // clear of the bottom-right corner (chat widgets / dev tools sit there)
        right: { xs: 8, md: 88 },
        bottom: 8,
        zIndex: (t) => t.zIndex.snackbar - 1,
        p: 1.5,
        maxWidth: { md: 560 },
      }}
    >
      <Stack spacing={1}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}
        >
          {call.recording && running && (
            <Tooltip title="This call is recorded">
              <FiberManualRecord fontSize="small" color="error" aria-label="Recording" />
            </Tooltip>
          )}
          <Typography
            sx={{ fontWeight: 600, flex: '1 1 140px', minWidth: 0 }}
            noWrap
            title={call.label}
          >
            {call.label}
          </Typography>
          <Typography variant="body2" role="status" aria-live="polite">
            {stateText(call, seconds)}
            {call.held && running ? ' · On hold' : ''}
          </Typography>
          {agent && running && (
            <Tooltip title={call.network === 'good' ? 'Connection good' : 'Weak connection'}>
              <SignalCellularAltOutlined
                fontSize="small"
                color={call.network === 'good' ? 'success' : 'warning'}
                aria-label={call.network === 'good' ? 'Connection good' : 'Weak connection'}
              />
            </Tooltip>
          )}
        </Stack>
        {!agent && !done && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
              {running ? 'AI is talking' : 'The AI will talk when the customer answers'}
            </Typography>
            {canTakeOver && running && session && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => void takeOver(session.user.id)}
              >
                Take over
              </Button>
            )}
          </Stack>
        )}
        {call.failure && <Alert severity="error">{call.failure}</Alert>}
        {!done && call.walletEndsInSec !== null && (
          <Alert severity="warning">
            Wallet balance is low. Add money to keep talking; this call will end in{' '}
            {call.walletEndsInSec} seconds.
          </Alert>
        )}
        {call.phase === 'ended' && reason && END_REASON_LABELS[reason] && (
          <Typography variant="caption" color="text.secondary">
            {END_REASON_LABELS[reason]}
          </Typography>
        )}
        <Stack
          direction="row"
          spacing={1}
          sx={{ justifyContent: 'flex-end', flexWrap: 'wrap', rowGap: 1 }}
        >
          {agent && !done && (
            <>
              {running && <MicrophonePicker />}
              <IconButton
                aria-label={call.muted ? 'Unmute' : 'Mute'}
                aria-pressed={call.muted}
                disabled={!running}
                onClick={() => setMuted(!call.muted)}
              >
                {call.muted ? <MicOffOutlined /> : <MicOutlined />}
              </IconButton>
              <IconButton
                aria-label={call.held ? 'Resume' : 'Hold'}
                aria-pressed={call.held}
                disabled={!running}
                onClick={() => void setHeld(!call.held)}
              >
                {call.held ? <PlayArrowOutlined /> : <PauseOutlined />}
              </IconButton>
              <IconButton
                aria-label="Keypad"
                aria-haspopup="dialog"
                disabled={!running}
                onClick={(e) => setKeys(e.currentTarget)}
              >
                <DialpadOutlined />
              </IconButton>
            </>
          )}
          {!done ? (
            <Button
              color="error"
              variant="contained"
              startIcon={<CallEndOutlined />}
              disabled={call.phase === 'ending'}
              onClick={() => void hangupCall()}
            >
              Hang up
            </Button>
          ) : (
            <>
              {agent && call.network === 'lost' && call.callId && (
                <Button variant="contained" onClick={() => void reconnectCall()}>
                  Reconnect
                </Button>
              )}
              <Button variant="outlined" onClick={clearCall}>
                Close
              </Button>
            </>
          )}
        </Stack>
      </Stack>
      <Popover
        open={Boolean(keys)}
        anchorEl={keys}
        onClose={() => setKeys(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Stack sx={{ p: 1 }}>
          <Keypad disabled={!running} onKey={pressKey} />
        </Stack>
      </Popover>
    </Paper>
  );
}
