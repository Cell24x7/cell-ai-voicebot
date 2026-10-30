import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Stack,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useRef, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';

import { useConfirm } from '@/components/confirm-context';
import { campaignsApi } from '@/services/api/campaigns';
import { getErrorMessage } from '@/services/api/errors';
import type { Campaign } from '@/services/api/types';

import { campaignKeys } from '../keys';
import { useCanRunCampaigns, useCanWriteCampaigns } from '../queries';

const FINAL = ['completed', 'canceled', 'failed'];
const DELETABLE = ['draft', 'completed', 'canceled', 'failed'];

type Action = 'start' | 'pause' | 'resume' | 'cancel' | 'duplicate' | 'delete';

/** The detail page's buttons, by role and state (PHASE_8_PROMPT T8.12 §1). */
export function CampaignControls({ campaign }: { campaign: Campaign }) {
  const canWrite = useCanWriteCampaigns();
  const canRun = useCanRunCampaigns();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [canceling, setCanceling] = useState(false);
  const [hangUp, setHangUp] = useState(false);
  const startKey = useRef<string | null>(null);
  const s = campaign.status;
  const act = useMutation({
    mutationFn: async (action: Action): Promise<Campaign | null> => {
      switch (action) {
        case 'start':
          startKey.current ??= crypto.randomUUID();
          return campaignsApi.start(campaign.id, startKey.current);
        case 'pause':
          return campaignsApi.pause(campaign.id);
        case 'resume':
          return campaignsApi.resume(campaign.id);
        case 'cancel':
          return campaignsApi.cancel(campaign.id, hangUp);
        case 'duplicate':
          return campaignsApi.duplicate(campaign.id);
        case 'delete':
          await campaignsApi.remove(campaign.id);
          return null;
      }
    },
    meta: { silent: true },
    onSuccess: (result, action) => {
      if (action === 'start') startKey.current = null;
      void queryClient.invalidateQueries({ queryKey: campaignKeys.all });
      if (result && action !== 'duplicate') {
        queryClient.setQueryData(campaignKeys.detail(campaign.id), result);
      }
      if (action === 'cancel') setCanceling(false);
      if (action === 'duplicate' && result) {
        enqueueSnackbar('Copied as a new draft', { variant: 'success' });
        void navigate(`/campaigns/${result.id}/edit`);
      }
      if (action === 'delete') {
        enqueueSnackbar('Campaign deleted', { variant: 'success' });
        void navigate('/campaigns');
      }
    },
  });
  const busy = act.isPending;
  const remove = async () => {
    const ok = await confirm({
      title: `Delete "${campaign.name}"?`,
      message: 'Its results stay in the call history.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (ok) act.mutate('delete');
  };
  return (
    <Stack spacing={1} sx={{ alignItems: { sm: 'flex-end' } }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {canRun && s === 'draft' && (
          <Button variant="contained" disabled={busy} onClick={() => act.mutate('start')}>
            {campaign.schedule.startAt || campaign.schedule.recurrence ? 'Schedule' : 'Start'}
          </Button>
        )}
        {canRun && (s === 'running' || s === 'scheduled') && (
          <Button variant="outlined" disabled={busy} onClick={() => act.mutate('pause')}>
            Pause
          </Button>
        )}
        {canRun && s === 'paused' && campaign.pauseReason !== 'admin' && (
          <Button variant="contained" disabled={busy} onClick={() => act.mutate('resume')}>
            Resume
          </Button>
        )}
        {canWrite && !FINAL.includes(s) && (
          <Button component={RouterLink} to={`/campaigns/${campaign.id}/edit`}>
            Edit
          </Button>
        )}
        {canRun && ['scheduled', 'running', 'paused'].includes(s) && (
          <Button color="error" disabled={busy} onClick={() => setCanceling(true)}>
            Cancel
          </Button>
        )}
        {canWrite && (
          <Button disabled={busy} onClick={() => act.mutate('duplicate')}>
            Duplicate
          </Button>
        )}
        {canWrite && DELETABLE.includes(s) && (
          <Button color="error" disabled={busy} onClick={() => void remove()}>
            Delete
          </Button>
        )}
      </Stack>
      {act.error && !canceling && (
        <Alert severity="error" onClose={() => act.reset()}>
          {getErrorMessage(act.error)}
        </Alert>
      )}
      <Dialog open={canceling} onClose={() => setCanceling(false)}>
        <DialogTitle>Cancel “{campaign.name}”?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            No more calls are made; waiting contacts are canceled. This can’t be undone.
          </DialogContentText>
          <FormControlLabel
            control={<Checkbox checked={hangUp} onChange={(e) => setHangUp(e.target.checked)} />}
            label="Also hang up calls in progress"
          />
          {act.error && <Alert severity="error">{getErrorMessage(act.error)}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCanceling(false)}>Keep running</Button>
          <Button
            color="error"
            variant="contained"
            disabled={busy}
            onClick={() => act.mutate('cancel')}
          >
            Cancel campaign
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
