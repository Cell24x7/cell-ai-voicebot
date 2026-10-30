import PlayArrowOutlined from '@mui/icons-material/PlayArrowOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRef, useState, type RefObject } from 'react';

import { callsApi } from '@/services/api/calls';
import { getErrorMessage } from '@/services/api/errors';

/**
 * The call's stereo recording (customer left, bot right). The signed link is
 * fetched when the user asks (every fetch is audited) and fetched again once
 * when the browser reports it expired.
 */
export function RecordingPlayer({
  callId,
  durationSec,
  audioRef,
  getLink = callsApi.recording,
}: {
  callId: string;
  durationSec: number;
  audioRef: RefObject<HTMLAudioElement | null>;
  getLink?: typeof callsApi.recording;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const retried = useRef(false);
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const link = await getLink(callId);
      setUrl(link.url);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Stack spacing={1} component="section" aria-label="Recording">
      <Typography variant="subtitle1" component="h2">
        Recording ({durationSec} s)
      </Typography>
      {url ? (
        <audio
          ref={audioRef}
          controls
          src={url}
          aria-label="Call recording"
          style={{ width: '100%' }}
          onError={() => {
            // the 5-minute link expired: one fresh link, then give up
            if (retried.current) {
              setError('The recording could not be played.');
              return;
            }
            retried.current = true;
            void load();
          }}
        />
      ) : (
        <Stack direction="row">
          <Button
            variant="outlined"
            startIcon={<PlayArrowOutlined />}
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Load recording'}
          </Button>
        </Stack>
      )}
      <Typography variant="caption" color="text.secondary">
        Customer on the left channel, bot on the right. Opening the recording is logged.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}
