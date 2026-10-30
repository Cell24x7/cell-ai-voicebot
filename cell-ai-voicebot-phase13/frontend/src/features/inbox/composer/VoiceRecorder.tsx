import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import MicOutlined from '@mui/icons-material/MicOutlined';
import SendOutlined from '@mui/icons-material/SendOutlined';
import StopCircleOutlined from '@mui/icons-material/StopCircleOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect } from 'react';

import { formatDuration } from '../format';

import { isM4a, useVoiceRecorder } from './voice-recorder';

export interface RecordedVoice {
  blob: Blob;
  mimeType: string;
  durationSec: number;
}

/**
 * Inline recorder (lazy chunk, native MediaRecorder): starts at once, red dot +
 * timer + Cancel / Stop, then a preview with Re-record / Send. Esc cancels.
 */
export function VoiceRecorder({
  maxSeconds,
  minMs,
  uploading,
  progress,
  onSend,
  onClose,
}: {
  maxSeconds: number;
  minMs: number;
  /** Upload of the recording in flight. */
  uploading: boolean;
  progress: number;
  onSend: (voice: RecordedVoice) => void;
  onClose: () => void;
}) {
  const { state, start, stop, cancel } = useVoiceRecorder({ maxSeconds, minMs });

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      cancel();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancel, onClose]);

  const discard = () => {
    cancel();
    onClose();
  };

  if (state.phase === 'error') {
    return (
      <Alert
        severity="warning"
        action={
          <Button color="inherit" size="small" onClick={onClose}>
            Close
          </Button>
        }
      >
        {state.message}
      </Alert>
    );
  }
  if (state.phase === 'idle') {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {state.notice ?? 'Recording stopped.'}
        </Typography>
        <Button size="small" startIcon={<MicOutlined />} onClick={() => void start()}>
          Record again
        </Button>
        <Button size="small" onClick={onClose}>
          Close
        </Button>
      </Stack>
    );
  }
  if (state.phase === 'requesting') {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }} role="status">
        <CircularProgress size={16} />
        <Typography variant="body2">Waiting for the microphone…</Typography>
        <Box sx={{ flex: 1 }} />
        <IconButton aria-label="Cancel recording" onClick={discard}>
          <DeleteOutlined />
        </IconButton>
      </Stack>
    );
  }
  if (state.phase === 'recording') {
    return (
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <IconButton aria-label="Cancel recording" onClick={discard}>
          <DeleteOutlined />
        </IconButton>
        <Box
          aria-hidden
          sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'error.main' }}
        />
        <Typography variant="body2" role="timer" aria-label="Recording time">
          {formatDuration(state.elapsedMs / 1000)}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          Recording… (up to {Math.round(maxSeconds / 60)} min)
        </Typography>
        <IconButton aria-label="Stop recording" color="error" onClick={stop}>
          <StopCircleOutlined />
        </IconButton>
      </Stack>
    );
  }
  const m4a = isM4a(state.mimeType);
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <IconButton aria-label="Cancel recording" onClick={discard} disabled={uploading}>
          <DeleteOutlined />
        </IconButton>
        <Box
          component="audio"
          controls
          src={state.url}
          aria-label="Voice note preview"
          sx={{ flex: 1, minWidth: 0, height: 36 }}
        />
        <Typography variant="caption" color="text.secondary">
          {formatDuration(state.durationMs / 1000)}
        </Typography>
        <Button size="small" onClick={() => void start()} disabled={uploading}>
          Re-record
        </Button>
        <IconButton
          aria-label="Send voice note"
          color="success"
          disabled={uploading}
          onClick={() =>
            onSend({
              blob: state.blob,
              mimeType: state.mimeType,
              durationSec: Math.round(state.durationMs / 100) / 10,
            })
          }
        >
          <SendOutlined />
        </IconButton>
      </Stack>
      {m4a && (
        <Typography variant="caption" color="text.secondary">
          This browser records M4A: it is sent as an audio file, not as a voice note.
        </Typography>
      )}
      {uploading && (
        <LinearProgress variant="determinate" value={progress} aria-label="Uploading voice note" />
      )}
    </Stack>
  );
}
