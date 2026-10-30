import { Alert, Box, Chip, CircularProgress, Link, Stack, Tab, Tabs } from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router';

import { PageHeader } from '@/components/PageHeader';
import { useAuthStore } from '@/features/auth/store';
import { CampaignControls } from '@/features/campaigns/detail/CampaignControls';
import { ExportButton } from '@/features/campaigns/detail/ExportButton';
import { ActivityTab, LiveCallsPanel, RunsTab } from '@/features/campaigns/detail/OtherTabs';
import { ProgressPanel } from '@/features/campaigns/detail/ProgressPanel';
import { ResultsTab } from '@/features/campaigns/detail/ResultsTab';
import { StatusBanner } from '@/features/campaigns/detail/StatusBanner';
import { useCampaignEta } from '@/features/campaigns/eta';
import {
  ACTIVE_CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABELS,
  campaignStatusColor,
} from '@/features/campaigns/labels';
import { useCampaign, useCampaignLiveUpdates } from '@/features/campaigns/queries';
import { draftFromCampaign } from '@/features/campaigns/wizard/draft';
import { ReviewStep } from '@/features/campaigns/wizard/ReviewStep';
import { getErrorMessage } from '@/services/api/errors';

type TabKey = 'results' | 'runs' | 'settings' | 'activity';

/** `/campaigns/:id` — live dashboard, controls, results, runs, settings, activity. */
export function CampaignDetailPage() {
  const { id = '' } = useParams();
  const timezone = useAuthStore((s) => s.session?.account.timezone ?? 'Asia/Kolkata');
  const campaign = useCampaign(id);
  useCampaignLiveUpdates(id);
  const eta = useCampaignEta(campaign.data, timezone);
  const [tab, setTab] = useState<TabKey>('results');
  if (campaign.isPending) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress aria-label="Loading campaign" />
      </Box>
    );
  }
  if (campaign.error) return <Alert severity="error">{getErrorMessage(campaign.error)}</Alert>;
  const c = campaign.data;
  const recurringParent = c.recurring && !c.parentId;
  const current: TabKey = tab === 'runs' && !recurringParent ? 'results' : tab;
  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }} component="span">
            <Chip
              size="small"
              color={campaignStatusColor(c.status)}
              label={CAMPAIGN_STATUS_LABELS[c.status]}
            />
            {c.mode === 'dry_run' && <Chip size="small" variant="outlined" label="Dry run" />}
            <Link component={RouterLink} to={`/flows/${c.flow.id}`}>
              {c.flow.name || 'Deleted flow'}
              {c.flow.version ? ` v${String(c.flow.version)}` : ''}
            </Link>
            {c.parentId && (
              <Link component={RouterLink} to={`/campaigns/${c.parentId}`}>
                Run #{c.runNumber} of a repeating campaign
              </Link>
            )}
          </Stack>
        }
        actions={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
            <ExportButton campaignId={c.id} />
            <CampaignControls campaign={c} />
          </Stack>
        }
      />
      <Stack spacing={2}>
        <StatusBanner campaign={c} timezone={timezone} />
        {!recurringParent && <ProgressPanel campaign={c} eta={eta} />}
        <LiveCallsPanel
          campaignId={c.id}
          enabled={c.status === 'running' || c.status === 'paused'}
        />
        <Tabs value={current} onChange={(_e, v: TabKey) => setTab(v)} aria-label="Campaign tabs">
          <Tab value="results" label="Results" />
          {recurringParent && <Tab value="runs" label="Runs" />}
          <Tab value="settings" label="Settings" />
          <Tab value="activity" label="Activity" />
        </Tabs>
        {current === 'results' && (
          <ResultsTab campaignId={c.id} live={ACTIVE_CAMPAIGN_STATUSES.includes(c.status)} />
        )}
        {current === 'runs' && <RunsTab campaignId={c.id} timezone={timezone} />}
        {current === 'settings' && <ReviewStep draft={draftFromCampaign(c)} />}
        {current === 'activity' && <ActivityTab campaign={c} timezone={timezone} />}
      </Stack>
    </>
  );
}
