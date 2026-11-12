import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { useConfirm } from '@/components/confirm-context';
import { DataTable } from '@/components/DataTable';
import { RelativeTime } from '@/components/RelativeTime';
import { whatsappKeys } from '@/features/whatsapp/keys';
import {
  CHANNEL_STATUS_LABELS,
  channelStatusColor,
  QUALITY_LABELS,
  whatsappErrorMessage,
} from '@/features/whatsapp/labels';
import {
  adminWhatsappApi,
  type ManagedCreditLine,
  type ManualConnectInput,
} from '@/services/api/admin-whatsapp';
import { toApiError } from '@/services/api/errors';
import type {
  AdminAccountDetail,
  AdminWhatsAppChannelRow,
  WhatsAppMetaPayer,
  WhatsAppQuality,
} from '@/services/api/types';

import { adminKeys } from './keys';
import { ManagedNumberDialog } from './ManagedNumberDialog';
import { MANAGED_TEXTS } from './whatsapp-texts';

const DAY_MS = 86_400_000;

/** PN: replace the partner API key of a managed number. */
function ReplaceKeyDialog({
  row,
  onClose,
  onDone,
}: {
  row: AdminWhatsAppChannelRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const replace = useMutation({
    mutationFn: () => adminWhatsappApi.replaceManagedKey(row.id, apiKey),
    meta: { silent: true },
    onSuccess: () => {
      setApiKey('');
      enqueueSnackbar('API key replaced', { variant: 'success' });
      onDone();
    },
  });
  const ready = apiKey.length >= 8 && !/\s/.test(apiKey);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="wa-key-title">
      <DialogTitle id="wa-key-title">Replace API key — {row.label}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {replace.error && (
            <Alert severity="error">{whatsappErrorMessage(toApiError(replace.error))}</Alert>
          )}
          <TextField
            label="New API key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value.trim())}
            helperText="From the partner panel: Admin → Manage API Keys."
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!ready || replace.isPending}
          onClick={() => replace.mutate()}
        >
          Replace key
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** PN: partner details and actions of a managed number (superadmin). */
function ManagedDetails({
  row,
  onReplaceKey,
  onChanged,
}: {
  row: AdminWhatsAppChannelRow;
  onReplaceKey: () => void;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const fail = (err: unknown) =>
    enqueueSnackbar(whatsappErrorMessage(toApiError(err)), { variant: 'error' });
  const reset = useMutation({
    mutationFn: () => adminWhatsappApi.resetManagedWebhook(row.id),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Webhook set again at the partner', { variant: 'success' });
      onChanged();
    },
    onError: fail,
  });
  const credit = useMutation({
    mutationFn: (status: ManagedCreditLine) =>
      adminWhatsappApi.setManagedCreditLine(row.id, status),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Credit line updated', { variant: 'success' });
      onChanged();
    },
    onError: fail,
  });
  const p = row.pinnacle;
  const lowAt = p?.lastBalanceErrorAt ? new Date(p.lastBalanceErrorAt).getTime() : 0;
  // eslint-disable-next-line react-hooks/purity -- a display-only "recent" check
  const lowRecently = lowAt > 0 && Date.now() - lowAt < DAY_MS;
  const active = row.creditLineStatus === 'partner_active';
  const onCredit = async (next: ManagedCreditLine) => {
    if (next === 'partner_active') {
      const ok = await confirm({
        title: 'Credit line active?',
        message: MANAGED_TEXTS.activeConfirm,
        confirmText: 'It is active',
      });
      if (!ok) return;
    }
    credit.mutate(next);
  };
  return (
    <Stack spacing={0.5} sx={{ py: 0.5 }}>
      <Typography variant="caption" color="text.secondary">
        Key ••••{p?.keyLast4 ?? '????'} · Webhook set <RelativeTime value={p?.webhookSetAt} /> ·
        Last checked <RelativeTime value={p?.keyCheckedAt} />
      </Typography>
      {lowRecently && (
        <Typography variant="caption" color="error">
          {MANAGED_TEXTS.balanceLow} — <RelativeTime value={p?.lastBalanceErrorAt} />
        </Typography>
      )}
      {row.status !== 'disconnected' && (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Button size="small" onClick={onReplaceKey}>
            Replace API key
          </Button>
          <Button size="small" disabled={reset.isPending} onClick={() => reset.mutate()}>
            Reset webhook
          </Button>
          <Button
            size="small"
            disabled={credit.isPending}
            onClick={() => void onCredit(active ? 'partner_pending' : 'partner_active')}
          >
            {active ? 'Credit line: set to Requested' : 'Credit line: set to Active'}
          </Button>
        </Stack>
      )}
    </Stack>
  );
}

const PAYER_LABELS: Record<WhatsAppMetaPayer, string> = {
  platform: 'Platform credit line',
  customer: 'Customer pays Meta',
};

