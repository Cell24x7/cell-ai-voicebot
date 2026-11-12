import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { adminApi } from '@/services/api/admin';
import { phoneNumberKeys, phoneNumbersApi } from '@/services/api/phone-numbers';
import type { AdminAccountDetail } from '@/services/api/types';

import { adminKeys } from './keys';

const text = (v: number | null) => (v === null ? '' : String(v));
const numberOrNull = (s: string) => (s.trim() === '' ? null : Number(s));

/**
 * Superadmin: which line the account's campaigns and calls use (Phase 18), its SIP
 * pulse and spend guard, and the numbers it has.
 */
export function PhoneLineCard({ detail }: { detail: AdminAccountDetail }) {
  const id = detail.account.id;
  const onSip = detail.voiceLine === 'sip';
  // CM (D18): "Live" only when the server has SIP too (else calls stay simulated)
  const serverSip = detail.phoneLine.server === 'sip';
  const live = onSip && detail.phoneLine.connected;
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [pulse, setPulse] = useState(text(detail.sipSettings.pulseSec));
  const [spend, setSpend] = useState(text(detail.sipSettings.spendMinutesPerHour));
  const numbers = useQuery({
    queryKey: phoneNumberKeys.admin(id),
    queryFn: () => phoneNumbersApi.list({ accountId: id }),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: adminKeys.account(id) });
  const switchLine = useMutation({
    mutationFn: () => adminApi.setVoiceLine(id, onSip ? 'dryrun' : 'sip'),
    meta: { silent: true },
    onSuccess: (r) => {
      enqueueSnackbar(r.voiceLine === 'sip' ? 'Now on the phone line' : 'Back on the test line', {
        variant: 'success',
      });
      setConfirming(false);
      refresh();
    },
  });
  const pulseValue = numberOrNull(pulse);
  const spendValue = numberOrNull(spend);
  const pulseBad =
    pulseValue !== null && !(Number.isInteger(pulseValue) && pulseValue >= 1 && pulseValue <= 60);
  const spendBad =
    spendValue !== null &&
    !(Number.isInteger(spendValue) && spendValue >= 1 && spendValue <= 100_000);
  const save = useMutation({
    mutationFn: () =>
      adminApi.setSipSettings(id, { pulseSec: pulseValue, spendMinutesPerHour: spendValue }),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Phone line settings saved', { variant: 'success' });
      refresh();
    },
  });
  const active = (numbers.data ?? []).filter((n) => n.status === 'active');
  return (
    <Card variant="outlined" component="section" aria-label="Phone line">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="subtitle1" component="h2">
            Phone line
          </Typography>
          <Typography variant="body2">
            {live
              ? 'Live: campaigns and Call now dial real phones over the SIP trunk.'
              : 'Test line: calls are simulated and never charged.'}
          </Typography>
          {onSip && !serverSip ? (
            <Alert severity="warning">
              This account is set to the phone line, but this server has no phone line (SIP) yet:
              its calls stay simulated until the server team turns SIP on.
            </Alert>
          ) : null}
          {onSip && active.length === 0 ? (
            <Alert severity="warning">
              No number given to this account: its calls show the default caller ID.
            </Alert>
          ) : null}
          {active.length ? (
            <Typography variant="body2" color="text.secondary">
              Numbers: {active.map((n) => n.number).join(', ')}
            </Typography>
          ) : null}
          <div>
            <Button
              variant={onSip ? 'outlined' : 'contained'}
              color={onSip ? 'warning' : 'primary'}
              onClick={() => setConfirming(true)}
            >
              {onSip ? 'Move to the test line' : 'Move to the phone line'}
            </Button>
          </div>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Billing pulse (seconds)"
              size="small"
              type="number"
              value={pulse}
              onChange={(e) => setPulse(e.target.value)}
              error={pulseBad}
              helperText={pulseBad ? '1 to 60' : 'Empty = the rate card pulse'}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Phone minutes per hour"
              size="small"
              type="number"
              value={spend}
              onChange={(e) => setSpend(e.target.value)}
              error={spendBad}
              helperText={spendBad ? '1 to 100,000' : 'Campaigns pause above this. Empty = default'}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
          <div>
            <Button
              disabled={
                pulseBad ||
                spendBad ||
                save.isPending ||
                (pulse === text(detail.sipSettings.pulseSec) &&
                  spend === text(detail.sipSettings.spendMinutesPerHour))
              }
              onClick={() => save.mutate()}
            >
              Save
            </Button>
          </div>
        </Stack>
      </CardContent>
      <Dialog open={confirming} onClose={() => setConfirming(false)}>
        <DialogTitle>{onSip ? 'Move to the test line?' : 'Move to the phone line?'}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {onSip
              ? 'New calls will be simulated. Calls already on the phone keep going.'
              : 'New campaign and Call now calls will ring real phones and charge the wallet.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={switchLine.isPending}
            onClick={() => switchLine.mutate()}
          >
            Move
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
