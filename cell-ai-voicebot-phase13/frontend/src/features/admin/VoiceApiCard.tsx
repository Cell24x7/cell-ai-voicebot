import {
  Alert,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  ListItemText,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { getErrorMessage } from '@/services/api/errors';
import type { AdminAccountDetail } from '@/services/api/types';
import { voiceAdminApi, voiceApiKeys } from '@/services/api/voice-api';

import { adminKeys } from './keys';

/** Superadmin: recorded-voice / IVR campaigns (Cell24x7) for this account. */
export function VoiceApiCard({ detail }: { detail: AdminAccountDetail }) {
  const id = detail.account.id;
  const initial = detail.voiceApi ?? { enabled: false, ivrIds: [], ivrEstimateSec: 60 };
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [ivrIds, setIvrIds] = useState<number[]>(initial.ivrIds);
  const [estimate, setEstimate] = useState(String(initial.ivrEstimateSec));
  const ivrs = useQuery({ queryKey: voiceApiKeys.ivrs, queryFn: () => voiceAdminApi.ivrs() });
  const sec = Number(estimate);
  const secBad = !(Number.isInteger(sec) && sec >= 15 && sec <= 120);
  const save = useMutation({
    mutationFn: () => voiceAdminApi.setAccount(id, { enabled, ivrIds, ivrEstimateSec: sec }),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Recorded voice settings saved', { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: adminKeys.account(id) });
    },
  });
  return (
    <Card variant="outlined" component="section" aria-label="Recorded voice">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="subtitle1" component="h2">
            Recorded voice (Cell24x7)
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Campaigns that play one audio or IVR menu to every number through Cell24x7. Set the
            price per 15 s in this account’s rate card.
          </Typography>
          <FormControlLabel
            control={<Switch checked={enabled} onChange={(_e, v) => setEnabled(v)} />}
            label={enabled ? 'On for this account' : 'Off'}
          />
          <TextField
            select
            label="IVR menus this account may use"
            value={ivrIds}
            size="small"
            disabled={ivrs.isPending}
            slotProps={{
              select: {
                multiple: true,
                renderValue: (v) => `${String((v as number[]).length)} selected`,
              },
            }}
            onChange={(e) => setIvrIds(e.target.value as unknown as number[])}
          >
            {(ivrs.data ?? []).map((i) => (
              <MenuItem key={i.id} value={i.id} disabled={!i.runnable}>
                <Checkbox size="small" checked={ivrIds.includes(i.id)} />
                <ListItemText primary={i.name} secondary={i.runnable ? null : 'Not runnable'} />
              </MenuItem>
            ))}
          </TextField>
          {ivrs.error && <Alert severity="warning">{getErrorMessage(ivrs.error)}</Alert>}
          <TextField
            label="Seconds billed per number for an IVR"
            size="small"
            type="number"
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
            error={secBad}
            helperText={secBad ? '15 to 120' : 'An IVR’s length is not known up front'}
            sx={{ maxWidth: 320 }}
          />
          {save.error && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
          <div>
            <Button disabled={secBad || save.isPending} onClick={() => save.mutate()}>
              Save recorded voice
            </Button>
          </div>
        </Stack>
      </CardContent>
    </Card>
  );
}
