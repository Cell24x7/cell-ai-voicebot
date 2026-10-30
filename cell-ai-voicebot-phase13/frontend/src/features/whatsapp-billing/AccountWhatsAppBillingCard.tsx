import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { useConfirm } from '@/components/confirm-context';
import { adminKeys } from '@/features/admin/keys';
import { BILLING_CONFIRM } from '@/features/admin/whatsapp-texts';
import { useSetAccountWhatsAppBilling } from '@/features/templates/queries';
import { whatsappErrorMessage } from '@/features/whatsapp/labels';
import { adminWhatsappApi } from '@/services/api/admin-whatsapp';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import type { AdminAccountDetail, WhatsAppMetaPayer } from '@/services/api/types';
import { formatRupeesInput, parseRupeesInput, type ParseResult } from '@/utils/money';

import { formatRateInput, parsePercentInput, parseRateInput } from './format';

const PAYER_LABELS: Record<WhatsAppMetaPayer, string> = {
  platform: 'Platform credit line',
  customer: 'Customer pays Meta',
};
const CATEGORIES = [
  ['marketing', 'Marketing'],
  ['utility', 'Utility'],
  ['authentication', 'Authentication'],
  ['service', 'Service reply'],
] as const;
type Category = (typeof CATEGORIES)[number][0];

const EMPTY: ParseResult = { ok: true, micros: -1 };
const optional = (text: string, parse: (t: string) => ParseResult): ParseResult =>
  text.trim() === '' ? EMPTY : parse(text);

/**
 * Superadmin account detail region **WhatsApp billing**: who pays Meta (Phase 9,
 * irreversible for numbers already connected) and the account's price override —
 * markup, fixed prices per category, platform fee (empty = the global settings).
 */
export function AccountWhatsAppBillingCard({ detail }: { detail: AdminAccountDetail }) {
  const id = detail.account.id;
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const wb = detail.whatsappBilling;
  const current = wb.metaPayer;
  const [payer, setPayer] = useState<WhatsAppMetaPayer>(current);
  const [markup, setMarkup] = useState(wb.markupBps === null ? '' : String(wb.markupBps / 100));
  const [fee, setFee] = useState(
    wb.platformFeeMicros === null ? '' : formatRupeesInput(wb.platformFeeMicros),
  );
  const [fixed, setFixed] = useState<Record<Category, string>>(
    () =>
      Object.fromEntries(
        CATEGORIES.map(([c]) => {
          const v = wb.fixedPrices?.[c];
          return [c, v === undefined ? '' : formatRateInput(v)];
        }),
      ) as Record<Category, string>,
  );
  const [touched, setTouched] = useState(false);
  const billing = useMutation({
    mutationFn: () => adminWhatsappApi.setBilling(id, payer),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Meta billing saved', { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: adminKeys.account(id) });
    },
  });
  const prices = useSetAccountWhatsAppBilling(id);

  const m = optional(markup, parsePercentInput);
  const f = optional(fee, (t) => parseRupeesInput(t, { maxMicros: 1000 * 1_000_000 }));
  const fx = CATEGORIES.map(([c]) => [c, optional(fixed[c], parseRateInput)] as const);
  const valid = m.ok && f.ok && fx.every(([, r]) => r.ok);

  const saveBilling = async () => {
    const ok = await confirm({
      title: `Switch to "${PAYER_LABELS[payer]}"?`,
      message: BILLING_CONFIRM,
      confirmText: 'Save',
    });
    if (ok) billing.mutate();
  };
  const savePrices = () => {
    setTouched(true);
    if (!m.ok || !f.ok || !fx.every(([, r]) => r.ok)) return;
    const fixedPrices: Partial<Record<Category, number>> = {};
    for (const [c, r] of fx) if (r.ok && r.micros >= 0) fixedPrices[c] = r.micros;
    prices.mutate(
      {
        markupBps: m.micros >= 0 ? m.micros : null,
        platformFeeMicros: f.ok && f.micros >= 0 ? f.micros : null,
        fixedPrices: Object.keys(fixedPrices).length ? fixedPrices : null,
      },
      { onSuccess: () => enqueueSnackbar('WhatsApp prices saved', { variant: 'success' }) },
    );
  };
  const err = (r: ParseResult) => (touched && !r.ok ? r.message : undefined);

  return (
    <Card variant="outlined" component="section" aria-label="WhatsApp billing">
      <CardContent>
        <Typography variant="subtitle1" component="h2" gutterBottom>
          WhatsApp billing
        </Typography>
        <Typography variant="subtitle2">Meta billing</Typography>
        {billing.error && (
          <Alert severity="error">{whatsappErrorMessage(toApiError(billing.error))}</Alert>
        )}
        <RadioGroup
          row
          aria-label="Meta billing"
          value={payer}
          onChange={(e) => setPayer(e.target.value as WhatsAppMetaPayer)}
        >
          {(Object.keys(PAYER_LABELS) as WhatsAppMetaPayer[]).map((p) => (
            <FormControlLabel key={p} value={p} control={<Radio />} label={PAYER_LABELS[p]} />
          ))}
        </RadioGroup>
        <Typography variant="body2" color="text.secondary">
          {BILLING_CONFIRM}
        </Typography>
        <Button
          sx={{ mt: 1 }}
          variant="outlined"
          disabled={payer === current || billing.isPending}
          onClick={() => void saveBilling()}
        >
          Save Meta billing
        </Button>

        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle2">Prices for this account</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Empty fields use the global WhatsApp settings. A fixed price replaces Meta&apos;s rate +
          markup for every market.
        </Typography>
        {prices.error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {getErrorMessage(prices.error)}
          </Alert>
        )}
        <Stack
          spacing={2}
          component="form"
          aria-label="Account WhatsApp prices"
          noValidate
          onSubmit={(e) => e.preventDefault()}
        >
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Markup (%)"
              value={markup}
              onChange={(e) => setMarkup(e.target.value)}
              error={Boolean(err(m))}
              helperText={err(m) ?? 'Empty = global markup'}
            />
            <TextField
              label="Platform fee (₹ per message)"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              error={Boolean(err(f))}
              helperText={err(f) ?? 'Empty = global fee'}
            />
          </Stack>
          <Grid container spacing={2}>
            {fx.map(([c, r]) => (
              <Grid key={c} size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  label={`Fixed ${CATEGORIES.find(([k]) => k === c)?.[1] ?? c} price (₹)`}
                  value={fixed[c]}
                  onChange={(e) => setFixed({ ...fixed, [c]: e.target.value })}
                  error={Boolean(err(r))}
                  helperText={err(r) ?? 'Empty = Meta rate + markup'}
                  fullWidth
                />
              </Grid>
            ))}
          </Grid>
          <Box>
            <Button
              variant="contained"
              disabled={prices.isPending || (touched && !valid)}
              onClick={savePrices}
            >
              Save prices
            </Button>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
