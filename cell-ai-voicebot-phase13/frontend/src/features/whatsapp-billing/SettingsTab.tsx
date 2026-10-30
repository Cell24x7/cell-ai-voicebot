import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';

import {
  useUpdateWhatsAppBillingSettings,
  useWhatsAppBillingSettings,
} from '@/features/templates/queries';
import { getErrorMessage } from '@/services/api/errors';
import type { WhatsAppBillingSettingsView } from '@/services/api/types';
import { formatRupeesInput, parseRupeesInput } from '@/utils/money';

import { formatBpsPercent, parsePercentInput } from './format';

function SettingsForm({ view }: { view: WhatsAppBillingSettingsView }) {
  const update = useUpdateWhatsAppBillingSettings();
  const s = view.settings;
  const [markup, setMarkup] = useState(String(s.markupBps / 100));
  const [fee, setFee] = useState(formatRupeesInput(s.platformFeeMicros));
  const [hours, setHours] = useState(String(s.holdMaxAgeHours));
  const [touched, setTouched] = useState(false);
  const m = parsePercentInput(markup);
  const f = parseRupeesInput(fee, { allowEmpty: true, maxMicros: 1000 * 1_000_000 });
  const h = Number(hours);
  const hoursOk = Number.isInteger(h) && h >= 1 && h <= 720;
  return (
    <Stack
      spacing={2}
      component="form"
      aria-label="WhatsApp price settings"
      noValidate
      onSubmit={(e) => e.preventDefault()}
    >
      {update.error && <Alert severity="error">{getErrorMessage(update.error)}</Alert>}
      <TextField
        label="Markup on Meta's rate (%)"
        value={markup}
        onChange={(e) => setMarkup(e.target.value)}
        error={touched && !m.ok}
        helperText={
          touched && !m.ok
            ? m.message
            : `Default ${formatBpsPercent(view.defaults.markupBps)}. Prices round up to the paisa.`
        }
        slotProps={{ htmlInput: { inputMode: 'decimal' } }}
      />
      <TextField
        label="Platform fee per message (₹)"
        value={fee}
        onChange={(e) => setFee(e.target.value)}
        error={touched && !f.ok}
        helperText={
          touched && !f.ok
            ? f.message
            : 'Added to every charged message — also for accounts that pay Meta themselves.'
        }
        slotProps={{ htmlInput: { inputMode: 'decimal' } }}
      />
      <TextField
        label="Release holds after (hours)"
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        error={touched && !hoursOk}
        helperText={
          touched && !hoursOk
            ? 'Between 1 and 720 hours'
            : 'A message WhatsApp never confirms gives its hold back after this; a later bill is charged again.'
        }
        slotProps={{ htmlInput: { inputMode: 'numeric' } }}
      />
      <Box>
        <Button
          variant="contained"
          disabled={update.isPending}
          onClick={() => {
            setTouched(true);
            if (!m.ok || !f.ok || !hoursOk) return;
            update.mutate(
              { markupBps: m.micros, platformFeeMicros: f.micros, holdMaxAgeHours: h },
              {
                onSuccess: () =>
                  enqueueSnackbar('WhatsApp price settings saved', { variant: 'success' }),
              },
            );
          }}
        >
          Save settings
        </Button>
      </Box>
    </Stack>
  );
}

