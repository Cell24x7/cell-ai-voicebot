import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined';
import { IconButton, ListItemText, Menu, MenuItem } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { useConfirm } from '@/components/confirm-context';
import { campaignsApi } from '@/services/api/campaigns';
import { getErrorMessage } from '@/services/api/errors';
import type { CampaignListItem } from '@/services/api/types';

import { campaignKeys } from './keys';
import { useCanRunCampaigns, useCanWriteCampaigns } from './queries';

const DELETABLE = ['draft', 'completed', 'canceled', 'failed'];

/** Row menu: pause / resume / duplicate / delete — by role and state. */
export function CampaignActions({ campaign }: { campaign: CampaignListItem }) {
  const canWrite = useCanWriteCampaigns();
  const canRun = useCanRunCampaigns();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: campaignKeys.all });
  const act = useMutation({
    mutationFn: async (action: 'pause' | 'resume' | 'duplicate' | 'delete') => {
      if (action === 'pause') return campaignsApi.pause(campaign.id);
      if (action === 'resume') return campaignsApi.resume(campaign.id);
      if (action === 'duplicate') return campaignsApi.duplicate(campaign.id);
      await campaignsApi.remove(campaign.id);
      return null;
    },
    meta: { silent: true },
    onSuccess: (result, action) => {
      refresh();
      if (action === 'duplicate' && result) {
        enqueueSnackbar('Copied as a new draft', { variant: 'success' });
        void navigate(`/campaigns/${result.id}/edit`);
      }
      if (action === 'delete') enqueueSnackbar('Campaign deleted', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  const s = campaign.status;
  const items: { key: string; label: string; run: () => void }[] = [];
  if (canRun && (s === 'running' || s === 'scheduled')) {
    items.push({ key: 'pause', label: 'Pause', run: () => act.mutate('pause') });
  }
  if (canRun && s === 'paused' && campaign.pauseReason !== 'admin') {
    items.push({ key: 'resume', label: 'Resume', run: () => act.mutate('resume') });
  }
  if (canWrite) {
    items.push({ key: 'duplicate', label: 'Duplicate', run: () => act.mutate('duplicate') });
  }
  if (canWrite && DELETABLE.includes(s)) {
    items.push({
      key: 'delete',
      label: 'Delete',
      run: () =>
        void confirm({
          title: `Delete "${campaign.name}"?`,
          message: 'Its results stay in the call history.',
          confirmText: 'Delete',
          destructive: true,
        }).then((ok) => {
          if (ok) act.mutate('delete');
        }),
    });
  }
  if (!items.length) return null;
  return (
    <>
      <IconButton
        size="small"
        aria-label={`Actions for ${campaign.name}`}
        onClick={(e) => setAnchor(e.currentTarget)}
        disabled={act.isPending}
      >
        <MoreVertOutlined fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {items.map((item) => (
          <MenuItem
            key={item.key}
            onClick={() => {
              setAnchor(null);
              item.run();
            }}
          >
            <ListItemText>{item.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
