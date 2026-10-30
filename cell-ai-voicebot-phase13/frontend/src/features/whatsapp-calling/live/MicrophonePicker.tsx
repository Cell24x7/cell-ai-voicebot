import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { enqueueSnackbar } from 'notistack';
import { useEffect, useState } from 'react';

import { MIC_ERROR_TEXT, MicError } from '@/features/calls/audio/engine';

import { changeMicrophone } from './controller';

/** Permission was already granted for the call; enumeration never opens another mic. */
export function MicrophonePicker({
  media = globalThis.navigator?.mediaDevices,
}: {
  media?: Pick<MediaDevices, 'enumerateDevices'>;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void media
      ?.enumerateDevices()
      .then((list) => {
        if (active) setDevices(list.filter((d) => d.kind === 'audioinput'));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [media]);
  if (!devices.length) return null;
  return (
    <FormControl size="small" sx={{ minWidth: 140, maxWidth: 220 }} disabled={busy}>
      <InputLabel id="call-microphone-label">Microphone</InputLabel>
      <Select
        labelId="call-microphone-label"
        label="Microphone"
        value={selected}
        onChange={(e) => {
          const id = e.target.value;
          setBusy(true);
          void changeMicrophone(id)
            .then(
              () => setSelected(id),
              (err: unknown) => {
                enqueueSnackbar(MIC_ERROR_TEXT[err instanceof MicError ? err.code : 'mic_failed'], {
                  variant: 'error',
                });
              },
            )
            .finally(() => setBusy(false));
        }}
      >
        <MenuItem value="">Default microphone</MenuItem>
        {devices.map((d, i) => (
          <MenuItem key={d.deviceId} value={d.deviceId}>
            {d.label || `Microphone ${String(i + 1)}`}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
