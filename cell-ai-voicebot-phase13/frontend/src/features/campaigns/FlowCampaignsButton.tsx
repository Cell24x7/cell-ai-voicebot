import CampaignOutlined from '@mui/icons-material/CampaignOutlined';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';

import { usePermission } from '@/features/auth/hooks';
import type { Flow } from '@/services/api/types';

import { CAMPAIGN_STATUS_LABELS } from './labels';
import { useCampaigns, useCanWriteCampaigns } from './queries';

/** Flow builder: the campaigns using this flow + "Create campaign" (wizard `?flowId=`). */
export function FlowCampaignsButton({ flow }: { flow: Flow }) {
  const canRead = usePermission('campaigns.read');
  const canWrite = useCanWriteCampaigns();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const campaigns = useCampaigns({ flowId: flow.id, limit: 20 }, canRead);
  if (!canRead) return null;
  const rows = campaigns.data?.pages[0]?.data ?? [];
  const startable = Boolean(flow.publishedVersion) && flow.triggers.includes('campaign');
  return (
    <>
      <Button startIcon={<CampaignOutlined />} onClick={(e) => setAnchor(e.currentTarget)}>
        Campaigns{rows.length ? ` (${String(rows.length)})` : ''}
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {rows.length === 0 && (
          <MenuItem disabled>
            <ListItemText primary="Not used in any campaign yet" />
          </MenuItem>
        )}
        {rows.map((c) => (
          <MenuItem key={c.id} component={RouterLink} to={`/campaigns/${c.id}`}>
            <ListItemText primary={c.name} secondary={CAMPAIGN_STATUS_LABELS[c.status]} />
          </MenuItem>
        ))}
        {canWrite && <Divider />}
        {canWrite && (
          <MenuItem
            component={RouterLink}
            to={`/campaigns/new?flowId=${flow.id}`}
            disabled={!startable}
          >
            <ListItemText
              primary="Create campaign"
              secondary={
                startable ? undefined : 'Publish it with a start step that allows campaigns'
              }
            />
          </MenuItem>
        )}
      </Menu>
    </>
  );
}
