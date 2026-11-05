import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';
import { Link as RouterLink, Navigate, useNavigate, useParams } from 'react-router';

import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { RelativeTime } from '@/components/RelativeTime';
import { StatusChip } from '@/components/StatusChip';
import { useSession } from '@/features/auth/hooks';
import { AddCustomerDialog } from '@/features/resellers/AddCustomerDialog';
import { resellerKeys } from '@/features/resellers/keys';
import { useCanManageReseller, useIsReseller } from '@/features/resellers/permissions';
import { useResellerCustomers, useResellerSummary } from '@/features/resellers/queries';
import { getErrorMessage } from '@/services/api/errors';
import { resellersApi } from '@/services/api/resellers';
import type { ResellerCustomer, ResellerStatementRow } from '@/services/api/types';
import { saveBlob } from '@/utils/download';
import { formatCurrencyMicros, formatNumber } from '@/utils/format';

const TABS = ['dashboard', 'customers', 'statement', 'settings'] as const;
type TabKey = (typeof TABS)[number];
const LABELS: Record<TabKey, string> = {
  dashboard: 'Dashboard',
  customers: 'Customers',
  statement: 'Statement',
  settings: 'Settings',
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h5">{value}</Typography>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const s = useResellerSummary();
  if (!s.data) return null;
  const d = s.data;
  return (
    <Stack spacing={2}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Stat label="Active customers" value={formatNumber(d.customers.active)} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Stat label="Suspended" value={formatNumber(d.customers.suspended)} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Stat
            label="Credit given this month"
            value={formatCurrencyMicros(d.creditGivenThisMonthMicros)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Stat
            label="Customers' spend (30 days)"
            value={formatCurrencyMicros(d.customersSpend30d.totalMicros)}
          />
        </Grid>
      </Grid>
      <Card variant="outlined" component="section" aria-label="Low on credit">
        <CardContent>
          <Typography variant="subtitle1" component="h2" gutterBottom>
            Low on credit
          </Typography>
          {d.lowBalanceCustomers.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Every customer has enough credit.
            </Typography>
          ) : (
            <Stack spacing={0.5}>
              {d.lowBalanceCustomers.map((c) => (
                <Typography key={c.id} variant="body2">
                  <Link component={RouterLink} to={`/reseller/customers/${c.id}`}>
                    {c.name}
                  </Link>{' '}
                  · {formatCurrencyMicros(c.availableMicros)}
                </Typography>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}

const columns: Column<ResellerCustomer>[] = [
  {
    key: 'name',
    header: 'Customer',
    render: (c) => (
      <Link component={RouterLink} to={`/reseller/customers/${c.id}`}>
        {c.name}
      </Link>
    ),
  },
  { key: 'owner', header: 'Owner', render: (c) => c.owner?.email ?? '—' },
  {
    key: 'wallet',
    header: 'Credit',
    align: 'right',
    render: (c) => formatCurrencyMicros(c.wallet.availableMicros),
  },
  {
    key: 'spend',
    header: 'Spend (30 d)',
    align: 'right',
    render: (c) => formatCurrencyMicros(c.spend30dMicros),
  },
  { key: 'status', header: 'Status', render: (c) => <StatusChip status={c.status} /> },
  {
    key: 'active',
    header: 'Last sign-in',
    render: (c) => (c.lastActiveAt ? <RelativeTime value={c.lastActiveAt} /> : 'Never'),
  },
];

function Customers() {
  const canManage = useCanManageReseller();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | 'active' | 'suspended'>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [adding, setAdding] = useState(false);
  const list = useResellerCustomers({
    page,
    limit,
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(status ? { status } : {}),
  });
  return (
    <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          size="small"
          label="Search customers"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <TextField
          size="small"
          select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as '' | 'active' | 'suspended')}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="active">Active</MenuItem>
          <MenuItem value="suspended">Suspended</MenuItem>
        </TextField>
        <Stack sx={{ flexGrow: 1 }} />
        {canManage && (
          <Button variant="contained" onClick={() => setAdding(true)}>
            Add customer
          </Button>
        )}
      </Stack>
      <DataTable
        aria-label="Customers"
        columns={columns}
        rows={list.data?.data}
        getRowId={(c) => c.id}
        loading={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        emptyTitle="No customers yet"
        emptyDescription="Add a customer to create their account and give them credit."
        pagination={
          list.data
            ? {
                page,
                limit,
                total: list.data.meta.total,
                onPageChange: setPage,
                onLimitChange: (l) => {
                  setLimit(l);
                  setPage(1);
                },
              }
            : undefined
        }
      />
      {adding && <AddCustomerDialog onClose={() => setAdding(false)} />}
    </>
  );
}

const statementColumns: Column<ResellerStatementRow>[] = [
  { key: 'at', header: 'Date', render: (r) => <RelativeTime value={r.at} /> },
  { key: 'customer', header: 'Customer', render: (r) => r.customer?.name ?? '—' },
  {
    key: 'direction',
    header: 'Type',
    render: (r) => (
      <Chip
        size="small"
        label={r.direction === 'given' ? 'Given' : 'Taken back'}
        color={r.direction === 'given' ? 'primary' : 'default'}
      />
    ),
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    render: (r) => formatCurrencyMicros(r.amountMicros),
  },
  { key: 'note', header: 'Note', render: (r) => r.note ?? '' },
];

function Statement() {
  const rows = useQuery({
    queryKey: resellerKeys.statement({}),
    queryFn: () => resellersApi.statement(),
    placeholderData: keepPreviousData,
  });
  const download = useMutation({
    mutationFn: () => resellersApi.statementCsv(),
    meta: { silent: true },
    onSuccess: (blob) => saveBlob(blob, 'reseller-statement.csv'),
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  return (
    <>
      <Stack direction="row" sx={{ mb: 2, justifyContent: 'flex-end' }}>
        <Button onClick={() => download.mutate()} disabled={download.isPending}>
          Download CSV
        </Button>
      </Stack>
      <DataTable
        aria-label="Statement"
        columns={statementColumns}
        rows={rows.data}
        getRowId={(r) => `${r.id}-${r.direction}`}
        loading={rows.isPending}
        error={rows.error}
        onRetry={() => void rows.refetch()}
        emptyTitle="No credit moved yet"
      />
    </>
  );
}

function Settings() {
  const queryClient = useQueryClient();
  const canManage = useCanManageReseller();
  const settings = useQuery({
    queryKey: resellerKeys.settings,
    queryFn: () => resellersApi.settings(),
  });
  const save = useMutation({
    mutationFn: (customersCanTopUp: boolean) => resellersApi.updateSettings({ customersCanTopUp }),
    meta: { silent: true },
    onSuccess: (data) => {
      queryClient.setQueryData(resellerKeys.settings, data);
      enqueueSnackbar('Settings saved', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  if (!settings.data) return null;
  return (
    <Card variant="outlined">
      <CardContent>
        <FormControlLabel
          control={
            <Switch
              checked={settings.data.customersCanTopUp}
              disabled={!canManage || save.isPending}
              onChange={(e) => save.mutate(e.target.checked)}
            />
          }
          label="Customers can add money by card / UPI themselves"
        />
        <Typography variant="body2" color="text.secondary">
          Off (recommended): you add credit to each customer from your wallet, and they see
          &quot;Credit is added by your provider&quot;. On: they can also pay the platform directly.
        </Typography>
      </CardContent>
    </Card>
  );
}

/** Phase 19: the reseller panel (`/reseller/:tab`). */
export function ResellerPage() {
  const isReseller = useIsReseller();
  const session = useSession();
  const navigate = useNavigate();
  const { tab: raw } = useParams();
  const tab = TABS.find((t) => t === raw) ?? 'dashboard';
  if (!isReseller) return <Navigate to="/" replace />;
  const pending = session?.account.reseller?.status === 'pending_approval';
  return (
    <>
      <PageHeader title="Reseller" subtitle="Your customers, their credit and your statement." />
      {pending && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Your reseller account is waiting for approval. You can look around; adding customers and
          moving credit start once it is approved.
        </Alert>
      )}
      <Tabs
        value={tab}
        onChange={(_e, v: TabKey) => void navigate(`/reseller/${v}`)}
        sx={{ mb: 2 }}
      >
        {TABS.map((t) => (
          <Tab key={t} value={t} label={LABELS[t]} />
        ))}
      </Tabs>
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'customers' && <Customers />}
      {tab === 'statement' && <Statement />}
      {tab === 'settings' && <Settings />}
    </>
  );
}
