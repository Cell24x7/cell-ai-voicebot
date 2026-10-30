import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { lazy, Suspense } from 'react';

import { PageHeader } from '@/components/PageHeader';
import { usePermission, useSession } from '@/features/auth/hooks';
import { RecentCallsCard } from '@/features/calls/RecentCallsCard';
import { SystemInfoCard } from '@/features/system/SystemInfoCard';
import { useHasWallet } from '@/features/wallet/queries';
import { WalletCard } from '@/features/wallet/WalletCard';

const DashboardKpis = lazy(async () => ({
  default: (await import('@/features/reports/DashboardKpis')).DashboardKpis,
}));
const CampaignsCard = lazy(async () => ({
  default: (await import('@/features/campaigns/CampaignsCard')).CampaignsCard,
}));
const InboxDashboardCard = lazy(async () => ({
  default: (await import('@/features/inbox/InboxDashboardCard')).InboxDashboardCard,
}));
const WhatsAppDashboardCard = lazy(async () => ({
  default: (await import('@/features/whatsapp/WhatsAppDashboardCard')).WhatsAppDashboardCard,
}));

export function DashboardPage() {
  const session = useSession();
  const canSeeWallet = useHasWallet();
  const canSeeCalls = usePermission('calls.read');
  const canSeeCampaigns = usePermission('campaigns.read');
  const canSeeWhatsApp = usePermission('whatsapp.read');
  const canSeeInbox = usePermission('inbox.read');
  const canSeeReports = usePermission('reports.read');
  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Welcome, ${session?.user.name ?? ''}`} />
      <Grid container spacing={2}>
        {canSeeReports && (
          <Grid size={12}>
            <Suspense fallback={<Skeleton variant="rounded" height={120} />}>
              <DashboardKpis />
            </Suspense>
          </Grid>
        )}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                Account
              </Typography>
              <Typography variant="h6">{session?.account.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                Your role: {session?.role.name} · Timezone: {session?.account.timezone}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <SystemInfoCard />
        </Grid>
        {canSeeWallet && (
          <Grid size={{ xs: 12, md: 4 }}>
            <WalletCard />
          </Grid>
        )}
        {canSeeCalls && (
          <Grid size={{ xs: 12, md: 8 }}>
            <RecentCallsCard />
          </Grid>
        )}
        {canSeeCampaigns && (
          <Grid size={{ xs: 12, md: 4 }}>
            <Suspense fallback={<Skeleton variant="rounded" height={120} />}>
              <CampaignsCard />
            </Suspense>
          </Grid>
        )}
        {canSeeInbox && (
          <Grid size={{ xs: 12, md: 4 }}>
            <Suspense fallback={null}>
              <InboxDashboardCard />
            </Suspense>
          </Grid>
        )}
        {canSeeWhatsApp && (
          <Grid size={{ xs: 12, md: 4 }}>
            <Suspense fallback={null}>
              <WhatsAppDashboardCard />
            </Suspense>
          </Grid>
        )}
      </Grid>
    </>
  );
}
