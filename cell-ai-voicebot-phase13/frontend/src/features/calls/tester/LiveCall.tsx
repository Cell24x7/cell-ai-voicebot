import CallEndOutlined from '@mui/icons-material/CallEndOutlined';
import MicOffOutlined from '@mui/icons-material/MicOffOutlined';
import MicOutlined from '@mui/icons-material/MicOutlined';
import SendOutlined from '@mui/icons-material/SendOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState, type FormEvent } from 'react';

import { clock, describeEvent } from '../labels';

import { useCallTimer } from './useCallTimer';
import type { CallPhase, LiveEvent, LiveLine, WebCallState } from './useWebCall';

const PHASE_LABELS: Record<CallPhase, string> = {
  idle: 'Ready',
  starting: 'Starting…',
  connecting: 'Connecting…',
  ringing: 'Ringing…',
  in_call: 'In call',
  ending: 'Ending…',
  ended: 'Call ended',
  failed: 'Call failed',
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'] as const;

export function Keypad({ disabled, onKey }: { disabled: boolean; onKey: (key: string) => void }) {
  return (
    <Box
      role="group"
      aria-label="Keypad"
      sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 56px)', gap: 1 }}
    >
      {KEYS.map((key) => (
        <Button
          key={key}
          variant="outlined"
          disabled={disabled}
          onClick={() => onKey(key)}
          aria-label={`Key ${key}`}
        >
          {key}
        </Button>
      ))}
    </Box>
  );
}

export function LiveTranscript({ lines }: { lines: LiveLine[] }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, minHeight: 160, maxHeight: 360, overflowY: 'auto' }}>
      <List dense aria-label="Live transcript" aria-live="polite">
        {lines.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            The conversation appears here.
          </Typography>
        )}
        {lines.map((line) => (
          <ListItem
            key={line.key}
            disableGutters
            data-final={line.final ? 'true' : 'false'}
            sx={{ opacity: line.final ? 1 : 0.55 }}
          >
            <ListItemText
              primary={
                <>
                  <Typography component="span" variant="body2" sx={{ fontWeight: 600, mr: 1 }}>
                    {line.speaker === 'customer' ? 'Customer' : 'Bot'}
                  </Typography>
                  <Typography component="span" variant="body2">
                    {line.text}
                  </Typography>
                  {line.interrupted && (
                    <Chip size="small" label="interrupted" variant="outlined" sx={{ ml: 1 }} />
                  )}
                </>
              }
            />
          </ListItem>
        ))}
      </List>
    </Paper>
  );
}

export function EventsTimeline({ events }: { events: LiveEvent[] }) {
  return (
    <List dense aria-label="Call events" sx={{ maxHeight: 360, overflowY: 'auto' }}>
      {events.map((e) => (
        <ListItem key={e.seq} disableGutters>
          <ListItemText
            primary={describeEvent(e.type, e.data)}
            slotProps={{ primary: { variant: 'caption' } }}
          />
        </ListItem>
      ))}
    </List>
  );
}

/** The call while it runs: controls, transcript, latency and the timeline. */
export function LiveCall({
  state,
  onHangup,
  onMute,
  onKey,
  onSay,
  onTransfer,
}: {
  state: WebCallState;
  onHangup: () => void;
  onMute: (muted: boolean) => void;
  onKey: (key: string) => void;
  onSay: (text: string) => void;
  onTransfer: (result: 'connected' | 'failed' | 'no_answer') => void;
}) {
  const [text, setText] = useState('');
  const running = state.phase === 'in_call';
  const seconds = useCallTimer(state.answeredAt, running);
  const live = ['connecting', 'ringing', 'in_call'].includes(state.phase);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const words = text.trim();
    if (!words) return;
    onSay(words);
    setText('');
  };
  return (
    <Stack spacing={2} component="section" aria-label="Live call">
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Chip
          color={running ? 'success' : state.phase === 'failed' ? 'error' : 'default'}
          label={PHASE_LABELS[state.phase]}
        />
        {state.answeredAt !== null && (
          <Typography variant="h6" component="span" aria-label="Call time">
            {clock(seconds)}
          </Typography>
        )}
        {state.voice === 'fake' && (
          <Tooltip title="Deterministic test voice: tones instead of speech, typed words allowed. Costs follow the rate card.">
            <Chip size="small" color="warning" variant="outlined" label="Fake voice (test mode)" />
          </Tooltip>
        )}
        {state.latencies.map((ms, i) => (
          <Chip key={i} size="small" variant="outlined" label={`${String(ms)} ms`} />
        ))}
        <Box sx={{ flex: 1 }} />
        <Tooltip title={state.muted ? 'Unmute' : 'Mute'}>
          <span>
            <IconButton
              aria-label={state.muted ? 'Unmute' : 'Mute'}
              onClick={() => onMute(!state.muted)}
              disabled={!live}
            >
              {state.muted ? <MicOffOutlined /> : <MicOutlined />}
            </IconButton>
          </span>
        </Tooltip>
        <Button
          color="error"
          variant="contained"
          startIcon={<CallEndOutlined />}
          onClick={onHangup}
          disabled={!live}
        >
          Hang up
        </Button>
      </Stack>
      {live && (
        <LinearProgress
          variant="determinate"
          value={Math.min(100, state.level * 300)}
          aria-label="Microphone level"
        />
      )}
      {state.notice && <Alert severity="info">{state.notice}</Alert>}
      {state.transfer && (
        <Alert
          severity="warning"
          action={
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={() => onTransfer('connected')}>
                Answered
              </Button>
              <Button size="small" onClick={() => onTransfer('no_answer')}>
                No answer
              </Button>
              <Button size="small" onClick={() => onTransfer('failed')}>
                Failed
              </Button>
            </Stack>
          }
        >
          The bot is transferring the customer to ••••{state.transfer.phoneLast4}. What happened?
        </Alert>
      )}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Stack spacing={2} sx={{ flex: 2, minWidth: 0 }}>
          <LiveTranscript lines={state.lines} />
          {state.textInput && (
            <Box component="form" onSubmit={submit} aria-label="Type instead of speaking">
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  fullWidth
                  label="Type instead of speaking"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={!running}
                  slotProps={{ htmlInput: { maxLength: 500 } }}
                />
                <IconButton
                  type="submit"
                  aria-label="Send words"
                  disabled={!running || !text.trim()}
                >
                  <SendOutlined />
                </IconButton>
              </Stack>
            </Box>
          )}
        </Stack>
        <Stack spacing={2} sx={{ flex: 1 }}>
          <Keypad disabled={!running} onKey={onKey} />
          <Typography variant="subtitle2">Timeline</Typography>
          <EventsTimeline events={state.events} />
        </Stack>
      </Stack>
    </Stack>
  );
}
