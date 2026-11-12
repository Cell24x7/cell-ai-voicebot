import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { whatsappErrorMessage } from '@/features/whatsapp/labels';
import {
  adminWhatsappApi,
  type ManagedCreditLine,
  type ManagedNumberInput,
} from '@/services/api/admin-whatsapp';
import { toApiError } from '@/services/api/errors';

import { managedNumberProblems } from './managed-number';
import { MANAGED_TEXTS } from './whatsapp-texts';

const EMPTY: ManagedNumberInput = {
  label: '',
  wabaId: '',
  phoneNumberId: '',
  apiKey: '',
  creditLine: 'partner_pending',
};

/** PN: superadmin adds a number that lives at Pinnacle (the key is never kept in the page). */
export function ManagedNumberDialog({
  accountId,
  onClose,
  onDone,
}: {
  accountId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState<ManagedNumberInput>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const add = useMutation({
    mutationFn: () => adminWhatsappApi.addManagedNumber(accountId, form),
    meta: { silent: true },
    onSuccess: (r) => {
      setForm(EMPTY);
      enqueueSnackbar(
        r.outcome === 'connected'
          ? MANAGED_TEXTS.added
          : `${MANAGED_TEXTS.added} — ${r.channel.statusReason?.message ?? 'needs attention'}`,
        { variant: r.outcome === 'connected' ? 'success' : 'warning' },
      );
      onDone();
    },
  });
  const problems = managedNumberProblems(form);
  const ready = Object.keys(problems).length === 0;
  const set =
    (k: Exclude<keyof ManagedNumberInput, 'creditLine'>) => (e: { target: { value: string } }) =>
      setForm((f) => ({ ...f, [k]: k === 'label' ? e.target.value : e.target.value.trim() }));
  const show = (k: keyof ManagedNumberInput) => (touched ? problems[k] : undefined);
  const close = () => {
    setForm(EMPTY);
    onClose();
  };
  return (
    <Dialog open onClose={close} fullWidth maxWidth="sm" aria-labelledby="wa-managed-title">
      <DialogTitle id="wa-managed-title">{MANAGED_TEXTS.title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity="info">
            {MANAGED_TEXTS.intro} {MANAGED_TEXTS.help}
          </Alert>
          {add.error && (
            <Alert severity="error">{whatsappErrorMessage(toApiError(add.error))}</Alert>
          )}
          <TextField
            label="Label"
            value={form.label}
            onChange={set('label')}
            error={Boolean(show('label'))}
            helperText={show('label')}
            slotProps={{ htmlInput: { maxLength: 60 } }}
          />
          <TextField
            label="WABA ID"
            value={form.wabaId}
            onChange={set('wabaId')}
            error={Boolean(show('wabaId'))}
            helperText={show('wabaId')}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          />
          <TextField
            label="Phone number ID"
            value={form.phoneNumberId}
            onChange={set('phoneNumberId')}
            error={Boolean(show('phoneNumberId'))}
            helperText={show('phoneNumberId')}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          />
          <TextField
            label="API key"
            type={showKey ? 'text' : 'password'}
            autoComplete="off"
            value={form.apiKey}
            onChange={set('apiKey')}
            error={Boolean(show('apiKey'))}
            helperText={show('apiKey') ?? 'Stored encrypted; never shown again.'}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      aria-label={showKey ? 'Hide API key' : 'Show API key'}
                      onClick={() => setShowKey((v) => !v)}
                    >
                      <Typography variant="caption">{showKey ? 'Hide' : 'Show'}</Typography>
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          <div>
            <FormLabel id="wa-managed-credit">{MANAGED_TEXTS.creditLine}</FormLabel>
            <RadioGroup
              aria-labelledby="wa-managed-credit"
              value={form.creditLine}
              onChange={(e) =>
                setForm((f) => ({ ...f, creditLine: e.target.value as ManagedCreditLine }))
              }
            >
              <FormControlLabel
                value="partner_pending"
                control={<Radio />}
                label={MANAGED_TEXTS.requested}
              />
              <FormControlLabel
                value="partner_active"
                control={<Radio />}
                label={MANAGED_TEXTS.active}
              />
            </RadioGroup>
          </div>
          {add.isPending && <Alert severity="info">{MANAGED_TEXTS.progress}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        <Button
          variant="contained"
          disabled={add.isPending}
          onClick={() => {
            setTouched(true);
            if (ready) add.mutate();
          }}
        >
          Add number
        </Button>
      </DialogActions>
    </Dialog>
  );
}
