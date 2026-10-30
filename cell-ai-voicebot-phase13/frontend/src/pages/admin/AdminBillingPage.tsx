import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';

import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { StatusChip } from '@/components/StatusChip';
import { RateFacts } from '@/features/admin-billing/AccountRatesTab';
import { AiConfigCard } from '@/features/admin-billing/AiConfigCard';
import { RateCardDialog } from '@/features/admin-billing/RateCardDialog';
import { RateHistoryTable } from '@/features/admin-billing/RateHistoryTable';
import { adminBillingKeys } from '@/features/wallet/keys';
import { LEDGER_TYPE_LABELS } from '@/features/wallet/ledger-format';
import { adminBillingApi, type RateCardInput } from '@/services/api/admin-billing';
import { getErrorMessage } from '@/services/api/errors';
import type { AdminPayment, BillingSummary, PaymentEvent, TopupOrder } from '@/services/api/types';
import { formatInAccountTz, todayInTz } from '@/utils/datetime';
import { formatCurrencyMicros, formatNumber } from '@/utils/format';

const IST = 'Asia/Kolkata';
const ORDER_STATUSES: TopupOrder['status'][] = [
  'creating',
  'created',
  'paid',
  'failed',
  'expired',
  'refunded',
];
const OUTCOMES: PaymentEvent['outcome'][] = [
  'received',
  'credited',
  'duplicate_credit',
  'failed',
  'unmatched',
  'mismatch',
  'refund',
  'ignored',
];
const OUTCOME_LABELS: Record<PaymentEvent['outcome'], string> = {
  received: 'Received',
  credited: 'Credited',
  duplicate_credit: 'Already credited',
  failed: 'Payment failed',
  unmatched: 'Unknown order',
  mismatch: 'Amount mismatch',
  refund: 'Refund',
  ignored: 'Ignored',
};

