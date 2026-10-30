import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableFooter from '@mui/material/TableFooter';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { EmptyState } from '@/components/EmptyState';
import { useWhatsAppMargin, useWhatsAppReconciliation } from '@/features/templates/queries';
import { adminWhatsappBillingApi } from '@/services/api/admin-whatsapp-billing';
import { getErrorMessage } from '@/services/api/errors';
import { saveBlob } from '@/utils/download';
import { formatCurrencyMicros, formatNumber } from '@/utils/format';

import { formatBpsPercent, thisMonth } from './format';

const ACCOUNT_ID = /^[a-f0-9]{24}$/;

function Filters({
  month,
  account,
  onMonth,
  onAccount,
}: {
  month: string;
  account: string;
  onMonth: (m: string) => void;
  onAccount: (a: string) => void;
}) {
  const bad = account !== '' && !ACCOUNT_ID.test(account);
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      <TextField
        label="Month"
        type="month"
        value={month}
        onChange={(e) => {
          if (e.target.value) onMonth(e.target.value);
        }}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        label="Account id (optional)"
        value={account}
        onChange={(e) => onAccount(e.target.value.trim())}
        error={bad}
        helperText={bad ? 'A 24-character account id' : 'Empty = every account'}
        sx={{ minWidth: 280 }}
      />
    </Stack>
  );
}

const useFilters = () => {
  const [month, setMonth] = useState(thisMonth());
  const [account, setAccount] = useState('');
  const query = { month, ...(ACCOUNT_ID.test(account) ? { accountId: account } : {}) };
  return { month, setMonth, account, setAccount, query };
};

/** Margin: per account × category for a month — billed vs Meta's cost, totals, CSV. */
export function MarginTab() {
  const f = useFilters();
  const margin = useWhatsAppMargin(f.query);
  const csv = useMutation({
    mutationFn: () => adminWhatsappBillingApi.marginCsv(f.query),
    onSuccess: (blob) => saveBlob(blob, `whatsapp-margin-${f.month}.csv`),
  });
  const rows = margin.data ?? [];
  const total = (k: 'messages' | 'billedMicros' | 'metaCostMicros' | 'marginMicros') =>
    rows.reduce((sum, r) => sum + r[k], 0);
  const billed = total('billedMicros');
  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between' }}
      >
        <Filters
          month={f.month}
          account={f.account}
          onMonth={f.setMonth}
          onAccount={f.setAccount}
        />
        <Box>
          <Button
            startIcon={<DownloadOutlined />}
            disabled={csv.isPending || !rows.length}
            onClick={() => csv.mutate()}
          >
            Download CSV
          </Button>
        </Box>
      </Stack>
      {margin.isPending && <Skeleton variant="rounded" height={200} aria-label="Loading margin" />}
      {margin.isError && <Alert severity="error">{getErrorMessage(margin.error)}</Alert>}
      {margin.data && !rows.length && <EmptyState title="No WhatsApp charges this month" />}
      {rows.length > 0 && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label="WhatsApp margin">
            <TableHead>
              <TableRow>
                <TableCell>Account</TableCell>
                <TableCell>Category</TableCell>
                <TableCell align="right">Messages / calls</TableCell>
                <TableCell align="right">Billed</TableCell>
                <TableCell align="right">Meta cost</TableCell>
                <TableCell align="right">Margin</TableCell>
                <TableCell align="right">Mismatches</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.accountId}-${r.kind}-${r.category}`}>
                  <TableCell>{r.accountName}</TableCell>
                  <TableCell>{r.kind === 'call' ? 'WhatsApp calls' : r.category}</TableCell>
                  <TableCell align="right">{formatNumber(r.messages)}</TableCell>
                  <TableCell align="right">{formatCurrencyMicros(r.billedMicros)}</TableCell>
                  <TableCell align="right">
                    {formatCurrencyMicros(r.metaCostMicros)}
                    <Typography component="span" variant="caption" color="text.secondary">
                      {' '}
                      ({r.metaCostSource === 'analytics' ? "Meta's analytics" : 'list price'})
                    </Typography>
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ color: r.marginMicros < 0 ? 'error.main' : undefined }}
                  >
                    {formatCurrencyMicros(r.marginMicros)}
                    {r.marginBps !== null && ` · ${formatBpsPercent(r.marginBps)}`}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ color: r.mismatches ? 'warning.main' : undefined }}
                  >
                    {r.mismatches}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>Total</TableCell>
                <TableCell align="right">{formatNumber(total('messages'))}</TableCell>
                <TableCell align="right">{formatCurrencyMicros(billed)}</TableCell>
                <TableCell align="right">{formatCurrencyMicros(total('metaCostMicros'))}</TableCell>
                <TableCell align="right">{formatCurrencyMicros(total('marginMicros'))}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </Box>
      )}
    </Stack>
  );
}

/** Reconciliation: Meta's pricing analytics vs our captured charges per WABA × day × category. */
export function ReconciliationTab() {
  const f = useFilters();
  const recon = useWhatsAppReconciliation(f.query);
  const rows = recon.data ?? [];
  return (
    <Stack spacing={2}>
      <Filters month={f.month} account={f.account} onMonth={f.setMonth} onAccount={f.setAccount} />
      {recon.isPending && (
        <Skeleton variant="rounded" height={200} aria-label="Loading reconciliation" />
      )}
      {recon.isError && <Alert severity="error">{getErrorMessage(recon.error)}</Alert>}
      {recon.data && !rows.length && (
        <EmptyState
          title="Nothing reconciled this month"
          description="Meta's pricing analytics are fetched every night at 03:00 IST."
        />
      )}
      {rows.length > 0 && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label="WhatsApp reconciliation">
            <TableHead>
              <TableRow>
                <TableCell>Day</TableCell>
                <TableCell>WABA</TableCell>
                <TableCell>Category</TableCell>
                <TableCell align="right">Meta messages</TableCell>
                <TableCell align="right">Our messages</TableCell>
                <TableCell align="right">Meta cost</TableCell>
                <TableCell align="right">We billed</TableCell>
                <TableCell align="right">Difference</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => {
                const off = r.diffVolume !== 0 || r.diffMicros !== 0;
                return (
                  <TableRow
                    key={`${r.wabaId}-${r.day}-${r.category}`}
                    data-mismatch={off ? 'true' : undefined}
                    sx={off ? { bgcolor: 'warning.light' } : undefined}
                  >
                    <TableCell>{r.day}</TableCell>
                    <TableCell>{r.wabaId}</TableCell>
                    <TableCell>{r.category}</TableCell>
                    <TableCell align="right">{formatNumber(r.metaVolume)}</TableCell>
                    <TableCell align="right">{formatNumber(r.ourCaptured)}</TableCell>
                    <TableCell align="right">{formatCurrencyMicros(r.metaCostMicros)}</TableCell>
                    <TableCell align="right">{formatCurrencyMicros(r.ourBilledMicros)}</TableCell>
                    <TableCell align="right">
                      {off
                        ? `${r.diffVolume > 0 ? '+' : ''}${String(r.diffVolume)} messages · ${formatCurrencyMicros(r.diffMicros)}`
                        : 'Matches'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}
    </Stack>
  );
}
