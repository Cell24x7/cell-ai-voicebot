import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router';

import { useConfirm } from '@/components/confirm-context';
import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { useSession } from '@/features/auth/hooks';
import { formatInZone } from '@/features/campaigns/time';
import { useChannels } from '@/features/whatsapp/queries';
import {
  WA_CAMPAIGN_STATUS_LABELS,
  WA_PAUSE_REASON_LABELS,
  WA_RECIPIENT_STATUS_LABELS,
  waCampaignStatusColor,
  waMetaCodeLabel,
  waRecipientStatusColor,
  waSkipReasonLabel,
} from '@/features/whatsapp-campaigns/labels';
import { useCanWriteWaCampaigns } from '@/features/whatsapp-campaigns/permissions';
import {
  usePauseWaCampaign,
  useResumeWaCampaign,
  useRetryWaCampaignFailed,
  useStopWaCampaign,
  useWaCampaign,
  useWaCampaignLiveUpdates,
  useWaCampaignRecipients,
  useWaCampaignReport,
} from '@/features/whatsapp-campaigns/queries';
import { getErrorMessage } from '@/services/api/errors';
import type {
  WhatsAppCampaignRecipient,
  WhatsAppCampaignRecipientStatus,
  WhatsAppCampaignReport,
} from '@/services/api/types';
import { waCampaignsApi } from '@/services/api/whatsapp-campaigns';
import { formatCurrencyMicros } from '@/utils/format';

export function WhatsAppCampaignDetailPage() {
  const { id = '' } = useParams();
  const campaign = useWaCampaign(id);
  const channels = useChannels();
  const session = useSession();
  const canWrite = useCanWriteWaCampaigns();
  const confirm = useConfirm();
  const [tab, setTab] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<WhatsAppCampaignRecipientStatus | ''>('');
  const c = campaign.data;
  const live = Boolean(c && !['draft', 'stopped', 'failed'].includes(c.status));
  const recipients = useWaCampaignRecipients(
    id,
    { page, limit: 50, ...(status ? { status } : {}) },
    live,
  );
  const report = useWaCampaignReport(id, tab === 1);
  const pause = usePauseWaCampaign();
  const resume = useResumeWaCampaign();
  const stop = useStopWaCampaign();
  const retry = useRetryWaCampaignFailed();
  useWaCampaignLiveUpdates();
  const download = useMutation({
    mutationFn: async () => {
      const url = await waCampaignsApi.export(id);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `whatsapp-campaign-${id}.csv`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    },
    meta: { silent: true },
  });
  if (campaign.isPending) return <LinearProgress aria-label="Loading campaign" />;
  if (campaign.error || !c)
    return <Alert severity="error">{getErrorMessage(campaign.error)}</Alert>;
  const busy = pause.isPending || resume.isPending || stop.isPending || retry.isPending;
  const error = pause.error ?? resume.error ?? stop.error ?? retry.error ?? download.error;
  const timezone = session?.account.timezone ?? 'Asia/Kolkata';
  const channel = channels.data?.items.find((n) => n.id === c.channelId);
  const columns: Column<WhatsAppCampaignRecipient>[] = [
    { key: 'name', header: 'Contact', render: (r) => r.name ?? 'Unnamed contact' },
    { key: 'phone', header: 'Phone', render: (r) => r.phone ?? '—' },
    { key: 'variant', header: 'Variant', render: (r) => r.variant },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Chip
          size="small"
          label={WA_RECIPIENT_STATUS_LABELS[r.status]}
          color={waRecipientStatusColor(r.status)}
        />
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (r) =>
        waSkipReasonLabel(r.skipReason) ??
        (r.status === 'failed' ? waMetaCodeLabel(r.errorCode) : '—'),
    },
    {
      key: 'sent',
      header: 'Sent',
      render: (r) => (r.sentAt ? formatInZone(r.sentAt, timezone) : '—'),
    },
    {
      key: 'reply',
      header: 'Replied',
      render: (r) => (r.repliedAt ? formatInZone(r.repliedAt, timezone) : '—'),
    },
  ];
  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={`WhatsApp · ${channel?.displayPhoneNumber ?? channel?.label ?? 'Campaign'}`}
        actions={
          <Button component={RouterLink} to="/campaigns?line=whatsapp">
            All campaigns
          </Button>
        }
      />
      <Stack spacing={2}>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ flexWrap: 'wrap', alignItems: 'center' }}
        >
          <Chip
            label={WA_CAMPAIGN_STATUS_LABELS[c.status]}
            color={waCampaignStatusColor(c.status)}
          />
          {canWrite && (
            <>
              {c.status === 'draft' && (
                <Button component={RouterLink} to={`/campaigns/whatsapp/${id}/edit`}>
                  Edit & start
                </Button>
              )}
              {['running', 'scheduled', 'waiting_for_limit'].includes(c.status) && (
                <Button disabled={busy} onClick={() => pause.mutate(id)}>
                  Pause
                </Button>
              )}
              {c.status === 'paused' && (
                <Button disabled={busy} onClick={() => resume.mutate(id)}>
                  Resume
                </Button>
              )}
              {(['running', 'scheduled', 'waiting_for_limit', 'paused'].includes(c.status) ||
                (c.status === 'completed' &&
                  c.schedule.kind === 'recurring' &&
                  c.recurrenceEnabled)) && (
                <Button
                  color="error"
                  disabled={busy}
                  onClick={() =>
                    void confirm({
                      title: 'Stop this campaign?',
                      message: 'Remaining recipients will be skipped. This cannot be undone.',
                      confirmText: 'Stop campaign',
                      destructive: true,
                    }).then((ok) => {
                      if (ok) stop.mutate(id);
                    })
                  }
                >
                  Stop
                </Button>
              )}
              {c.counters.failedTotal > 0 && ['completed', 'paused'].includes(c.status) && (
                <Button disabled={busy} onClick={() => retry.mutate(id)}>
                  Retry failed
                </Button>
              )}
            </>
          )}
          <Button disabled={download.isPending} onClick={() => download.mutate()}>
            Export CSV
          </Button>
        </Stack>
        {error && <Alert severity="error">{getErrorMessage(error)}</Alert>}
        {retry.data && (
          <Alert severity="success">{retry.data.retried} recipients queued for retry.</Alert>
        )}
        {channel?.messageRateLimit && (
          <Typography variant="body2">
            Up to {channel.messageRateLimit} messages/sec on this number
          </Typography>
        )}
        {c.schedule.kind === 'recurring' && (
          <Typography variant="body2">
            Repeats {c.schedule.recurrence?.freq} at {c.schedule.recurrence?.time} (
            {c.schedule.timezone})
          </Typography>
        )}
        {c.pauseReason && <Alert severity="warning">{WA_PAUSE_REASON_LABELS[c.pauseReason]}</Alert>}
        {c.nextBatchAt && (
          <Alert severity="info">
            Next batch at {formatInZone(c.nextBatchAt, timezone)}
            {channel?.messagingLimitTier
              ? ` · Messaging tier: ${channel.messagingLimitTier.replace('TIER_', '')}`
              : ''}
          </Alert>
        )}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" spacing={3} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {(
              [
                'total',
                'sent',
                'delivered',
                'read',
                'replied',
                'failedTotal',
                'skippedTotal',
              ] as const
            ).map((key) => (
              <Box key={key}>
                <Typography variant="caption">
                  {key === 'failedTotal'
                    ? 'Failed'
                    : key === 'skippedTotal'
                      ? 'Skipped'
                      : key.charAt(0).toUpperCase() + key.slice(1)}
                </Typography>
                <Typography variant="h5" aria-label={`${key} count`}>
                  {c.counters[key]}
                </Typography>
              </Box>
            ))}
            <Box>
              <Typography variant="caption">Charged</Typography>
              <Typography variant="h5">{formatCurrencyMicros(c.cost.chargedMicros)}</Typography>
            </Box>
          </Stack>
        </Paper>
        <Tabs
          value={tab}
          onChange={(_e, value: number) => setTab(value)}
          aria-label="Campaign details"
        >
          <Tab label="Recipients" />
          <Tab label="Report" />
        </Tabs>
        {tab === 0 ? (
          <>
            <TextField
              select
              label="Recipient status"
              size="small"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as WhatsAppCampaignRecipientStatus | '');
                setPage(1);
              }}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              sx={{ maxWidth: 240 }}
            >
              <MenuItem value="">All</MenuItem>
              {Object.entries(WA_RECIPIENT_STATUS_LABELS).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <DataTable
              aria-label="Campaign recipients"
              columns={columns}
              rows={recipients.data?.data}
              getRowId={(r) => r.contactId}
              loading={recipients.isPending}
              error={recipients.error}
              onRetry={() => void recipients.refetch()}
              pagination={{
                page,
                limit: 50,
                total: recipients.data?.meta.total ?? 0,
                onPageChange: setPage,
              }}
            />
          </>
        ) : (
          <>
            {report.isPending && <LinearProgress aria-label="Loading report" />}
            {report.error && <Alert severity="error">{getErrorMessage(report.error)}</Alert>}
            {report.data && <CampaignReport report={report.data} />}
          </>
        )}
      </Stack>
    </>
  );
}

