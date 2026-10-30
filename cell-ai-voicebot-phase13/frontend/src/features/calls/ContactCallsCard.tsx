import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router';

import { RelativeTime } from '@/components/RelativeTime';
import { usePermission } from '@/features/auth/hooks';
import {
  CAMPAIGN_STATUS_LABELS,
  campaignStatusColor,
  dispositionLabel,
} from '@/features/campaigns/labels';
import { useCampaigns } from '@/features/campaigns/queries';
import type { Contact } from '@/services/api/types';

import { STATUS_LABELS, statusColor } from './labels';
import { useCalls } from './queries';

/** Contact page: call facts, the last calls and the campaigns that included this contact. */
export function ContactCallsCard({ contact }: { contact: Contact }) {
  const canCampaigns = usePermission('campaigns.read');
  const calls = useCalls({ contactId: contact.id, limit: 5 });
  const campaigns = useCampaigns({ contactId: contact.id, limit: 10 }, canCampaigns);
  const rows = calls.data?.pages[0]?.data ?? [];
  const campaignRows = campaigns.data?.pages[0]?.data ?? [];
  return (
    <Card variant="outlined" component="section" aria-label="Call history">
      <CardContent>
        <Stack
          direction="row"
          sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}
        >
          <Typography variant="subtitle1" component="h2">
            Call history
          </Typography>
          <Link component={RouterLink} to={`/calls?contactId=${contact.id}`} variant="body2">
            All calls
          </Link>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {contact.callCount === 0 ? (
            'Never called.'
          ) : (
            <>
              {contact.callCount} {contact.callCount === 1 ? 'call' : 'calls'}
              {contact.lastCalledAt && (
                <>
                  {' '}
                  · last <RelativeTime value={contact.lastCalledAt} />
                </>
              )}
              {contact.lastDisposition && ` · ${dispositionLabel(contact.lastDisposition) ?? ''}`}
            </>
          )}
        </Typography>
        {calls.isPending && <Skeleton variant="rounded" height={60} />}
        {calls.isError && (
          <Typography variant="body2" color="error">
            Calls could not be loaded.
          </Typography>
        )}
        <Stack spacing={1}>
          {rows.map((c) => (
            <Stack key={c.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Link
                component={RouterLink}
                to={`/calls/${c.id}`}
                variant="body2"
                sx={{ flex: 1, minWidth: 0 }}
                noWrap
              >
                {c.campaign ? c.campaign.name : (c.source.name ?? 'Call')}
              </Link>
              <Chip size="small" color={statusColor(c.status)} label={STATUS_LABELS[c.status]} />
              <Typography variant="caption" color="text.secondary">
                <RelativeTime value={c.createdAt} />
              </Typography>
            </Stack>
          ))}
        </Stack>
        {canCampaigns && campaignRows.length > 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
              Campaigns
            </Typography>
            <Stack
              spacing={1}
              component="ul"
              sx={{ m: 0, p: 0, listStyle: 'none' }}
              aria-label="Campaigns"
            >
              {campaignRows.map((cp) => (
                <Stack
                  key={cp.id}
                  direction="row"
                  spacing={1}
                  component="li"
                  sx={{ alignItems: 'center' }}
                >
                  <Link
                    component={RouterLink}
                    to={`/campaigns/${cp.id}`}
                    variant="body2"
                    sx={{ flex: 1 }}
                  >
                    {cp.name}
                  </Link>
                  <Chip
                    size="small"
                    color={campaignStatusColor(cp.status)}
                    label={CAMPAIGN_STATUS_LABELS[cp.status]}
                  />
                </Stack>
              ))}
            </Stack>
          </>
        )}
      </CardContent>
    </Card>
  );
}
