import ArrowBack from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router';

import { useConfirm } from '@/components/confirm-context';
import { DataTable } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { StatusChip } from '@/components/StatusChip';
import { adminKeys } from '@/features/admin/keys';
import { SuspendDialog } from '@/features/admin/SuspendDialog';
import { AccountRatesTab } from '@/features/admin-billing/AccountRatesTab';
import { AccountWalletTab } from '@/features/admin-billing/AccountWalletTab';
import { useAuthStore } from '@/features/auth/store';
import { adminApi } from '@/services/api/admin';
import { getErrorMessage } from '@/services/api/errors';
import type { AdminAccountDetail } from '@/services/api/types';
import { auditActorText, auditMetaText } from '@/utils/audit-format';
import { formatInAccountTz } from '@/utils/datetime';

const LimitsCard = lazy(async () => ({
  default: (await import('@/features/admin/LimitsCard')).LimitsCard,
}));

const AccountWhatsAppBillingCard = lazy(async () => ({
  default: (await import('@/features/whatsapp-billing/AccountWhatsAppBillingCard'))
    .AccountWhatsAppBillingCard,
}));
const WhatsAppCard = lazy(async () => ({
  default: (await import('@/features/admin/WhatsAppCard')).WhatsAppCard,
}));

const TAB_KEYS = ['overview', 'rates', 'wallet'] as const;

const LANGUAGES: Record<string, string> = { hi: 'Hindi', en: 'English', hinglish: 'Hinglish' };

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Box>
  );
}

function Overview({ detail }: { detail: AdminAccountDetail }) {
  const { account, owner, usersByStatus } = detail;
  return (
    <Stack spacing={3}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined">
            <CardContent>
              <Stack spacing={1.5}>
                <Fact label="Slug" value={account.slug} />
                <Fact label="Time zone" value={account.timezone} />
                <Fact label="Country" value={account.country} />
                <Fact label="Default language" value={LANGUAGES[account.defaultLanguage]} />
                <Fact
                  label="Created"
                  value={formatInAccountTz(account.createdAt, account.timezone)}
                />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined">
            <CardContent>
              <Stack spacing={1.5}>
                <Fact label="Owner" value={owner ? `${owner.name} · ${owner.email}` : '—'} />
                <Fact
                  label="Users"
                  value={`${detail.usersCount} total · ${usersByStatus.active} active · ${usersByStatus.invited} invited · ${usersByStatus.disabled} disabled`}
                />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      <Suspense fallback={<Skeleton variant="rounded" height={200} />}>
        <LimitsCard
          key={`${String(detail.limits.maxConcurrentCalls)}:${String(detail.limits.dialsPerMinute)}`}
          detail={detail}
        />
      </Suspense>
      <Suspense fallback={<Skeleton variant="rounded" height={160} />}>
        <WhatsAppCard detail={detail} />
      </Suspense>
      <Suspense fallback={<Skeleton variant="rounded" height={160} />}>
        <AccountWhatsAppBillingCard key={JSON.stringify(detail.whatsappBilling)} detail={detail} />
      </Suspense>
      <div>
        <Typography variant="subtitle1" component="h2" sx={{ mb: 1 }}>
          Recent activity
        </Typography>
        <DataTable
          aria-label="Recent activity"
          columns={[
            {
              key: 'at',
              header: 'Time',
              render: (e) => formatInAccountTz(e.at, account.timezone),
              width: 170,
            },
            { key: 'actor', header: 'Who', render: auditActorText },
            { key: 'action', header: 'What', render: (e) => <code>{e.action}</code> },
            { key: 'meta', header: 'Details', render: (e) => auditMetaText(e.meta) },
          ]}
          rows={detail.recentAudit}
          getRowId={(e) => e.id}
          emptyTitle="No activity yet"
        />
      </div>
    </Stack>
  );
}

/** Superadmin: one account — overview, suspend / enable, impersonate. */
export function AdminAccountDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = TAB_KEYS.find((t) => t === params.get('tab')) ?? 'overview';
  const [suspendOpen, setSuspendOpen] = useState(false);

  const detail = useQuery({
    queryKey: adminKeys.account(id),
    queryFn: () => adminApi.account(id),
    meta: { silent: true },
  });
  const enable = useMutation({
    mutationFn: () => adminApi.enable(id),
    onSuccess: (account) => {
      enqueueSnackbar(`${account.name} enabled`, { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: adminKeys.all });
    },
  });
  const impersonate = useMutation({
    mutationFn: () => adminApi.impersonate(id),
    onSuccess: (session) => {
      queryClient.clear();
      useAuthStore.getState().startImpersonation(session);
      void navigate('/', { replace: true });
    },
  });

  const back = (
    <Button component={RouterLink} to="/admin/accounts" startIcon={<ArrowBack />} sx={{ mb: 2 }}>
      All accounts
    </Button>
  );

  if (detail.isPending)
    return (
      <>
        {back}
        <Skeleton variant="text" width={240} height={40} />
        <Skeleton variant="rounded" height={160} />
      </>
    );
  if (detail.error)
    return (
      <>
        {back}
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void detail.refetch()}>
              Retry
            </Button>
          }
        >
          {getErrorMessage(detail.error)}
        </Alert>
      </>
    );

  const { account } = detail.data;
  const suspended = account.status === 'suspended';

  const onImpersonate = async () => {
    const ok = await confirm({
      title: `View as the owner of ${account.name}?`,
      message:
        'You will see the app exactly as the account owner does for up to 30 minutes. Everything you do is recorded in their audit log. Password, ownership and API key changes are blocked.',
      confirmText: 'Start viewing',
    });
    if (ok) impersonate.mutate();
  };
  const onEnable = async () => {
    const ok = await confirm({
      title: `Enable ${account.name}?`,
      message: 'Users can sign in and make calls again.',
      confirmText: 'Enable',
    });
    if (ok) enable.mutate();
  };

  return (
    <>
      {back}
      <PageHeader
        title={account.name}
        subtitle={<StatusChip status={account.status} />}
        actions={
          <>
            {suspended ? (
              <Button
                variant="outlined"
                onClick={() => void onEnable()}
                disabled={enable.isPending}
              >
                Enable
              </Button>
            ) : (
              <Button variant="outlined" color="error" onClick={() => setSuspendOpen(true)}>
                Suspend
              </Button>
            )}
            <Button
              variant="contained"
              onClick={() => void onImpersonate()}
              disabled={impersonate.isPending || !detail.data.owner}
            >
              Impersonate
            </Button>
          </>
        }
      />
      {suspended && account.suspendReason && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Suspended: {account.suspendReason}
        </Alert>
      )}
      {impersonate.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(impersonate.error)}
        </Alert>
      )}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={tab}
          onChange={(_e, v: (typeof TAB_KEYS)[number]) => setParams({ tab: v }, { replace: true })}
          aria-label="Account sections"
        >
          <Tab value="overview" label="Overview" />
          <Tab value="rates" label="Rates" />
          <Tab value="wallet" label="Wallet" />
        </Tabs>
      </Box>
      {tab === 'overview' && <Overview detail={detail.data} />}
      {tab === 'rates' && <AccountRatesTab accountId={account.id} accountName={account.name} />}
      {tab === 'wallet' && (
        <AccountWalletTab
          accountId={account.id}
          accountName={account.name}
          timezone={account.timezone}
        />
      )}
      {suspendOpen && (
        <SuspendDialog
          accountId={account.id}
          accountName={account.name}
          onClose={() => setSuspendOpen(false)}
        />
      )}
    </>
  );
}