function CampaignReport({ report: r }: { report: WhatsAppCampaignReport }) {
  return (
    <Stack spacing={2}>
      <Typography variant="h6">Delivery funnel</Typography>
      {Object.entries(r.funnel).map(([key, value]) => (
        <Stack key={key} direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Typography sx={{ width: 100 }}>
            {key}: {value}
          </Typography>
          <LinearProgress
            aria-label={`${key} funnel`}
            variant="determinate"
            value={r.funnel.total ? Math.min(100, (value / r.funnel.total) * 100) : 0}
            sx={{ flex: 1 }}
          />
        </Stack>
      ))}
      <Typography>
        Estimated {formatCurrencyMicros(r.cost.estimateMicros)} · Charged{' '}
        {formatCurrencyMicros(r.cost.chargedMicros)}
      </Typography>
      <Typography variant="h6">Send errors</Typography>
      {Object.entries(r.failedByCode).map(([code, count]) => (
        <Typography key={code}>
          {waMetaCodeLabel(Number(code))}: {count}
        </Typography>
      ))}
      {!Object.keys(r.failedByCode).length && <Typography>No send errors</Typography>}
      {Object.entries(r.skippedByReason).map(([reason, count]) => (
        <Typography key={reason}>
          {waSkipReasonLabel(reason)}: {count}
        </Typography>
      ))}
      <Typography variant="h6">Sent per day</Typography>
      {r.perDay.length ? (
        <BarChart
          height={240}
          xAxis={[{ scaleType: 'band', data: r.perDay.map((d) => d.day) }]}
          series={[{ data: r.perDay.map((d) => d.sent), label: 'Sent' }]}
        />
      ) : (
        <Typography>No messages sent yet</Typography>
      )}
      <DataTable
        aria-label="Variant comparison"
        rows={r.variants}
        getRowId={(v) => v.key}
        columns={[
          { key: 'key', header: 'Variant', render: (v) => v.key },
          { key: 'sent', header: 'Sent', render: (v) => v.sent },
          { key: 'read', header: 'Read', render: (v) => v.read },
          { key: 'replied', header: 'Replied', render: (v) => v.replied },
        ]}
      />
      {r.winner && <Alert severity="success">Winning variant: {r.winner}</Alert>}
    </Stack>
  );
}
