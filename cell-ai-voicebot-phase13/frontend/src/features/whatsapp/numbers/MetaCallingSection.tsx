import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { RelativeTime } from '@/components/RelativeTime';
import { useCanActAsOwner, usePermission } from '@/features/auth/hooks';
import { callingKeys } from '@/features/whatsapp-calling/keys';
import { toApiError } from '@/services/api/errors';
import type { MetaCallingResult, WhatsAppChannel, WhatsAppConfig } from '@/services/api/types';

import { whatsappErrorMessage } from '../labels';
import { useCheckMetaCalling, useDisableMetaCalling } from '../queries';

import { META_CALLING_METHOD_LABELS, META_CALLING_STATUS_LABELS } from './meta-calling-texts';
import { MetaCallingDialog, MetaCallingSteps } from './MetaCallingDialog';
import { WebhookChip } from './WebhookCheck';

/**
 * PMC: Number details → Calling of a managed (partner) number — calls over Meta Graph while
 * messages stay on the partner. Off / broken → **Calling on karo (Meta direct)**; on → status,
 * webhook, **Check / Fix**, **Calling off**.
 */
export function MetaCallingSection({
  channel,
  config,
}: {
  channel: WhatsAppChannel;
  config: WhatsAppConfig;
}) {
  const canEdit = usePermission('whatsapp.manage');
  const actsAsOwner = useCanActAsOwner();
  const canManage = canEdit && actsAsOwner;
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [offOpen, setOffOpen] = useState(false);
  const [turnOff, setTurnOff] = useState(false);
  const [checked, setChecked] = useState<MetaCallingResult | null>(null);
  const check = useCheckMetaCalling();
  const disable = useDisableMetaCalling();
  const m = channel.metaCalling;

  const refreshCalling = () => {
    void client.invalidateQueries({ queryKey: callingKeys.settings(channel.id) });
    void client.invalidateQueries({ queryKey: callingKeys.readiness(channel.id) });
  };

  const runCheck = async () => {
    try {
      setChecked(await check.mutateAsync(channel.id));
    } catch (err) {
      enqueueSnackbar(whatsappErrorMessage(toApiError(err)), { variant: 'error' });
    } finally {
      refreshCalling();
    }
  };

  const off = async () => {
    try {
      await disable.mutateAsync({ id: channel.id, turnOffAtWhatsApp: turnOff });
      enqueueSnackbar('Calling off — calls are back on the partner.', { variant: 'success' });
      setOffOpen(false);
    } catch (err) {
      enqueueSnackbar(whatsappErrorMessage(toApiError(err)), { variant: 'error' });
    } finally {
      refreshCalling();
    }
  };

  return (
    <Stack spacing={1} aria-label="Calls via Meta direct" role="region">
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="subtitle2">Calls via Meta direct</Typography>
        <Chip
          size="small"
          variant="outlined"
          color={m.status === 'on' ? 'success' : m.status === 'error' ? 'error' : 'default'}
          label={META_CALLING_STATUS_LABELS[m.status]}
        />
        {m.status !== 'off' && <WebhookChip check={m.webhookCheck} />}
      </Stack>
      {m.status === 'off' && (
        <Typography variant="body2" color="text.secondary">
          Partner (Pinnacle) calls nahi chala sakta. Messages Pinnacle par hi rahenge — sirf calls
          Meta se chalengi.
        </Typography>
      )}
      {m.status === 'error' && m.error && (
        <Alert severity="error">
          {m.error.message}
          {m.error.step ? ` (step: ${m.error.step})` : ''}
        </Alert>
      )}
      {m.status !== 'off' && (
        <Typography variant="body2" color="text.secondary">
          {m.method ? META_CALLING_METHOD_LABELS[m.method] : ''}
          {m.tokenLast4 ? ` · token …${m.tokenLast4}` : ''}
          {m.tokenExpiresAt ? ' · expires ' : ''}
          {m.tokenExpiresAt && <RelativeTime value={m.tokenExpiresAt} />}
          {m.checkedAt ? ' · checked ' : ''}
          {m.checkedAt && <RelativeTime value={m.checkedAt} />}
        </Typography>
      )}
      {checked && <MetaCallingSteps steps={checked.steps} />}
      {canManage && (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          {m.status !== 'on' && (
            <Button size="small" variant="contained" onClick={() => setOpen(true)}>
              Calling on karo (Meta direct)
            </Button>
          )}
          {m.status !== 'off' && (
            <Button size="small" disabled={check.isPending} onClick={() => void runCheck()}>
              {m.status === 'error' ? 'Retry check' : 'Check / Fix'}
            </Button>
          )}
          {m.status !== 'off' && (
            <Button size="small" color="error" onClick={() => setOffOpen(true)}>
              Calling off
            </Button>
          )}
        </Stack>
      )}
      {open && (
        <MetaCallingDialog channel={channel} config={config} onClose={() => setOpen(false)} />
      )}
      <Dialog open={offOpen} onClose={() => setOffOpen(false)}>
        <DialogTitle>Calling off (Meta direct)?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Is number par calls nahi aayengi / jayengi. Messages Pinnacle par chalte rahenge.
          </Typography>
          <FormControlLabel
            control={<Checkbox checked={turnOff} onChange={(e) => setTurnOff(e.target.checked)} />}
            label="Turn calling off at WhatsApp too"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOffOpen(false)}>Cancel</Button>
          <Button color="error" disabled={disable.isPending} onClick={() => void off()}>
            Calling off
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
