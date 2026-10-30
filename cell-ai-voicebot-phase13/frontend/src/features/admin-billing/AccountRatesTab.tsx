import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { useConfirm } from '@/components/confirm-context';
import { adminBillingKeys } from '@/features/wallet/keys';
import { adminBillingApi, type RateCardInput } from '@/services/api/admin-billing';
import { getErrorMessage } from '@/services/api/errors';
import type { AccountRateCards } from '@/services/api/types';
import { formatInAccountTz } from '@/utils/datetime';
import { formatCurrencyMicros } from '@/utils/format';
import { formatBps } from '@/utils/money';

import { RateCardDialog } from './RateCardDialog';
import { RateHistoryTable } from './RateHistoryTable';

export function RateFacts({ card }: { card: AccountRateCards['effective'] }) {
  const facts: [string, string][] = [
    ['Call', `${formatCurrencyMicros(card.callPerMinuteMicros)} / min`],
    ['Pulse', `${card.pulseSeconds} s`],
    ['AI', `${formatCurrencyMicros(card.aiPerMinuteMicros)} / min`],
    ['Voice (TTS)', `${formatCurrencyMicros(card.ttsPer1kCharsMicros)} / 1k chars`],
    ['AI text', `${formatCurrencyMicros(card.aiTextPer1kTokensMicros)} / 1k tokens`],
    ['Embeddings', `${formatCurrencyMicros(card.embeddingPer1kTokensMicros)} / 1k tokens`],
    ['Commission', formatBps(card.commissionBps)],
    ['Unanswered', card.billUnansweredAttempts ? 'Billed' : 'Free'],
  ];
  return (
    <Grid container spacing={2}>
      {facts.map(([k, v]) => (
        <Grid key={k} size={{ xs: 6, md: 4, lg: 2 }}>
          <Typography variant="caption" color="text.secondary">
            {k}
          </Typography>
          <Typography variant="body1">{v}</Typography>
        </Grid>
      ))}
    </Grid>
  );
}

/** Admin account → Rates: prices in force, override history, edit / back to default. */
export function AccountRatesTab({
  accountId,
  accountName,
}: {
  accountId: string;
  accountName: string;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const cards = useQuery({
    queryKey: adminBillingKeys.accountCards(accountId),
    queryFn: () => adminBillingApi.accountRateCards(accountId),
  });
  const refresh = (data: AccountRateCards) => {
    queryClient.setQueryData(adminBillingKeys.accountCards(accountId), data);
  };
  const toDefault = useMutation({
    mutationFn: () => adminBillingApi.accountRateCardToDefault(accountId),
    meta: { silent: true },
    onSuccess: (data) => {
      refresh(data);
      enqueueSnackbar(`${accountName} now uses the platform default prices`, {
        variant: 'success',
      });
    },
    onError: (error) => enqueueSnackbar(getErrorMessage(error), { variant: 'error' }),
  });

  if (cards.isPending) return <Skeleton variant="rounded" height={200} />;
  if (cards.isError) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void cards.refetch()}>
            Retry
          </Button>
        }
      >
        {getErrorMessage(cards.error)}
      </Alert>
    );
  }
  const { effective, history } = cards.data;
  const onDefault = async () => {
    const ok = await confirm({
      title: 'Use the platform default prices?',
      message: `${accountName} will pay the platform default rates from now on. Calls already running keep their prices. The override stays in the history.`,
      confirmText: 'Use default',
    });
    if (ok) toDefault.mutate();
  };
  const save = async (values: RateCardInput) => {
    refresh(await adminBillingApi.setAccountRateCard(accountId, values));
    enqueueSnackbar(`New prices saved for ${accountName}`, { variant: 'success' });
  };

  return (
    <Stack spacing={3}>
      <Card variant="outlined">
        <CardContent>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 2 }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="subtitle1">Prices in force</Typography>
              <Chip
                size="small"
                color={effective.source === 'account' ? 'primary' : 'default'}
                label={effective.source === 'account' ? 'Account override' : 'Platform default'}
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button
                onClick={() => void onDefault()}
                disabled={effective.source === 'default' || toDefault.isPending}
              >
                Use platform default
              </Button>
              <Button variant="contained" onClick={() => setEditing(true)}>
                Edit rates
              </Button>
            </Stack>
          </Stack>
          <RateFacts card={effective} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Since {formatInAccountTz(effective.effectiveFrom, 'Asia/Kolkata')} IST. New calls use
            new prices at once on this server (other servers within a minute).
          </Typography>
        </CardContent>
      </Card>
      <div>
        <Typography variant="subtitle1" gutterBottom>
          History of this account
        </Typography>
        <RateHistoryTable rows={history} />
      </div>
      {editing && (
        <RateCardDialog
          title={`Prices for ${accountName}`}
          initial={effective}
          onSave={save}
          onClose={() => setEditing(false)}
        />
      )}
    </Stack>
  );
}
