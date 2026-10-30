import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined';
import PlayArrowOutlined from '@mui/icons-material/PlayArrowOutlined';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { getErrorMessage } from '@/services/api/errors';
import { flowAudioApi } from '@/services/api/flow-audio';

import { flowAudioKeys } from '../keys';
import { useFlowAudio } from '../queries';

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** Upload one WAV / MP3 (≤ 5 MB, ≤ 120 s). */
function UploadDialog({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [progress, setProgress] = useState(0);
  const upload = useMutation({
    mutationFn: () => flowAudioApi.upload(file as File, name.trim() || undefined, setProgress),
    onSuccess: (audio) => {
      void queryClient.invalidateQueries({ queryKey: flowAudioKeys.all });
      enqueueSnackbar(`Uploaded "${audio.name}" (${seconds(audio.durationMs)})`, {
        variant: 'success',
      });
      onUploaded(audio.id);
      onClose();
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="upload-audio-title">
      <DialogTitle id="upload-audio-title">Upload audio</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Button component="label" variant="outlined" startIcon={<CloudUploadOutlined />}>
            {file ? file.name : 'Choose a WAV or MP3'}
            <input
              hidden
              type="file"
              accept=".wav,.mp3,audio/wav,audio/mpeg"
              aria-label="Audio file"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''));
              }}
            />
          </Button>
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(e) => setName(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 80 } }}
          />
          <Typography variant="caption" color="text.secondary">
            Up to 5 MB and 120 seconds.
          </Typography>
          {upload.isPending && (
            <LinearProgress variant="determinate" value={progress} aria-label="Upload progress" />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!file || upload.isPending}
          onClick={() => upload.mutate()}
        >
          Upload
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Pick an account audio file, upload a new one, play it. */
export function AudioPicker({
  value,
  onChange,
  error,
  readOnly,
}: {
  value: string;
  onChange: (id: string) => void;
  error?: string | undefined;
  readOnly: boolean;
}) {
  const audio = useFlowAudio();
  const [uploading, setUploading] = useState(false);
  const play = useMutation({
    mutationFn: () => flowAudioApi.url(value),
    onSuccess: ({ url }) => void new Audio(url).play().catch(() => undefined),
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  const items = audio.data ?? [];
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        <TextField
          select
          label="Audio file"
          size="small"
          value={items.some((a) => a.id === value) ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          error={Boolean(error)}
          helperText={error}
          disabled={readOnly || audio.isPending}
          fullWidth
        >
          <MenuItem value="">None</MenuItem>
          {items.map((a) => (
            <MenuItem key={a.id} value={a.id}>
              {a.name} · {seconds(a.durationMs)}
            </MenuItem>
          ))}
        </TextField>
        <IconButton
          aria-label="Play audio"
          disabled={!value || play.isPending}
          onClick={() => play.mutate()}
        >
          <PlayArrowOutlined />
        </IconButton>
      </Stack>
      {!readOnly && (
        <Button
          size="small"
          startIcon={<CloudUploadOutlined />}
          onClick={() => setUploading(true)}
          sx={{ alignSelf: 'flex-start' }}
        >
          Upload audio
        </Button>
      )}
      {uploading && <UploadDialog onClose={() => setUploading(false)} onUploaded={onChange} />}
    </Stack>
  );
}
