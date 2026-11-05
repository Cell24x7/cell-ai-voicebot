import CallOutlined from '@mui/icons-material/CallOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';

import { usePermission, useSession } from '@/features/auth/hooks';
import { useChannels } from '@/features/whatsapp/queries';
import { CallButton } from '@/features/whatsapp-calling/live/CallButton';
import { useCanCall } from '@/features/whatsapp-calling/permissions';
import { phoneNumberKeys, phoneNumbersApi } from '@/services/api/phone-numbers';

import { CallNowDialog } from './CallNowDialog';
import { callMethods, whatsappCapabilities } from './capabilities';

export interface CallTarget {
  contactId: string;
  buttonLabel?: string;
  phoneE164: string;
  label: string;
  channelId?: string;
  conversationId?: string | null;
  windowExpiresAt?: string | null;
  onStarted?: () => void;
}

/** One transport/sender choice for Contacts, Calls and Inbox. Consent stays pair-scoped. */
export function CallMethodContent(target: CallTarget) {
  const canCall = useCanCall();
  const canReadWhatsApp = usePermission('whatsapp.read');
  const canReadAccount = usePermission('account.read');
  const timezone = useSession()?.account.timezone ?? 'Asia/Kolkata';
  const phoneLine = useQuery({
    queryKey: phoneNumberKeys.line,
    queryFn: phoneNumbersApi.line,
    enabled: canCall && canReadAccount,
  });
  const channels = useChannels(canCall && canReadWhatsApp);
  const methods = callMethods({
    canCall,
    phoneLine: phoneLine.data,
    channels: canReadWhatsApp ? (channels.data?.items ?? []) : [],
  });
  const [method, setMethod] = useState<'phone' | 'whatsapp' | ''>('');
  const [phoneId, setPhoneId] = useState('');
  const [whatsappId, setWhatsAppId] = useState<string | null>(target.channelId ?? null);
  const [normalOpen, setNormalOpen] = useState(false);
  const selectedMethod =
    method ||
    (methods.phone && !methods.whatsapp.length
      ? 'phone'
      : !methods.phone && methods.whatsapp.length
        ? 'whatsapp'
        : '');
  const phones =
    phoneLine.data?.numbers.filter((n) => n.status === 'active' && n.purpose === 'outbound') ?? [];
  const phone = phones.find(
    (n) => n.id === (phoneId || (phones.length === 1 ? phones[0]!.id : '')),
  );
  const channel = methods.whatsapp.find(
    (n) => n.id === (whatsappId ?? (methods.whatsapp.length === 1 ? methods.whatsapp[0]!.id : '')),
  );
  if (!canCall) return <Alert severity="info">Your role cannot place calls.</Alert>;
  if (phoneLine.isLoading || channels.isLoading)
    return <Typography>Checking connected numbers…</Typography>;
  return (
    <Stack spacing={2}>
      <Typography>
        {target.label} · {target.phoneE164}
      </Typography>
      {(phoneLine.isError || channels.isError) && (
        <Alert
          severity="warning"
          action={
            <Button
              onClick={() => {
                if (phoneLine.isError) void phoneLine.refetch();
                if (channels.isError) void channels.refetch();
              }}
            >
              Retry
            </Button>
          }
        >
          Some connected numbers could not be loaded. Retry before choosing that method.
        </Alert>
      )}
      {!methods.phone && !methods.whatsapp.length && (
        <Alert severity="info">
          Connect a SIP caller number or enable calling on a supported WhatsApp number.
        </Alert>
      )}
      <TextField
        select
        label="Call method"
        value={selectedMethod}
        onChange={(e) => setMethod(e.target.value as 'phone' | 'whatsapp')}
      >
        <MenuItem value="" disabled>
          Choose call method
        </MenuItem>
        {methods.phone && <MenuItem value="phone">Normal call (SIP)</MenuItem>}
        {methods.whatsapp.length > 0 && <MenuItem value="whatsapp">WhatsApp call</MenuItem>}
      </TextField>
      {(channels.data?.items ?? [])
        .filter((c) => !whatsappCapabilities(c).calling)
        .map((c) => (
          <Typography key={c.id} variant="caption">
            {c.label}: {whatsappCapabilities(c).reason}
          </Typography>
        ))}
      {selectedMethod === 'phone' && methods.phone && (
        <>
          <TextField
            select
            label="Caller number"
            value={phone?.id ?? ''}
            onChange={(e) => setPhoneId(e.target.value)}
          >
            <MenuItem value="" disabled>
              Choose caller number
            </MenuItem>
            {phones.map((n) => (
              <MenuItem key={n.id} value={n.id}>
                {n.label} · {n.number}
              </MenuItem>
            ))}
          </TextField>
          <Button variant="contained" disabled={!phone} onClick={() => setNormalOpen(true)}>
            Continue with normal call
          </Button>
        </>
      )}
      {selectedMethod === 'whatsapp' && (
        <>
          <TextField
            select
            label="WhatsApp number"
            value={channel?.id ?? ''}
            onChange={(e) => setWhatsAppId(e.target.value)}
          >
            <MenuItem value="" disabled>
              Choose WhatsApp number
            </MenuItem>
            {methods.whatsapp.map((n) => (
              <MenuItem key={n.id} value={n.id}>
                {n.label} · {n.displayPhoneNumber ?? n.phoneE164}
              </MenuItem>
            ))}
          </TextField>
          {channel && (
            <CallButton
              key={`${channel.id}:${target.contactId}`}
              onStarted={target.onStarted}
              channelId={channel.id}
              contactId={target.contactId}
              phoneE164={target.phoneE164}
              label={target.label}
              conversationId={
                channel.id === target.channelId ? (target.conversationId ?? null) : null
              }
              windowExpiresAt={
                channel.id === target.channelId ? (target.windowExpiresAt ?? null) : null
              }
            />
          )}
        </>
      )}
      <Stack direction="row" spacing={1}>
        {canReadAccount && (
          <Button component={RouterLink} to="/settings">
            Phone setup
          </Button>
        )}
        {canReadWhatsApp && (
          <Button component={RouterLink} to="/whatsapp/numbers">
            WhatsApp numbers
          </Button>
        )}
      </Stack>
      {normalOpen && phone && (
        <CallNowDialog
          contactId={target.contactId}
          contactLabel={`${target.label} · ${target.phoneE164}`}
          onStarted={target.onStarted}
          timezone={timezone}
          callerNumberId={phone.id}
          callerLabel={`${phone.label} · ${phone.number}`}
          onClose={() => setNormalOpen(false)}
        />
      )}
    </Stack>
  );
}

export function CallMethodDialog({ onClose, ...target }: CallTarget & { onClose: () => void }) {
  return (
    <Dialog open fullWidth maxWidth="sm" onClose={onClose}>
      <DialogTitle>Call now</DialogTitle>
      <DialogContent>
        <CallMethodContent {...target} onStarted={onClose} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export function CallAction(target: CallTarget) {
  const canCall = useCanCall();
  const [open, setOpen] = useState(false);
  if (!canCall) return null;
  return (
    <>
      <Button
        size="small"
        variant="outlined"
        startIcon={<CallOutlined />}
        onClick={() => setOpen(true)}
      >
        {target.buttonLabel ?? 'Call'}
      </Button>
      {open && <CallMethodDialog {...target} onClose={() => setOpen(false)} />}
    </>
  );
}
