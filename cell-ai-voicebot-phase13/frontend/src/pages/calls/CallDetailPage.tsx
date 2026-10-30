import CallEndOutlined from '@mui/icons-material/CallEndOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useRef, type ReactNode } from 'react';
import { Link as RouterLink, useParams } from 'react-router';

import { PageHeader } from '@/components/PageHeader';
import { useAuthStore } from '@/features/auth/store';
import { RecordingPlayer } from '@/features/calls/detail/RecordingPlayer';
import { callKeys } from '@/features/calls/keys';
import {
  clock,
  describeEvent,
  dispositionLabel,
  END_REASON_LABELS,
  STATUS_LABELS,
  statusColor,
} from '@/features/calls/labels';
import {
  LIVE_STATUSES,
  useCall,
  useCallEvents,
  useCallLiveUpdates,
  useCallTranscript,
  useCanListenCalls,
  useCanTriggerCalls,
} from '@/features/calls/queries';
import { CallWhatsAppDetails } from '@/features/whatsapp-calling/CallWhatsAppDetails';
import { callsApi } from '@/services/api/calls';
import { getErrorMessage } from '@/services/api/errors';
import type { Call } from '@/services/api/types';
import { useWsEvent, useWsTopic } from '@/services/realtime';
import { formatInAccountTz } from '@/utils/datetime';
import { formatCurrencyMicros, formatNumber } from '@/utils/format';

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ textAlign: 'right' }}>
        {value}
      </Typography>
    </Stack>
  );
}

const str = (v: unknown): string =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : '';

const rec = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** Outcome lines: disposition, promise to pay, callback, transfer, queued messages. */
function Outcome({ call }: { call: Call }) {
  const o = call.outcome;
  const promise = rec(o.promiseToPay);
  const callback = rec(o.callback);
  const transfer = rec(o.transfer);
  const messages = Array.isArray(o.messages) ? o.messages.length : 0;
  const lines = [
    dispositionLabel(call.disposition) && `Result: ${dispositionLabel(call.disposition) ?? ''}`,
    promise &&
      `Promise to pay on ${str(promise.date)}${typeof promise.amountMicros === 'number' ? ` (${formatCurrencyMicros(promise.amountMicros)})` : ''}`,
    callback &&
      `Callback on ${str(callback.date)}${callback.time ? ` at ${str(callback.time)}` : ''}`,
    transfer && `Transfer: ${str(transfer.result).replace(/_/g, ' ')}`,
    messages > 0 &&
      `${String(messages)} message${messages === 1 ? '' : 's'} queued (sent from Phase 10)`,
  ].filter(Boolean);
  return lines.length ? (
    <Stack spacing={0.5}>
      {lines.map((l) => (
        <Typography key={String(l)} variant="body2">
          {l}
        </Typography>
      ))}
    </Stack>
  ) : (
    <Typography variant="body2" color="text.secondary">
      No outcome recorded.
    </Typography>
  );
}

