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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { DataTable } from '@/components/DataTable';
import {
  CHANNEL_STATUS_LABELS,
  channelStatusColor,
  QUALITY_LABELS,
  whatsappErrorMessage,
} from '@/features/whatsapp/labels';
import { adminWhatsappApi, type ManualConnectInput } from '@/services/api/admin-whatsapp';
import { toApiError } from '@/services/api/errors';
import type {
  AdminAccountDetail,
  AdminWhatsAppChannelRow,
  WhatsAppMetaPayer,
  WhatsAppQuality,
} from '@/services/api/types';

import { adminKeys } from './keys';

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

/** Superadmin account detail: WhatsApp numbers, force disconnect, manual connect (Meta billing: WhatsApp billing card). */
export function WhatsAppCard({ detail }: { detail: AdminAccountDetail }) {
  const id = detail.account.id;
  const queryClient = useQueryClient();
  const [force, setForce] = useState<AdminWhatsAppChannelRow | null>(null);
  const [manual, setManual] = useState(false);
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
          <Button size="small" onClick={() => setManual(true)}>
            Manual connect
          </Button>
        </Stack>
        <DataTable
          aria-label="WhatsApp numbers"
          columns={[
            {
              key: 'label',
              header: 'Number',
              render: (r) => `${r.label} · ${r.displayPhoneNumber ?? '—'}`,
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
                `${PAYER_LABELS[r.metaPayer]} (${r.creditLineStatus.replace('_', ' ')})`,
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