function DisconnectDialog({
  row,
  onClose,
  onDone,
}: {
  row: AdminWhatsAppChannelRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const disconnect = useMutation({
    mutationFn: () => adminWhatsappApi.disconnect(row.id, reason.trim()),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Number disconnected — the account owners were told why', {
        variant: 'success',
      });
      onDone();
    },
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="wa-force-title">
      <DialogTitle id="wa-force-title">Force disconnect {row.label}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {disconnect.error && (
            <Alert severity="error">{whatsappErrorMessage(toApiError(disconnect.error))}</Alert>
          )}
          <TextField
            label="Reason (sent to the account owners)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            minRows={2}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          color="error"
          variant="contained"
          disabled={reason.trim().length < 3 || disconnect.isPending}
          onClick={() => disconnect.mutate()}
        >
          Disconnect
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ManualConnectDialog({
  accountId,
  onClose,
  onDone,
}: {
  accountId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState<ManualConnectInput>({
    wabaId: '',
    phoneNumberId: '',
    accessToken: '',
  });
  const connect = useMutation({
    mutationFn: () => adminWhatsappApi.manualConnect(accountId, form),
    meta: { silent: true },
    onSuccess: (r) => {
      setForm((f) => ({ ...f, accessToken: '' }));
      enqueueSnackbar(
        r.outcome === 'connected'
          ? 'Number connected'
          : `Saved — ${r.channel.statusReason?.message ?? 'needs attention'}`,
        { variant: r.outcome === 'connected' ? 'success' : 'warning' },
      );
      onDone();
    },
  });
  const ready =
    /^\S+$/.test(form.wabaId) && /^\S+$/.test(form.phoneNumberId) && form.accessToken.length >= 20;
  const set = (k: keyof ManualConnectInput) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value.trim() }));
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="wa-manual-title">
      <DialogTitle id="wa-manual-title">Manual connect</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity="info">
            For the platform&apos;s own test number: a System User token with access to the WhatsApp
            account. The token is stored encrypted and never shown again.
          </Alert>
          {connect.error && (
            <Alert severity="error">{whatsappErrorMessage(toApiError(connect.error))}</Alert>
          )}
          <TextField
            label="WhatsApp account id (WABA id)"
            value={form.wabaId}
            onChange={set('wabaId')}
          />
          <TextField
            label="Phone number id"
            value={form.phoneNumberId}
            onChange={set('phoneNumberId')}
          />
          <TextField
            label="Access token"
            type="password"
            autoComplete="off"
            value={form.accessToken}
            onChange={set('accessToken')}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!ready || connect.isPending}
          onClick={() => connect.mutate()}
        >
          Connect
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Superadmin account detail: WhatsApp numbers, force disconnect, manual connect, managed numbers (PN). */
export function WhatsAppCard({ detail }: { detail: AdminAccountDetail }) {
  const id = detail.account.id;
  const queryClient = useQueryClient();
  const [force, setForce] = useState<AdminWhatsAppChannelRow | null>(null);
  const [manual, setManual] = useState(false);
  const [managed, setManaged] = useState(false);
  const [keyFor, setKeyFor] = useState<AdminWhatsAppChannelRow | null>(null);
  // PN: managed numbers only when the server has the partner API on
  const status = useQuery({
    queryKey: whatsappKeys.adminStatus,
    queryFn: adminWhatsappApi.status,
    meta: { silent: true },
  });
  const pinnacleOn = status.data?.pinnacle.enabled === true;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: adminKeys.account(id) });
  return (
    <Card variant="outlined" component="section" aria-label="WhatsApp">
      <CardContent>
        <Stack
          direction="row"
          sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}
        >
          <Typography variant="subtitle1" component="h2">
            WhatsApp
          </Typography>
          <Stack direction="row" spacing={1}>
            {pinnacleOn && (
              <Button size="small" onClick={() => setManaged(true)}>
                {MANAGED_TEXTS.add}
              </Button>
            )}
            <Button size="small" onClick={() => setManual(true)}>
              Manual connect
            </Button>
          </Stack>
        </Stack>
        <DataTable
          aria-label="WhatsApp numbers"
          columns={[
            {
              key: 'label',
              header: 'Number',
              render: (r) => (
                <Stack spacing={0.5}>
                  <span>
                    {r.label} · {r.displayPhoneNumber ?? '—'}
                    {r.managed && (
                      <Chip
                        size="small"
                        variant="outlined"
                        color="info"
                        label="Managed"
                        sx={{ ml: 1 }}
                      />
                    )}
                  </span>
                  {r.managed && (
                    <ManagedDetails row={r} onReplaceKey={() => setKeyFor(r)} onChanged={refresh} />
                  )}
                </Stack>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => (
                <Chip
                  size="small"
                  color={channelStatusColor(r.status)}
                  label={CHANNEL_STATUS_LABELS[r.status]}
                />
              ),
            },
            {
              key: 'quality',
              header: 'Quality',
              render: (r) => QUALITY_LABELS[r.qualityRating as WhatsAppQuality],
            },
            {
              key: 'payer',
              header: 'Meta billed to',
              render: (r) =>
                r.managed
                  ? `Partner credit line (${r.creditLineStatus === 'partner_active' ? 'active' : 'requested'})`
                  : `${PAYER_LABELS[r.metaPayer]} (${r.creditLineStatus.replace('_', ' ')})`,
            },
            {
              key: 'actions',
              header: '',
              render: (r) =>
                r.status === 'disconnected' ? null : (
                  <Button size="small" color="error" onClick={() => setForce(r)}>
                    Force disconnect
                  </Button>
                ),
            },
          ]}
          rows={detail.whatsappChannels}
          getRowId={(r) => r.id}
          emptyTitle="No WhatsApp numbers"
        />
      </CardContent>
      {force && (
        <DisconnectDialog
          row={force}
          onClose={() => setForce(null)}
          onDone={() => {
            setForce(null);
            refresh();
          }}
        />
      )}
      {managed && (
        <ManagedNumberDialog
          accountId={id}
          onClose={() => setManaged(false)}
          onDone={() => {
            setManaged(false);
            refresh();
          }}
        />
      )}
      {keyFor && (
        <ReplaceKeyDialog
          row={keyFor}
          onClose={() => setKeyFor(null)}
          onDone={() => {
            setKeyFor(null);
            refresh();
          }}
        />
      )}
      {manual && (
        <ManualConnectDialog
          accountId={id}
          onClose={() => setManual(false)}
          onDone={() => {
            setManual(false);
            refresh();
          }}
        />
      )}
    </Card>
  );
}
