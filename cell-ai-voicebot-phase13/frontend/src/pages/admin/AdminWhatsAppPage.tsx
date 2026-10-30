import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import type { ReactNode } from 'react';

import { CopyButton } from '@/components/CopyButton';
import { DataTable } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { RelativeTime } from '@/components/RelativeTime';
import { whatsappKeys } from '@/features/whatsapp/keys';
import { CHANNEL_STATUS_LABELS, whatsappErrorMessage } from '@/features/whatsapp/labels';
import { adminWhatsappApi } from '@/services/api/admin-whatsapp';
import { toApiError } from '@/services/api/errors';
import type { WhatsAppAdminStatus, WhatsAppChannelStatus } from '@/services/api/types';

const FLAG_LABELS: Record<keyof WhatsAppAdminStatus['configured'], string> = {
  appId: 'Meta app id',
  appSecret: 'App secret',
  configId: 'Embedded Signup configuration',
  verifyToken: 'Webhook verify token',
  creditLine: 'Platform credit line',
  systemUserToken: 'System User token',
};

function UrlRow({ label, url }: { label: string; url: string }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Typography variant="body2" color="text.secondary" sx={{ width: 180, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" component="code" sx={{ wordBreak: 'break-all' }}>
        {url}
      </Typography>
      <CopyButton value={url} label={`Copy ${label}`} />
    </Stack>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="subtitle1" component="h2" sx={{ mb: 1 }}>
          {title}
        </Typography>
        {children}
      </CardContent>
    </Card>
  );
}

/** Superadmin `/admin/whatsapp`: Meta setup status, webhook URL to paste in Meta, failed events. */
export function AdminWhatsAppPage() {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: whatsappKeys.adminStatus,
    queryFn: adminWhatsappApi.status,
    meta: { silent: true },
  });
  const failed = useQuery({
    queryKey: whatsappKeys.adminEvents('failed'),
    queryFn: () => adminWhatsappApi.events('failed'),
    enabled: status.isSuccess,
  });
  const replay = useMutation({
    mutationFn: (id: string) => adminWhatsappApi.replay(id),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Event queued again', { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: whatsappKeys.adminEvents('failed') });
    },
    onError: (err) => enqueueSnackbar(whatsappErrorMessage(toApiError(err)), { variant: 'error' }),
  });

  const s = status.data;
  return (
    <>
      <PageHeader title="WhatsApp" subtitle="Meta app setup and webhook health (all accounts)." />
      {status.isError && (
        <Alert severity="info">{whatsappErrorMessage(toApiError(status.error))}</Alert>
      )}
      {status.isPending && <Skeleton variant="rounded" height={200} />}
      {s && (
        <Stack spacing={2}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Section title="Meta app">
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Provider:{' '}
                  <strong>{s.provider === 'fake' ? 'Fake Meta (simulated)' : 'Meta'}</strong> ·
                  Graph {s.graphVersion}
                </Typography>
                <Stack spacing={0.5} aria-label="Configured">
                  {(Object.keys(FLAG_LABELS) as (keyof typeof FLAG_LABELS)[]).map((k) => (
                    <Typography key={k} variant="body2">
                      {s.configured[k] ? '✓' : '✗'} {FLAG_LABELS[k]}
                      {s.configured[k] ? ' set' : ' not set'}
                    </Typography>
                  ))}
                </Stack>
              </Section>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Section title="Webhooks">
                <Stack spacing={1}>
                  <UrlRow label="Webhook URL" url={s.webhookUrl} />
                  <UrlRow label="Deauthorize URL" url={s.deauthorizeUrl} />
                  <UrlRow label="Data deletion URL" url={s.dataDeletionUrl} />
                  <Typography variant="body2">
                    Last webhook received: <RelativeTime value={s.lastEventAt} />
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Events (24 h):{' '}
                    {Object.entries(s.eventsByStatus24h)
                      .map(([k, n]) => `${k} ${String(n)}`)
                      .join(' · ') || 'none'}
                  </Typography>
                </Stack>
              </Section>
            </Grid>
          </Grid>
          <Section title="Numbers by status">
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              {Object.entries(s.channelsByStatus).map(([k, n]) => (
                <Chip
                  key={k}
                  label={`${CHANNEL_STATUS_LABELS[k as WhatsAppChannelStatus] ?? k}: ${String(n)}`}
                />
              ))}
              {Object.keys(s.channelsByStatus).length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No numbers connected yet.
                </Typography>
              )}
            </Stack>
          </Section>
          <div>
            <Typography variant="subtitle1" component="h2" sx={{ mb: 1 }}>
              Failed events
            </Typography>
            <DataTable
              aria-label="Failed events"
              loading={failed.isPending}
              error={failed.error}
              columns={[
                {
                  key: 'at',
                  header: 'Received',
                  render: (e) => <RelativeTime value={e.receivedAt} />,
                },
                { key: 'field', header: 'Field', render: (e) => <code>{e.field}</code> },
                { key: 'attempts', header: 'Attempts', render: (e) => e.attempts, align: 'right' },
                { key: 'error', header: 'Error', render: (e) => e.error ?? '—' },
                {
                  key: 'replay',
                  header: '',
                  render: (e) => (
                    <Button
                      size="small"
                      disabled={replay.isPending}
                      onClick={() => replay.mutate(e.id)}
                    >
                      Replay
                    </Button>
                  ),
                },
              ]}
              rows={failed.data}
              getRowId={(e) => e.id}
              emptyTitle="No failed events"
            />
          </div>
        </Stack>
      )}
    </>
  );
}
