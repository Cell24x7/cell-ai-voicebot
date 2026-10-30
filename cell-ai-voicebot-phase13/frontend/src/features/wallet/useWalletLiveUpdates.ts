import { useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';

import type { Wallet } from '@/services/api/types';
import { useWsEvent } from '@/services/realtime';
import { formatCurrencyMicros } from '@/utils/format';

import { invoiceKeys, walletKeys } from './keys';
import { useHasWallet } from './queries';

/**
 * Keeps wallet data live (mounted once in the app layout):
 * `wallet.updated` patches the cached wallet in place (no refetch) and marks
 * ledger / usage / invoices stale; low-balance / exhausted crossings show a snackbar
 * (the banner reads the wallet status).
 */
export const useWalletLiveUpdates = (): void => {
  const queryClient = useQueryClient();
  const canRead = useHasWallet();

  useWsEvent('wallet.updated', (event) => {
    if (!canRead) return;
    const { balanceMicros, holdMicros, availableMicros, status } = event.data;
    const current = queryClient.getQueryData<Wallet>(walletKeys.wallet);
    if (current) {
      queryClient.setQueryData<Wallet>(walletKeys.wallet, {
        ...current,
        balanceMicros,
        holdMicros,
        availableMicros,
        status,
      });
      // spend counters are not in the event — refresh them quietly
      void queryClient.invalidateQueries({ queryKey: walletKeys.wallet, refetchType: 'none' });
    } else {
      void queryClient.invalidateQueries({ queryKey: walletKeys.wallet });
    }
    void queryClient.invalidateQueries({ queryKey: walletKeys.ledgerAll });
    void queryClient.invalidateQueries({ queryKey: walletKeys.usageAll });
    void queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
  });

  useWsEvent('wallet.low_balance', (event) => {
    if (!canRead) return;
    enqueueSnackbar(
      `Low wallet balance: ${formatCurrencyMicros(event.data.availableMicros)} available`,
      { variant: 'warning' },
    );
  });

  useWsEvent('wallet.exhausted', () => {
    if (!canRead) return;
    enqueueSnackbar('Wallet balance is used up — new calls are paused until you add money', {
      variant: 'error',
    });
  });
};
