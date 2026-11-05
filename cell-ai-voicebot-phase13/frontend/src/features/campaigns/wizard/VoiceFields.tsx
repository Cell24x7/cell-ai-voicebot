import {
  Alert,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import { AudioPicker } from '@/features/flows/inspector/AudioPicker';
import {
  campaignsApi,
  VOICE_RETRY_INTERVALS,
  type VoiceRetryInterval,
} from '@/services/api/campaigns';
import { getErrorMessage } from '@/services/api/errors';

import { voiceIvrKeys } from '../voice';

import type { StepProps } from './BasicsStep';
import { isLocked, type VoiceDraft } from './draft';

/** What a recorded-voice campaign plays: the account's audio (≤ 120 s) or an assigned IVR. */
export function VoiceContentFields({ draft, onChange, lock }: StepProps) {
  const v = draft.voice;
  const locked = isLocked(lock, 'flow');
  const ivrs = useQuery({
    queryKey: voiceIvrKeys.list,
    queryFn: () => campaignsApi.voiceIvrs(),
    enabled: v.kind === 'ivr',
  });
  const set = (patch: Partial<VoiceDraft>) => onChange({ voice: { ...v, ...patch } });
  return (
    <Stack spacing={2} component="section" aria-label="Recorded voice">
      <div>
        <Typography variant="subtitle2">What customers hear</Typography>
        <RadioGroup
          row
          value={v.kind}
          aria-label="What customers hear"
          onChange={(e) => set({ kind: e.target.value as VoiceDraft['kind'] })}
        >
          <FormControlLabel
            value="audio"
            control={<Radio />}
            label="Recorded audio"
            disabled={locked}
          />
          <FormControlLabel value="ivr" control={<Radio />} label="IVR menu" disabled={locked} />
        </RadioGroup>
      </div>
      {v.kind === 'audio' ? (
        <AudioPicker
          value={v.flowAudioId}
          readOnly={locked}
          onChange={(id) => set({ flowAudioId: id })}
        />
      ) : (
        <>
          <TextField
            select
            label="IVR menu"
            value={ivrs.data?.some((i) => i.id === v.ivrId) ? String(v.ivrId) : ''}
            disabled={locked || ivrs.isPending}
            onChange={(e) => set({ ivrId: Number(e.target.value) || null })}
            helperText="Menus your provider set up for this account (key press, transfer)"
            sx={{ maxWidth: 420 }}
          >
            {(ivrs.data ?? []).map((i) => (
              <MenuItem key={i.id} value={String(i.id)}>
                {i.name}
              </MenuItem>
            ))}
          </TextField>
          {ivrs.isSuccess && !ivrs.data.length && (
            <Alert severity="info">
              No IVR menu is assigned to this account yet — ask support.
            </Alert>
          )}
          {ivrs.error && <Alert severity="error">{getErrorMessage(ivrs.error)}</Alert>}
        </>
      )}
      <Alert severity="info">
        Recorded voice calls 10-digit Indian mobiles only, from the provider’s line (about 4 calls
        at a time). Each number is charged per started 15 seconds when its batch is sent, answered
        or not.
      </Alert>
    </Stack>
  );
}

/** Cell24x7 redials numbers that did not answer (0–3 times, a fixed gap). */
export function VoiceRetryFields({ draft, onChange, lock }: StepProps) {
  const v = draft.voice;
  const locked = isLocked(lock, 'retry');
  const set = (patch: Partial<VoiceDraft>) => onChange({ voice: { ...v, ...patch } });
  return (
    <Stack spacing={2}>
      <Typography variant="subtitle2">Redials</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          select
          label="Redials of unanswered numbers"
          value={v.retries}
          disabled={locked}
          onChange={(e) => set({ retries: Number(e.target.value) })}
          sx={{ minWidth: 240 }}
        >
          {[0, 1, 2, 3].map((n) => (
            <MenuItem key={n} value={n}>
              {n === 0 ? 'No redial' : `${String(n)} redial${n > 1 ? 's' : ''}`}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Minutes between redials"
          value={v.retryIntervalMin}
          disabled={locked || v.retries === 0}
          onChange={(e) => set({ retryIntervalMin: Number(e.target.value) as VoiceRetryInterval })}
          sx={{ minWidth: 220 }}
        >
          {VOICE_RETRY_INTERVALS.map((m) => (
            <MenuItem key={m} value={m}>
              {m < 60 ? `${String(m)} minutes` : `${String(m / 60)} hour${m > 60 ? 's' : ''}`}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <Typography variant="body2" color="text.secondary">
        The provider redials by itself; all redials must fit in the calling window. Each number is
        charged once, redials included.
      </Typography>
    </Stack>
  );
}