/** `/calls/:id` — one call: summary, recording, transcript, timeline, cost. */
export function CallDetailPage() {
  const { id = '' } = useParams();
  const timezone = useAuthStore((s) => s.session?.account.timezone ?? 'Asia/Kolkata');
  const queryClient = useQueryClient();
  const canListen = useCanListenCalls();
  const canTrigger = useCanTriggerCalls();
  const call = useCall(id);
  const transcript = useCallTranscript(id);
  const events = useCallEvents(id);
  const audio = useRef<HTMLAudioElement | null>(null);
  useCallLiveUpdates();
  const live = call.data ? LIVE_STATUSES.includes(call.data.status) : false;
  useWsTopic(live ? `call:${id}` : null);
  useWsEvent('call.transcript', (event) => {
    if (event.data.callId === id && event.data.final) {
      void queryClient.invalidateQueries({ queryKey: callKeys.transcript(id) });
    }
  });
  const hangup = useMutation({
    mutationFn: () => callsApi.hangup(id),
    meta: { silent: true },
    onSuccess: (ended) => {
      queryClient.setQueryData(callKeys.detail(id), ended);
      enqueueSnackbar('Call hung up', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });

  if (call.isError) {
    return (
      <>
        <PageHeader title="Call" />
        <Alert severity="error" action={<Button onClick={() => void call.refetch()}>Retry</Button>}>
          {getErrorMessage(call.error)}
        </Alert>
      </>
    );
  }
  const c = call.data;
  if (!c) {
    return (
      <>
        <PageHeader title="Call" />
        <Skeleton variant="rounded" height={240} />
      </>
    );
  }
  const seek = (ms: number) => {
    if (!audio.current) return;
    audio.current.currentTime = ms / 1000;
    void audio.current.play().catch(() => undefined);
  };
  const sourceLink =
    c.source.kind === 'flow' && c.source.flowId ? (
      <Link
        component={RouterLink}
        to={
          c.source.flowVersionRef === 'draft'
            ? `/flows/${c.source.flowId}`
            : `/flows/${c.source.flowId}/versions`
        }
      >
        {c.source.name ?? 'Deleted flow'} ·{' '}
        {c.source.flowVersionRef === 'draft'
          ? 'saved draft'
          : `v${String(c.source.flowVersionRef)}`}
      </Link>
    ) : c.source.agentId ? (
      <Link component={RouterLink} to={`/agents/${c.source.agentId}`}>
        {c.source.name ?? 'Deleted agent'} (agent)
      </Link>
    ) : c.source.kind === null ? (
      'Team member'
    ) : (
      '—'
    );
  const m = c.metrics;
  const whatsapp = c.provider === 'whatsapp';
  return (
    <>
      <PageHeader
        title="Call"
        subtitle={formatInAccountTz(c.createdAt, timezone)}
        actions={
          live && canTrigger ? (
            <Button
              color="error"
              variant="contained"
              startIcon={<CallEndOutlined />}
              onClick={() => hangup.mutate()}
              disabled={hangup.isPending}
            >
              Hang up
            </Button>
          ) : undefined
        }
      />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Stack spacing={2}>
            <Paper variant="outlined" sx={{ p: 2 }} component="section" aria-label="Summary">
              <Stack spacing={1}>
                <Stack direction="row" spacing={1}>
                  <Chip
                    size="small"
                    color={statusColor(c.status)}
                    label={STATUS_LABELS[c.status]}
                  />
                  {whatsapp && (
                    <Chip size="small" color="success" variant="outlined" label="WhatsApp" />
                  )}
                  {c.provider === 'dryrun' ? (
                    <Chip size="small" variant="outlined" label="Simulated call" />
                  ) : (
                    c.isTest && <Chip size="small" variant="outlined" label="Web test call" />
                  )}
                </Stack>
                <Row label="Flow / agent" value={sourceLink} />
                {c.campaign && (
                  <Row
                    label="Campaign"
                    value={
                      <Link component={RouterLink} to={`/campaigns/${c.campaign.id}`}>
                        {c.campaign.name} · attempt {c.campaign.attempt}
                      </Link>
                    }
                  />
                )}
                <Row
                  label="Contact"
                  value={
                    c.contact ? (
                      <Link component={RouterLink} to={`/contacts/c/${c.contact.id}`}>
                        {c.contact.name || 'No name'}
                      </Link>
                    ) : (
                      'Typed values'
                    )
                  }
                />
                <Row label="Started by" value={c.startedBy?.name ?? '—'} />
                <Row label="Length" value={`${String(c.durationSec)} s`} />
                <Row label="Ended" value={c.endReason ? END_REASON_LABELS[c.endReason] : '—'} />
                <Row
                  label="Language"
                  value={
                    c.languageDetected === 'en'
                      ? 'English'
                      : c.languageDetected
                        ? 'Hindi / Hinglish'
                        : '—'
                  }
                />
                {c.error && <Row label="Error" value={c.error.code.replace(/_/g, ' ')} />}
              </Stack>
              <Divider sx={{ my: 1.5 }} />
              <Outcome call={c} />
            </Paper>
            {c.recording &&
              (canListen ? (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <RecordingPlayer
                    callId={c.id}
                    durationSec={c.recording.durationSec}
                    audioRef={audio}
                  />
                </Paper>
              ) : (
                <Alert severity="info">You can't play recordings with your role.</Alert>
              ))}
            <Paper variant="outlined" sx={{ p: 2 }} component="section" aria-label="Transcript">
              <Typography variant="subtitle1" component="h2" gutterBottom>
                Transcript
              </Typography>
              {transcript.isPending && <Skeleton variant="rounded" height={120} />}
              {transcript.data?.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  Nothing was said yet.
                </Typography>
              )}
              <List dense>
                {transcript.data?.map((t) => (
                  <ListItem key={t.seq} disableGutters alignItems="flex-start">
                    <Button
                      size="small"
                      sx={{ minWidth: 64, mr: 1 }}
                      onClick={() => seek(t.startMs)}
                      aria-label={`Play from ${clock(t.startMs / 1000)}`}
                    >
                      {clock(t.startMs / 1000)}
                    </Button>
                    <ListItemText
                      primary={
                        <>
                          <Typography
                            component="span"
                            variant="body2"
                            sx={{ fontWeight: 600, mr: 1 }}
                          >
                            {t.speaker === 'customer' ? 'Customer' : 'Bot'}
                          </Typography>
                          <Typography component="span" variant="body2">
                            {t.text}
                          </Typography>
                          {t.interrupted && (
                            <Chip
                              size="small"
                              variant="outlined"
                              label="interrupted"
                              sx={{ ml: 1 }}
                            />
                          )}
                        </>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Stack spacing={2}>
            {whatsapp && <CallWhatsAppDetails call={c} timezone={timezone} />}
            <Paper variant="outlined" sx={{ p: 2 }} component="section" aria-label="Cost">
              <Typography variant="subtitle1" component="h2" gutterBottom>
                Cost {formatCurrencyMicros(c.cost.totalMicros)}
              </Typography>
              <Stack spacing={0.5}>
                <Row
                  label={whatsapp ? 'WhatsApp call' : 'Phone line'}
                  value={
                    whatsapp && c.direction === 'inbound' && c.cost.telephonyMicros === 0
                      ? 'Free (the customer called)'
                      : c.isTest && c.cost.telephonyMicros === 0
                        ? 'None (web test call)'
                        : formatCurrencyMicros(c.cost.telephonyMicros)
                  }
                />
                <Row label="AI conversation" value={formatCurrencyMicros(c.cost.aiMicros)} />
                <Row label="AI voice (TTS)" value={formatCurrencyMicros(c.cost.ttsMicros)} />
                <Row
                  label="Platform commission"
                  value={formatCurrencyMicros(c.cost.commissionMicros)}
                />
              </Stack>
            </Paper>
            <Paper variant="outlined" sx={{ p: 2 }} component="section" aria-label="Quality">
              <Typography variant="subtitle1" component="h2" gutterBottom>
                Quality
              </Typography>
              <Stack spacing={0.5}>
                <Row
                  label="Bot reply time"
                  value={
                    m.latency.samples
                      ? `median ${String(m.latency.p50Ms)} ms · p95 ${String(m.latency.p95Ms)} ms · max ${String(m.latency.maxMs)} ms`
                      : '—'
                  }
                />
                <Row label="Interruptions" value={m.bargeIns} />
                <Row label="Silence prompts" value={m.silencePrompts} />
                <Row label="AI time" value={`${String(m.aiSeconds)} s`} />
                <Row
                  label="Voice characters"
                  value={`${formatNumber(m.ttsChars)} (${formatNumber(m.ttsCachedChars)} cached)`}
                />
              </Stack>
            </Paper>
            <Paper variant="outlined" sx={{ p: 2 }} component="section" aria-label="Timeline">
              <Typography variant="subtitle1" component="h2" gutterBottom>
                Timeline
              </Typography>
              {events.isPending && <Skeleton variant="rounded" height={120} />}
              <List dense sx={{ maxHeight: 480, overflowY: 'auto' }}>
                {events.data?.map((e) => (
                  <ListItem key={e.seq} disableGutters>
                    <ListItemText
                      primary={describeEvent(e.type, e.data)}
                      secondary={formatInAccountTz(e.at, timezone)}
                      slotProps={{ primary: { variant: 'body2' } }}
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Stack>
        </Grid>
      </Grid>
    </>
  );
}
