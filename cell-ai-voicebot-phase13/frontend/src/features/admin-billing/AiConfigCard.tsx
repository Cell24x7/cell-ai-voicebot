import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';

import { adminAiKeys } from '@/features/agents/keys';
import { adminAiApi } from '@/services/api/admin-ai';
import { getErrorMessage } from '@/services/api/errors';

/** What AI this server runs with (superadmin, read-only). The key itself is never shown. */
export function AiConfigCard() {
  const config = useQuery({ queryKey: adminAiKeys.config, queryFn: adminAiApi.config });
  const c = config.data;
  return (
    <Paper variant="outlined" sx={{ p: 2 }} role="region" aria-label="AI configuration">
      <Typography variant="subtitle1" component="h2" gutterBottom>
        AI
      </Typography>
      {config.isPending && <Skeleton variant="rounded" height={80} />}
      {config.isError && (
        <Alert
          severity="error"
          action={<Button onClick={() => void config.refetch()}>Retry</Button>}
        >
          {getErrorMessage(config.error)}
        </Alert>
      )}
      {c && (
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Chip
              size="small"
              color={c.provider === 'openai' ? 'success' : 'warning'}
              label={c.provider === 'openai' ? 'Provider: OpenAI' : 'Provider: fake (test mode)'}
            />
            <Chip
              size="small"
              variant="outlined"
              color={c.openaiKeyConfigured ? 'success' : 'default'}
              label={c.openaiKeyConfigured ? 'OpenAI key set' : 'No OpenAI key'}
            />
            <Chip
              size="small"
              variant="outlined"
              color={c.mockApisEnabled ? 'warning' : 'default'}
              label={c.mockApisEnabled ? 'Mock APIs on (dev)' : 'Mock APIs off'}
            />
            <Chip
              size="small"
              variant="outlined"
              color={c.allowPrivateHosts ? 'warning' : 'default'}
              label={c.allowPrivateHosts ? 'Private hosts allowed (dev)' : 'Private hosts blocked'}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Text models: {c.textModels.join(', ')} (default {c.defaultTextModel}) · Embeddings:{' '}
            {c.embeddingModel}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Chip
              size="small"
              color={c.voice.provider === 'openai' ? 'success' : 'warning'}
              label={
                c.voice.provider === 'openai'
                  ? `Voice: OpenAI ${c.voice.pipeline === 'realtime' ? 'Realtime' : 'chat pipeline'}`
                  : 'Voice: fake (test mode)'
              }
            />
            <Chip
              size="small"
              variant="outlined"
              color={c.voice.textInputEnabled ? 'warning' : 'default'}
              label={
                c.voice.textInputEnabled ? 'Typed call input on (dev)' : 'Typed call input off'
              }
            />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Voice models: {c.voice.realtimeModel} · TTS {c.voice.ttsModel} · Transcription{' '}
            {c.voice.transcribeModel}
          </Typography>
        </Stack>
      )}
    </Paper>
  );
}
