import MyLocationOutlined from '@mui/icons-material/MyLocationOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';

import { geoErrorMessage } from './helpers';

export interface LocationInput {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

const inRange = (value: string, limit: number) => {
  const n = Number(value);
  return value.trim() !== '' && Number.isFinite(n) && Math.abs(n) <= limit;
};

/** Send a location: latitude / longitude (typed or "Use my location"), optional name and address. */
export function LocationDialog({
  onSend,
  onClose,
}: {
  onSend: (location: LocationInput) => void;
  onClose: () => void;
}) {
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const latOk = inRange(lat, 90);
  const lngOk = inRange(lng, 180);

  const locate = () => {
    setGeoError(null);
    if (!('geolocation' in navigator)) {
      setGeoError(geoErrorMessage(null));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
      },
      (err) => {
        setLocating(false);
        setGeoError(geoErrorMessage(err.code));
      },
      { timeout: 10_000, maximumAge: 60_000 },
    );
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="location-title">
      <DialogTitle id="location-title">Send a location</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {geoError && <Alert severity="warning">{geoError}</Alert>}
          <Button
            variant="outlined"
            startIcon={<MyLocationOutlined />}
            onClick={locate}
            disabled={locating}
          >
            {locating ? 'Finding you…' : 'Use my location'}
          </Button>
          <Stack direction="row" spacing={1}>
            <TextField
              label="Latitude"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              error={lat !== '' && !latOk}
              helperText={lat !== '' && !latOk ? '−90 to 90' : ' '}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />
            <TextField
              label="Longitude"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              error={lng !== '' && !lngOk}
              helperText={lng !== '' && !lngOk ? '−180 to 180' : ' '}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />
          </Stack>
          <TextField
            label="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            label="Address (optional)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!latOk || !lngOk}
          onClick={() =>
            onSend({
              latitude: Number(lat),
              longitude: Number(lng),
              ...(name.trim() ? { name: name.trim() } : {}),
              ...(address.trim() ? { address: address.trim() } : {}),
            })
          }
        >
          Send location
        </Button>
      </DialogActions>
    </Dialog>
  );
}
