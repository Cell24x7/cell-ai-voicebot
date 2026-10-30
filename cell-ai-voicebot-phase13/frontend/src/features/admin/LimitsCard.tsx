import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { useConfirm } from '@/components/confirm-context';
import { adminApi } from '@/services/api/admin';
import { getErrorMessage } from '@/services/api/errors';
import type { AdminAccountDetail } from '@/services/api/types';

import { adminKeys } from './keys';

/** Mirrors the backend ACCOUNT_LIMIT_RANGES. */
const RANGES = {
  maxConcurrentCalls: { min: 1, max: 200 },
  dialsPerMinute: { min: 1, max: 600 },
} as const;
type LimitKey = keyof typeof RANGES;

const inRange = (k: LimitKey, v: number) =>
  Number.isInteger(v) && v >= RANGES[k].min && v <= RANGES[k].max;

/**
 * Superadmin account detail: dialing limits, active campaigns, the emergency
 * "Pause all campaigns" and lifting those pauses one by one.
 */
export function LimitsCard({ detail }: { detail: AdminAccountDetail }) {
  const id = detail.account.id;
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [draft, setDraft] = useState({
    maxConcurrentCalls: String(detail.limits.maxConcurrentCalls),
    dialsPerMinute: String(detail.limits.dialsPerMinute),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: adminKeys.account(id) });
  const save = useMutation({
    mutationFn: () =>
      adminApi.setLimits(id, {
        maxConcurrentCalls: Number(draft.maxConcurrentCalls),
        dialsPerMinute: Number(draft.dialsPerMinute),
      }),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Limits saved', { variant: 'success' });
      refresh();
    },
  });
  const pause = useMutation({
    mutationFn: () => adminApi.pauseCampaigns(id),
    meta: { silent: true },
    onSuccess: ({ paused }) => {
      enqueueSnackbar(`${String(paused)} campaign${paused === 1 ? '' : 's'} paused`, {
        variant: 'success',
      });
      refresh();
    },
  });
  const resume = useMutation({
    mutationFn: (campaignId: string) => adminApi.resumeCampaign(id, campaignId),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Campaign resumed', { variant: 'success' });
      refresh();
    },
  });
  const bad = (k: LimitKey) => !inRange(k, Number(draft[k])) || draft[k].trim() === '';
  const dirty =
    Number(draft.maxConcurrentCalls) !== detail.limits.maxConcurrentCalls ||
    Number(draft.dialsPerMinute) !== detail.limits.dialsPerMinute;
  const error = save.error ?? pause.error ?? resume.error;
  const field = (k: LimitKey, label: string) => (
    <TextField
      label={label}
      type="number"
      size="small"
      value={draft[k]}
      onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
      error={bad(k)}
      helperText={`${String(RANGES[k].min)}–${String(RANGES[k].max)}`}
      slotProps={{ htmlInput: RANGES[k] }}
    />
  );
  return (
    <Card variant="outlined" component="section" aria-label="Calling limits">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="subtitle1" component="h2">
            Calling limits
          </Typography>
          {error && <Alert severity="error">{getErrorMessage(error)}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {field('maxConcurrentCalls', 'Max concurrent calls')}
            {field('dialsPerMinute', 'Dials per minute')}
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              disabled={
                !dirty || bad('maxConcurrentCalls') || bad('dialsPerMinute') || save.isPending
              }
              onClick={() => save.mutate()}
            >
              Save limits
            </Button>
          </Stack>
          <Typography variant="body2">
            Active campaigns (scheduled, running or paused): {detail.activeCampaigns}
          </Typography>
          <div>
            <Button
              color="error"
              variant="outlined"
              disabled={pause.isPending}
              onClick={() =>
                void confirm({
                  title: `Pause every campaign of ${detail.account.name}?`,
                  message:
                    'Running and scheduled campaigns stop dialing now. Calls in progress finish. Only a superadmin can resume them.',
                  confirmText: 'Pause all',
                  destructive: true,
                }).then((ok) => ok && pause.mutate())
              }
            >
              Pause all campaigns
            </Button>
          </div>
          {detail.adminPausedCampaigns.length > 0 && (
            <div>
              <Typography variant="subtitle2">Paused by the platform team</Typography>
              <List dense aria-label="Paused by the platform team">
                {detail.adminPausedCampaigns.map((c) => (
                  <ListItem
                    key={c.id}
                    disableGutters
                    secondaryAction={
                      <Button
                        size="small"
                        disabled={resume.isPending}
                        onClick={() => resume.mutate(c.id)}
                        aria-label={`Resume ${c.name}`}
                      >
                        Resume
                      </Button>
                    }
                  >
                    <ListItemText primary={c.name} />
                  </ListItem>
                ))}
              </List>
            </div>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