function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h6">{value}</Typography>
        {note && (
          <Typography variant="caption" color="text.secondary">
            {note}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryCards({ s }: { s: BillingSummary }) {
  const gst =
    s.topups.igstMicros && (s.topups.cgstMicros || s.topups.sgstMicros)
      ? `CGST ${formatCurrencyMicros(s.topups.cgstMicros)} · SGST ${formatCurrencyMicros(s.topups.sgstMicros)} · IGST ${formatCurrencyMicros(s.topups.igstMicros)}`
      : s.topups.igstMicros
        ? `IGST ${formatCurrencyMicros(s.topups.igstMicros)}`
        : `CGST ${formatCurrencyMicros(s.topups.cgstMicros)} · SGST ${formatCurrencyMicros(s.topups.sgstMicros)}`;
  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <Stat
          label={`Recharges (${s.topups.count})`}
          value={formatCurrencyMicros(s.topups.baseMicros)}
          note={`Collected ${formatCurrencyMicros(s.topups.totalMicros)} incl. GST`}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <Stat label="GST collected" value={formatCurrencyMicros(s.topups.taxMicros)} note={gst} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <Stat
          label="Usage charged"
          value={formatCurrencyMicros(s.usage.totalMicros)}
          note={
            s.usage.byType.length
              ? s.usage.byType
                  .map(
                    (u) => `${LEDGER_TYPE_LABELS[u.type]} ${formatCurrencyMicros(u.amountMicros)}`,
                  )
                  .join(' · ')
              : 'No usage'
          }
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <Stat
          label="Manual adjustments"
          value={`+${formatCurrencyMicros(s.adjustments.creditMicros)} / −${formatCurrencyMicros(s.adjustments.debitMicros)}`}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
        <Stat
          label="AI usage"
          value={`${formatNumber(s.ai.playgroundTurns)} turns · ${formatNumber(s.ai.kbIngests)} ingests`}
          note={`${formatNumber(s.ai.inputTokens)} in + ${formatNumber(s.ai.outputTokens)} out tokens · ${formatNumber(s.ai.embeddingTokens)} embedding tokens`}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
        <Stat
          label="Wallets"
          value={`${s.wallets.total}`}
          note={`${s.wallets.low} low · ${s.wallets.exhausted} exhausted (right now)`}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
        <Stat
          label="Reconcile notices (unread)"
          value={`${s.openReconcileMismatches}`}
          note={
            s.openReconcileMismatches
              ? 'Wallet ≠ ledger — check the bell'
              : 'All wallets match their ledger'
          }
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
        <Stat
          label="Payments to look at"
          value={`${s.paymentEventsNeedingAttention}`}
          note="Unknown order, amount mismatch or refund"
        />
      </Grid>
    </Grid>
  );
}

function PaymentsSection() {
  const [status, setStatus] = useState<TopupOrder['status'] | ''>('');
  const [page, setPage] = useState(1);
  const query = { page, limit: 20, ...(status ? { status } : {}) };
  const payments = useQuery({
    queryKey: adminBillingKeys.payments(query),
    queryFn: () => adminBillingApi.payments(query),
  });
  const columns: Column<AdminPayment>[] = [
    { key: 'date', header: 'Created (IST)', render: (p) => formatInAccountTz(p.createdAt, IST) },
    {
      key: 'account',
      header: 'Account',
      render: (p) => (
        <Link component={RouterLink} to={`/admin/accounts/${p.accountId}?tab=wallet`}>
          {p.accountName ?? p.accountId}
        </Link>
      ),
    },
    {
      key: 'base',
      header: 'Amount',
      align: 'right',
      render: (p) => formatCurrencyMicros(p.baseMicros),
    },
    {
      key: 'total',
      header: 'Paid incl. GST',
      align: 'right',
      render: (p) => formatCurrencyMicros(p.totalMicros),
    },
    {
      key: 'provider',
      header: 'Gateway',
      render: (p) => (p.provider === 'fake' ? 'Test' : 'Razorpay'),
    },
    { key: 'payment', header: 'Payment id', render: (p) => p.providerPaymentId ?? '—' },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <StatusChip
          status={p.status === 'paid' ? 'completed' : p.status}
          label={p.status[0]?.toUpperCase() + p.status.slice(1)}
        />
      ),
    },
  ];
  return (
    <Stack spacing={1}>
      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography variant="subtitle1">Payments</Typography>
        <TextField
          select
          size="small"
          label="Status"
          sx={{ minWidth: 160 }}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as TopupOrder['status'] | '');
            setPage(1);
          }}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
        >
          <MenuItem value="">All</MenuItem>
          {ORDER_STATUSES.map((s) => (
            <MenuItem key={s} value={s}>
              {s[0]?.toUpperCase() + s.slice(1)}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <DataTable
        aria-label="Payments"
        columns={columns}
        rows={payments.data?.data}
        getRowId={(p) => p.id}
        loading={payments.isPending}
        error={payments.error}
        onRetry={() => void payments.refetch()}
        emptyTitle="No payments"
        pagination={
          payments.data
            ? { page, limit: 20, total: payments.data.meta.total, onPageChange: setPage }
            : undefined
        }
      />
    </Stack>
  );
}

function PaymentEventsSection() {
  const [outcome, setOutcome] = useState<PaymentEvent['outcome'] | ''>('unmatched');
  const [page, setPage] = useState(1);
  const query = { page, limit: 20, ...(outcome ? { outcome } : {}) };
  const events = useQuery({
    queryKey: adminBillingKeys.paymentEvents(query),
    queryFn: () => adminBillingApi.paymentEvents(query),
  });
  const columns: Column<PaymentEvent>[] = [
    { key: 'date', header: 'Received (IST)', render: (e) => formatInAccountTz(e.receivedAt, IST) },
    { key: 'type', header: 'Event', render: (e) => e.type },
    { key: 'outcome', header: 'Outcome', render: (e) => OUTCOME_LABELS[e.outcome] },
    { key: 'order', header: 'Gateway order', render: (e) => e.providerOrderId ?? '—' },
    { key: 'payment', header: 'Payment id', render: (e) => e.providerPaymentId ?? '—' },
    {
      key: 'account',
      header: 'Account',
      render: (e) =>
        e.accountId ? (
          <Link component={RouterLink} to={`/admin/accounts/${e.accountId}?tab=wallet`}>
            Open
          </Link>
        ) : (
          '—'
        ),
    },
  ];
  return (
    <Stack spacing={1}>
      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography variant="subtitle1">Payment events</Typography>
        <TextField
          select
          size="small"
          label="Outcome"
          sx={{ minWidth: 180 }}
          value={outcome}
          onChange={(e) => {
            setOutcome(e.target.value as PaymentEvent['outcome'] | '');
            setPage(1);
          }}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
        >
          <MenuItem value="">All</MenuItem>
          {OUTCOMES.map((o) => (
            <MenuItem key={o} value={o}>
              {OUTCOME_LABELS[o]}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <DataTable
        aria-label="Payment events"
        columns={columns}
        rows={events.data?.data}
        getRowId={(e) => e.id}
        loading={events.isPending}
        error={events.error}
        onRetry={() => void events.refetch()}
        emptyTitle="Nothing here"
        emptyDescription="Webhook deliveries are kept for 90 days."
        pagination={
          events.data
            ? { page, limit: 20, total: events.data.meta.total, onPageChange: setPage }
            : undefined
        }
      />
    </Stack>
  );
}

function DefaultRatesSection() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const card = useQuery({
    queryKey: adminBillingKeys.defaultCard,
    queryFn: adminBillingApi.defaultRateCard,
  });
  const history = useQuery({
    queryKey: adminBillingKeys.defaultHistory,
    queryFn: () => adminBillingApi.defaultRateCardHistory(),
  });
  const save = async (values: RateCardInput) => {
    const saved = await adminBillingApi.setDefaultRateCard(values);
    queryClient.setQueryData(adminBillingKeys.defaultCard, saved);
    void queryClient.invalidateQueries({ queryKey: adminBillingKeys.defaultHistory });
    void queryClient.invalidateQueries({ queryKey: adminBillingKeys.all });
    enqueueSnackbar('Platform default prices saved', { variant: 'success' });
  };
  return (
    <Stack spacing={2}>
      <Card variant="outlined">
        <CardContent>
          <Stack
            direction="row"
            sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}
          >
            <Typography variant="subtitle1">Platform default prices</Typography>
            <Button variant="contained" onClick={() => setEditing(true)} disabled={!card.data}>
              Edit default rates
            </Button>
          </Stack>
          {card.isPending && <Skeleton variant="rounded" height={60} />}
          {card.isError && <Alert severity="error">{getErrorMessage(card.error)}</Alert>}
          {card.data && <RateFacts card={{ ...card.data, source: 'default' }} />}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Every account without its own prices pays these.
          </Typography>
        </CardContent>
      </Card>
      <RateHistoryTable
        rows={history.data}
        loading={history.isPending}
        error={history.error}
        onRetry={() => void history.refetch()}
      />
      {editing && card.data && (
        <RateCardDialog
          title="Platform default prices"
          initial={card.data}
          onSave={save}
          onClose={() => setEditing(false)}
        />
      )}
    </Stack>
  );
}

/** `/admin/billing` — platform month summary, payments, webhook events, default prices. */
export function AdminBillingPage() {
  const [month, setMonth] = useState(todayInTz(IST).slice(0, 7));
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const summary = useQuery({
    queryKey: adminBillingKeys.summary(month),
    queryFn: () => adminBillingApi.summary(month),
    enabled: valid,
  });
  return (
    <>
      <PageHeader title="Billing" subtitle="All accounts — months in Indian time (IST)" />
      <Stack spacing={4}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <TextField
              label="Month"
              type="month"
              size="small"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              error={!valid}
              helperText={valid ? undefined : 'Choose a month'}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
          {summary.isPending && valid && <Skeleton variant="rounded" height={180} />}
          {summary.isError && (
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={() => void summary.refetch()}>
                  Retry
                </Button>
              }
            >
              {getErrorMessage(summary.error)}
            </Alert>
          )}
          {summary.data && (
            <>
              <SummaryCards s={summary.data} />
              <div>
                <Typography variant="subtitle1" gutterBottom>
                  Top accounts by spend
                </Typography>
                <DataTable
                  aria-label="Top accounts"
                  columns={[
                    {
                      key: 'name',
                      header: 'Account',
                      render: (a) => (
                        <Link
                          component={RouterLink}
                          to={`/admin/accounts/${a.accountId}?tab=wallet`}
                        >
                          {a.name}
                        </Link>
                      ),
                    },
                    {
                      key: 'spend',
                      header: 'Spend',
                      align: 'right',
                      render: (a) => formatCurrencyMicros(a.spendMicros),
                    },
                  ]}
                  rows={summary.data.topAccounts}
                  getRowId={(a) => a.accountId}
                  emptyTitle="No usage this month"
                />
              </div>
            </>
          )}
        </Stack>
        <PaymentsSection />
        <PaymentEventsSection />
        <AiConfigCard />
        <DefaultRatesSection />
      </Stack>
    </>
  );
}