/** Phase 12: the price of a WhatsApp call business sends (markup, fee per minute, holds). */
function CallingForm({ view }: { view: WhatsAppBillingSettingsView }) {
  const update = useUpdateWhatsAppBillingSettings();
  const c = view.calling;
  const [markup, setMarkup] = useState(String(c.markupBps / 100));
  const [fee, setFee] = useState(formatRupeesInput(c.platformFeePerMinuteMicros));
  const [hold, setHold] = useState(String(c.holdMinutes));
  const [extend, setExtend] = useState(String(c.holdExtendMinutes));
  const [touched, setTouched] = useState(false);
  const m = parsePercentInput(markup);
  const f = parseRupeesInput(fee, { allowEmpty: true, maxMicros: 1000 * 1_000_000 });
  const minutes = (v: string) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 60 ? n : null;
  };
  const holdMin = minutes(hold);
  const extendMin = minutes(extend);
  return (
    <Stack
      spacing={2}
      component="form"
      aria-label="WhatsApp call price settings"
      noValidate
      onSubmit={(e) => e.preventDefault()}
    >
      {update.error && <Alert severity="error">{getErrorMessage(update.error)}</Alert>}
      <TextField
        label="Markup on Meta's per-minute rate (%)"
        value={markup}
        onChange={(e) => setMarkup(e.target.value)}
        error={touched && !m.ok}
        helperText={
          touched && !m.ok
            ? m.message
            : `Default ${formatBpsPercent(view.callingDefaults.markupBps)}. Charged per 6-second pulse, rounded up to the paisa per call.`
        }
        slotProps={{ htmlInput: { inputMode: 'decimal' } }}
      />
      <TextField
        label="Platform fee per call minute (₹)"
        value={fee}
        onChange={(e) => setFee(e.target.value)}
        error={touched && !f.ok}
        helperText={
          touched && !f.ok ? f.message : 'Also charged to accounts that pay Meta themselves.'
        }
        slotProps={{ htmlInput: { inputMode: 'decimal' } }}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="Hold at dial (minutes)"
          value={hold}
          onChange={(e) => setHold(e.target.value)}
          error={touched && holdMin === null}
          helperText={
            touched && holdMin === null ? 'Between 1 and 60' : 'Reserved when a call starts'
          }
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
        />
        <TextField
          label="Each extension (minutes)"
          value={extend}
          onChange={(e) => setExtend(e.target.value)}
          error={touched && extendMin === null}
          helperText={
            touched && extendMin === null ? 'Between 1 and 60' : 'Added while the call goes on'
          }
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
        />
      </Stack>
      <Box>
        <Button
          variant="contained"
          disabled={update.isPending}
          onClick={() => {
            setTouched(true);
            if (!m.ok || !f.ok || holdMin === null || extendMin === null) return;
            update.mutate(
              {
                calling: {
                  markupBps: m.micros,
                  platformFeePerMinuteMicros: f.micros,
                  holdMinutes: holdMin,
                  holdExtendMinutes: extendMin,
                },
              },
              {
                onSuccess: () =>
                  enqueueSnackbar('WhatsApp call price settings saved', { variant: 'success' }),
              },
            );
          }}
        >
          Save call settings
        </Button>
      </Box>
    </Stack>
  );
}

/** Settings: markup, platform fee, hold age; platform-paid numbers not billed in INR. */
export function SettingsTab() {
  const settings = useWhatsAppBillingSettings();
  if (settings.isPending)
    return <Skeleton variant="rounded" height={240} aria-label="Loading settings" />;
  if (settings.isError) return <Alert severity="error">{getErrorMessage(settings.error)}</Alert>;
  const view = settings.data;
  return (
    <Stack spacing={3}>
      {view.nonInrPlatformChannels.length > 0 && (
        <Alert severity="warning">
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {view.nonInrPlatformChannels.length} platform-paid numbers are not billed in INR yet.
            Meta moves Indian businesses to INR by 31 Dec 2026.
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            {view.nonInrPlatformChannels.map((c) => (
              <li key={c.channelId}>
                <RouterLink to={`/admin/accounts/${c.accountId}`}>{c.label}</RouterLink> —{' '}
                {c.wabaCurrency}
              </li>
            ))}
          </Box>
        </Alert>
      )}
      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>
            Prices for every account
          </Typography>
          <SettingsForm key={JSON.stringify(view.settings)} view={view} />
        </CardContent>
      </Card>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>
            WhatsApp call prices for every account
          </Typography>
          <CallingForm key={JSON.stringify(view.calling)} view={view} />
        </CardContent>
      </Card>
    </Stack>
  );
}
