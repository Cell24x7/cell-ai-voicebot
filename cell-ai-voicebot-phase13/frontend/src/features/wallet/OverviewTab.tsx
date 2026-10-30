import AddCardOutlined from '@mui/icons-material/AddCardOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';

import { getErrorMessage } from '@/services/api/errors';
import type { RateCardView, Wallet, WalletStatus } from '@/services/api/types';
import { formatCurrencyMicros } from '@/utils/format';
import { formatBps } from '@/utils/money';

import { AddMoneyDialog } from './AddMoneyDialog';
import { useCanTopUp, useRates, useWallet } from './queries';
import { WalletSettingsDialog } from './WalletSettingsDialog';
import { WhatsAppCallPrices } from './WhatsAppCallPrices';
import { WhatsAppPrices } from './WhatsAppPrices';

const STATUS: Record<WalletStatus, { label: string; color: 'success' | 'warning' | 'error' }> = {
  ok: { label: 'OK', color: 'success' },
  low: { label: 'Low', color: 'warning' },
  exhausted: { label: 'Exhausted', color: 'error' },
};

export const WalletStatusChip = ({ status }: { status: WalletStatus }) => (
  <Chip size="small" color={STATUS[status].color} label={STATUS[status].label} />
);

function Stat({ label, value, note }: { label: string; value: string; note?: ReactNode }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 600 }}>
          {value}
        </Typography>
        {note && (
          <Typography variant="caption" color="text.secondary">
            {note}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function Budget({ label, spent, budget }: { label: string; spent: number; budget: number }) {
  const percent = budget > 0 ? Math.min(100, Math.round((spent * 100) / budget)) : 0;
  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" color="text.secondary">
          {formatCurrencyMicros(spent)}
          {budget > 0 ? ` of ${formatCurrencyMicros(budget)}` : ' · no budget'}
        </Typography>
      </Stack>
      {budget > 0 && (
        <LinearProgress
          variant="determinate"
          value={percent}
          color={percent >= 100 ? 'error' : percent >= 80 ? 'warning' : 'primary'}
          aria-label={`${label}: ${percent}% of the monthly budget used`}
        />
      )}
    </Box>
  );
}

function Prices({ rates }: { rates: RateCardView }) {
  const rows: [string, string][] = [
    ['Call', `${formatCurrencyMicros(rates.callPerMinuteMicros)} / minute`],
    ['Billing pulse', `${rates.pulseSeconds} seconds`],
    ['AI conversation', `${formatCurrencyMicros(rates.aiPerMinuteMicros)} / minute`],
    ['AI voice (TTS)', `${formatCurrencyMicros(rates.ttsPer1kCharsMicros)} / 1,000 characters`],
    [
      'AI text (playground)',
      `${formatCurrencyMicros(rates.aiTextPer1kTokensMicros)} / 1,000 tokens`,
    ],
    [
      'Knowledge processing',
      `${formatCurrencyMicros(rates.embeddingPer1kTokensMicros)} / 1,000 tokens`,
    ],
    ['Call transcription', `${formatCurrencyMicros(rates.sttPerMinuteMicros)} / minute`],
    ...(rates.commissionBps
      ? [['Platform commission', formatBps(rates.commissionBps)] as [string, string]]
      : []),
    ['Unanswered calls', rates.billUnansweredAttempts ? 'Billed' : 'Free'],
  ];
  return (
    <Table size="small" aria-label="Your prices">
      <TableBody>
        {rows.map(([k, v]) => (
          <TableRow key={k}>
            <TableCell component="th" scope="row">
              {k}
            </TableCell>
            <TableCell align="right">{v}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Cards({ wallet }: { wallet: Wallet }) {
  const spend = wallet.monthSpend;
  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <Stat label="Balance" value={formatCurrencyMicros(wallet.balanceMicros)} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <Stat
          label="On hold"
          value={formatCurrencyMicros(wallet.holdMicros)}
          note="Reserved for calls in progress and WhatsApp messages not delivered yet"
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <Stat
          label="Available"
          value={formatCurrencyMicros(wallet.availableMicros)}
          note={
            <>
              <WalletStatusChip status={wallet.status} />
              {wallet.creditLimitMicros > 0 &&
                ` incl. ${formatCurrencyMicros(wallet.creditLimitMicros)} credit limit`}
            </>
          }
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <Stat
          label="Spent this month"
          value={formatCurrencyMicros(spend.totalMicros)}
          note={`Calls ${formatCurrencyMicros(spend.callMicros)} · AI ${formatCurrencyMicros(spend.aiMicros)} · Voice ${formatCurrencyMicros(spend.ttsMicros)} · WhatsApp ${formatCurrencyMicros(spend.whatsappMicros)}`}
        />
      </Grid>
    </Grid>
  );
}

/** `/wallet` → Overview: balance cards, budgets, prices; Add money + settings. */
export function OverviewTab() {
  const wallet = useWallet();
  const rates = useRates();
  const canTopUp = useCanTopUp();
  const [params, setParams] = useSearchParams();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const addOpen = params.get('add') === '1' && canTopUp;
  const setAddOpen = (open: boolean) => {
    const next = new URLSearchParams(params);
    if (open) next.set('add', '1');
    else next.delete('add');
    setParams(next);
  };

  if (wallet.isPending) {
    return (
      <Grid container spacing={2} aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Grid key={i} size={{ xs: 12, sm: 6, lg: 3 }}>
            <Skeleton variant="rounded" height={110} />
          </Grid>
        ))}
      </Grid>
    );
  }
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
  return (
    <Stack spacing={3}>
      {canTopUp && (
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ justifyContent: 'flex-end' }}
        >
          <Button startIcon={<TuneOutlined />} onClick={() => setSettingsOpen(true)}>
            Alerts & budgets
          </Button>
          <Button
            variant="contained"
            startIcon={<AddCardOutlined />}
            onClick={() => setAddOpen(true)}
          >
            Add money
          </Button>
        </Stack>
      )}
      <Cards wallet={w} />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Monthly budgets ({w.monthSpend.month})
              </Typography>
              <Stack spacing={2}>
                <Budget
                  label="Calls"
                  spent={w.monthSpend.callMicros}
                  budget={w.budgets.monthlyCallMicros}
                />
                <Budget
                  label="AI and voice"
                  spent={w.monthSpend.aiMicros + w.monthSpend.ttsMicros}
                  budget={w.budgets.monthlyAiMicros}
                />
                <Budget
                  label="WhatsApp"
                  spent={w.monthSpend.whatsappMicros}
                  budget={w.budgets.monthlyWhatsappMicros}
                />
                <Typography variant="caption" color="text.secondary">
                  Low-balance alert:{' '}
                  {w.lowBalanceThresholdMicros
                    ? `below ${formatCurrencyMicros(w.lowBalanceThresholdMicros)}`
                    : 'off'}
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Your prices
              </Typography>
              {rates.isPending && <Skeleton variant="rounded" height={160} />}
              {rates.isError && <Alert severity="error">{getErrorMessage(rates.error)}</Alert>}
              {rates.data && <Prices rates={rates.data} />}
            </CardContent>
          </Card>
        </Grid>
        {rates.data && rates.data.whatsapp.markets.length > 0 && (
          <Grid size={12}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>
                  WhatsApp prices
                </Typography>
                <WhatsAppPrices prices={rates.data.whatsapp} />
              </CardContent>
            </Card>
          </Grid>
        )}
        {rates.data && rates.data.whatsappCalling.markets.length > 0 && (
          <Grid size={12}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>
                  WhatsApp call prices
                </Typography>
                <WhatsAppCallPrices prices={rates.data.whatsappCalling} />
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
      {settingsOpen && <WalletSettingsDialog wallet={w} onClose={() => setSettingsOpen(false)} />}
      <AddMoneyDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </Stack>
  );
}
