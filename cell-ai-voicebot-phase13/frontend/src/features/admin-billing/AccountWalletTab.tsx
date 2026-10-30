import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { adminBillingKeys } from '@/features/wallet/keys';
import { LedgerDetailDrawer } from '@/features/wallet/LedgerDetailDrawer';
import { LedgerTable } from '@/features/wallet/LedgerTable';
import { WalletStatusChip } from '@/features/wallet/OverviewTab';
import { adminBillingApi } from '@/services/api/admin-billing';
import { getErrorMessage } from '@/services/api/errors';
import type { LedgerEntry, Wallet } from '@/services/api/types';
import { formatCurrencyMicros } from '@/utils/format';

import { AdjustDialog } from './AdjustDialog';
import { CreditLimitDialog } from './CreditLimitDialog';
import { SimulatorPanel } from './SimulatorPanel';

const PAGE = 25;

/** Admin account → Wallet: balances, ledger, adjust, credit limit, simulator. */
export function AccountWalletTab({
  accountId,
  accountName,
  timezone,
}: {
  accountId: string;
  accountName: string;
  timezone: string;
}) {
  const queryClient = useQueryClient();
  const [adjusting, setAdjusting] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [selected, setSelected] = useState<LedgerEntry | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const wallet = useQuery({
    queryKey: adminBillingKeys.wallet(accountId),
    queryFn: () => adminBillingApi.wallet(accountId),
  });
  const config = useQuery({
    queryKey: adminBillingKeys.config,
    queryFn: adminBillingApi.config,
    staleTime: Infinity,
  });
  const ledger = useInfiniteQuery({
    queryKey: adminBillingKeys.ledger(accountId, { limit: PAGE }),
    queryFn: ({ pageParam }) =>
      adminBillingApi.ledger(accountId, {
        limit: PAGE,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: '',
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: adminBillingKeys.wallet(accountId) });
    void queryClient.invalidateQueries({ queryKey: adminBillingKeys.ledgerAll(accountId) });
  };
  const setWallet = (w: Wallet) => queryClient.setQueryData(adminBillingKeys.wallet(accountId), w);

  if (wallet.isPending) return <Skeleton variant="rounded" height={120} />;
  if (wallet.isError) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void wallet.refetch()}>
            Retry
          </Button>
        }
      >
        {getErrorMessage(wallet.error)}
      </Alert>
    );
  }
  const w = wallet.data;
  const stats: [string, string][] = [
    ['Balance', formatCurrencyMicros(w.balanceMicros)],
    ['On hold', formatCurrencyMicros(w.holdMicros)],
    ['Available', formatCurrencyMicros(w.availableMicros)],
    ['Credit limit', formatCurrencyMicros(w.creditLimitMicros)],
    ['Spent this month', formatCurrencyMicros(w.monthSpend.totalMicros)],
  ];

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ justifyContent: 'flex-end' }}
      >
        <Button onClick={() => setLimitOpen(true)}>Credit limit</Button>
        <Button variant="contained" onClick={() => setAdjusting(true)}>
          Adjust balance
        </Button>
      </Stack>
      <Grid container spacing={2}>
        {stats.map(([label, value]) => (
          <Grid key={label} size={{ xs: 6, md: 'grow' }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  {label}
                </Typography>
                <Typography variant="h6">{value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="body2">Status</Typography>
        <WalletStatusChip status={w.status} />
      </Stack>
      {config.data?.simulatorEnabled && (
        <SimulatorPanel accountId={accountId} timezone={timezone} onChange={refresh} />
      )}
      <div>
        <Typography variant="subtitle1" gutterBottom>
          Ledger
        </Typography>
        <LedgerTable
          rows={ledger.data?.pages.flatMap((p) => p.data)}
          timezone={timezone}
          loading={ledger.isPending}
          error={ledger.error}
          onRetry={() => void ledger.refetch()}
          onOpen={(e) => {
            setSelected(e);
            setDrawerOpen(true);
          }}
          hasMore={ledger.hasNextPage}
          loadingMore={ledger.isFetchingNextPage}
          onLoadMore={() => void ledger.fetchNextPage()}
        />
      </div>
      <LedgerDetailDrawer
        entry={selected}
        open={drawerOpen}
        timezone={timezone}
        onClose={() => setDrawerOpen(false)}
      />
      {adjusting && (
        <AdjustDialog
          accountId={accountId}
          accountName={accountName}
          onDone={(r) => {
            setWallet(r.wallet);
            refresh();
            enqueueSnackbar(
              `${r.entry.direction === 'credit' ? 'Added' : 'Deducted'} ${formatCurrencyMicros(r.entry.amountMicros)}`,
              { variant: 'success' },
            );
          }}
          onClose={() => setAdjusting(false)}
        />
      )}
      {limitOpen && (
        <CreditLimitDialog
          accountId={accountId}
          wallet={w}
          onSaved={(saved) => {
            setWallet(saved);
            enqueueSnackbar('Credit limit saved', { variant: 'success' });
          }}
          onClose={() => setLimitOpen(false)}
        />
      )}
    </Stack>
  );
}
