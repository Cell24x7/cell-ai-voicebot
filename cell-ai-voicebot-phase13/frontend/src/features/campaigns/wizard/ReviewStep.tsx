import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useListOptions, useSegments } from '@/features/contacts/queries';
import { useFlowAudio, useFlows } from '@/features/flows/queries';
import { useChannels } from '@/features/whatsapp/queries';
import { campaignsApi, type DryRunOutcome, type ScenarioKey } from '@/services/api/campaigns';
import { getErrorMessage } from '@/services/api/errors';
import type { CampaignEstimate } from '@/services/api/types';
import { formatCurrencyMicros } from '@/utils/format';

import { scheduleMode } from '../fields/schedule';
import {
  DAY_SHORT,
  OUTCOME_LABELS,
  PRIORITY_LABELS,
  RETRY_ON_LABELS,
  SCENARIO_LABELS,
} from '../labels';
import { formatInZone } from '../time';
import { durationText, voiceIvrKeys } from '../voice';

import { isTeam, type StepIndex, type WizardDraft } from './draft';

const days = (d: number[]) =>
  d.length === 7 ? 'every day' : d.map((x) => DAY_SHORT[x]).join(', ');

function Section({
  title,
  step,
  onEdit,
  children,
}: {
  title: string;
  step: StepIndex;
  onEdit: ((step: StepIndex) => void) | undefined;
  children: ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="subtitle2">{title}</Typography>
        {onEdit && (
          <Button size="small" onClick={() => onEdit(step)} aria-label={`Edit ${title}`}>
            Edit
          </Button>
        )}
      </Stack>
      <Box sx={{ typography: 'body2', color: 'text.secondary' }}>{children}</Box>
    </Paper>
  );
}

export interface ReviewStepProps {
  draft: WizardDraft;
  /** Absent: a read-only summary (campaign detail → Settings). */
  onEdit?: (step: StepIndex) => void;
  /** Absent: no estimate panel. */
  estimate?: {
    data?: (CampaignEstimate & { walletAvailableMicros?: number }) | undefined;
    isPending: boolean;
    error: unknown;
  };
}

/** Every setting with "Edit", the cost estimate next to the wallet, compliance notes. */
export function ReviewStep({ draft, onEdit, estimate }: ReviewStepProps) {
  const flows = useFlows({ status: 'published', limit: 100 });
  const lists = useListOptions();
  const segments = useSegments();
  const numbers = useChannels(draft.line === 'whatsapp');
  const number = numbers.data?.items.find((n) => n.id === draft.channelId);
  const flow = flows.data?.data.find((f) => f.id === draft.flowId);
  const voice = draft.line === 'voice_api';
  const audioList = useFlowAudio();
  const ivrs = useQuery({
    queryKey: voiceIvrKeys.list,
    queryFn: () => campaignsApi.voiceIvrs(),
    enabled: voice && draft.voice.kind === 'ivr',
  });
  const voiceName =
    draft.voice.kind === 'audio'
      ? (audioList.data?.find((a) => a.id === draft.voice.flowAudioId)?.name ?? 'Audio')
      : (ivrs.data?.find((i) => i.id === draft.voice.ivrId)?.name ?? 'IVR menu');
  const e = estimate?.data;
  const team = isTeam(draft);
  const wallet = e?.walletAvailableMicros;
  const short = e !== undefined && wallet !== undefined && e.maxMicros > wallet;
  const mode = scheduleMode(draft.schedule);
  const audience =
    draft.audienceMode === 'lists'
      ? `Lists: ${
          (lists.data ?? [])
            .filter((l) => draft.listIds.includes(l.id))
            .map((l) => l.name)
            .join(', ') || draft.listIds.length
        }`
      : draft.audienceMode === 'segment'
        ? `Segment: ${segments.data?.find((s) => s.id === draft.segmentId)?.name ?? '—'}`
        : draft.audienceMode === 'filter'
          ? 'Custom filter'
          : `${String(draft.contactIds.length)} picked contacts`;
  return (
    <Stack spacing={2}>
      {voice && (
        <Section title="Basics" step={0} onEdit={onEdit}>
          {draft.name} · Recorded voice · {draft.voice.kind === 'audio' ? 'Audio' : 'IVR'}:{' '}
          {voiceName}
        </Section>
      )}
      {!voice && (
        <Section title="Basics" step={0} onEdit={onEdit}>
          {draft.name} · {draft.mode === 'dry_run' ? 'Dry run' : 'Live'} ·{' '}
          {team
            ? `Your team talks (${
                draft.team.agentUserIds === null
                  ? 'everyone who may call'
                  : `${String(draft.team.agentUserIds.length)} members`
              }, ${String(draft.team.wrapUpSec)} s wrap-up)`
            : draft.program?.kind === 'agent'
              ? 'AI agent'
              : (flow?.name ?? 'Flow')}{' '}
          {team || draft.program?.kind === 'agent'
            ? ''
            : draft.chosenVersion
              ? `v${String(draft.chosenVersion)}`
              : `latest (v${String(flow?.publishedVersion ?? '?')})`}
        </Section>
      )}
      {draft.line === 'whatsapp' && (
        <Alert severity="info">
          WhatsApp call ·{' '}
          {number?.displayPhoneNumber ?? number?.label ?? 'Selected WhatsApp number'} · Calls
          require permission from this number.
        </Alert>
      )}
      <Section title="Audience" step={1} onEdit={onEdit}>
        {audience}
        {draft.excludeActiveCampaigns ? ' · skips contacts in other active campaigns' : ''}
        {draft.skipIfMissing.length
          ? ` · skips contacts without ${draft.skipIfMissing.join(', ')}`
          : ''}
      </Section>
      <Section title="Schedule & window" step={2} onEdit={onEdit}>
        {mode === 'now' && 'Starts right away'}
        {mode === 'later' &&
          draft.schedule.startAt &&
          `Starts ${formatInZone(draft.schedule.startAt, draft.timezone)}`}
        {mode === 'recurring' &&
          draft.schedule.recurrence &&
          `Repeats ${draft.schedule.recurrence.freq === 'daily' ? 'daily' : `on ${days(draft.schedule.recurrence.days)}`} at ${draft.schedule.recurrence.time}`}
        {draft.schedule.endAt
          ? ` · ends ${formatInZone(draft.schedule.endAt, draft.timezone)}`
          : ''}
        <br />
        Calls {draft.window.start}–{draft.window.end}, {days(draft.window.days)} ({draft.timezone})
      </Section>
      {voice && (
        <Section title="Retries & pacing" step={3} onEdit={onEdit}>
          {draft.voice.retries === 0
            ? 'No redial'
            : `Up to ${String(draft.voice.retries)} redials, ${String(draft.voice.retryIntervalMin)} min apart`}{' '}
          · sent in batches by the provider
        </Section>
      )}
      {!voice && (
        <Section title="Retries & pacing" step={3} onEdit={onEdit}>
          Up to {draft.retry.maxAttempts} attempts, {draft.retry.intervalMinutes} min apart, on{' '}
          {draft.retry.retryOn.map((r) => RETRY_ON_LABELS[r].toLowerCase()).join(', ') || 'nothing'}
          {draft.followUps.callbacks
            ? ` · callbacks within ${String(draft.followUps.callbackMaxDays)} days`
            : ''}
          {draft.followUps.promiseCheck.enabled
            ? ` · follow-up ${String(draft.followUps.promiseCheck.daysAfter)} days after a promise`
            : ''}
          <br />
          {draft.pacing.concurrency} at once, {draft.pacing.dialsPerMinute} dials / min,{' '}
          {PRIORITY_LABELS[draft.pacing.priority].toLowerCase()} priority
          {draft.mode === 'dry_run' && (
            <>
              <br />
              Dry run ×{draft.dryRun.speed}:{' '}
              {(Object.keys(OUTCOME_LABELS) as DryRunOutcome[])
                .map((k) => `${OUTCOME_LABELS[k]} ${String(draft.dryRun.mix[k] / 100)}%`)
                .join(', ')}
              <br />
              Customers:{' '}
              {(Object.keys(SCENARIO_LABELS) as ScenarioKey[])
                .filter((k) => draft.dryRun.scenarios[k] > 0)
                .map((k) => `${SCENARIO_LABELS[k]} ${String(draft.dryRun.scenarios[k])}%`)
                .join(', ')}
            </>
          )}
        </Section>
      )}

      {estimate && voice && (
        <Paper variant="outlined" sx={{ p: 2 }} aria-label="Estimate">
          <Typography variant="subtitle2" gutterBottom>
            Estimated cost
          </Typography>
          {estimate.isPending && <CircularProgress size={20} />}
          {Boolean(estimate.error) && (
            <Alert severity="error">{getErrorMessage(estimate.error)}</Alert>
          )}
          {e && (
            <Stack spacing={1}>
              <Typography variant="h6">{formatCurrencyMicros(e.totalMicros)}</Typography>
              <Typography variant="body2" color="text.secondary">
                {e.contacts} numbers × {formatCurrencyMicros(e.perCallMicros)} (
                {e.voice?.pulsesPerNumber ?? 1} × 15 s) · dialing takes{' '}
                {durationText(e.voice?.etaSec ?? 0)}
              </Typography>
              {(e.voice?.notIndianMobile ?? 0) > 0 && (
                <Typography variant="body2" color="text.secondary">
                  {e.voice?.notIndianMobile} contacts are skipped: not an Indian mobile.
                </Typography>
              )}
              {wallet !== undefined && (
                <Typography variant="body2">
                  Wallet available: {formatCurrencyMicros(wallet)}
                </Typography>
              )}
              {e.voice?.notPriced && (
                <Alert severity="warning">
                  Recorded voice has no price on this account yet — ask support before starting.
                </Alert>
              )}
              {wallet !== undefined && e.totalMicros > wallet && (
                <Alert severity="warning">
                  The estimate is higher than the wallet — the campaign pauses when money runs out.
                </Alert>
              )}
              <Typography variant="caption" color="text.secondary">
                Charged when each batch is sent, answered or not. Stop holds back numbers not yet
                sent; numbers already sent keep ringing.
              </Typography>
            </Stack>
          )}
        </Paper>
      )}

      {estimate && !voice && (
        <Paper variant="outlined" sx={{ p: 2 }} aria-label="Estimate">
          <Typography variant="subtitle2" gutterBottom>
            {draft.mode === 'dry_run' ? 'What it would cost' : 'Estimated cost'}
          </Typography>
          {estimate.isPending && <CircularProgress size={20} />}
          {Boolean(estimate.error) && (
            <Alert severity="error">{getErrorMessage(estimate.error)}</Alert>
          )}
          {e && (
            <Stack spacing={1}>
              <Typography variant="h6">
                {formatCurrencyMicros(e.minMicros)} – {formatCurrencyMicros(e.maxMicros)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {e.contacts} contacts × about {e.assumptions.expectedAttempts} attempts, about{' '}
                {e.assumptions.avgDurationSec} s per answered call,{' '}
                {formatCurrencyMicros(e.perCallMicros)} per call.
              </Typography>
              {team && (
                <Typography variant="body2" color="text.secondary">
                  No AI minutes — your team talks, only the line is charged.
                </Typography>
              )}
              {wallet !== undefined && (
                <Typography variant="body2">
                  Wallet available: {formatCurrencyMicros(wallet)}
                </Typography>
              )}
              {short && (
                <Alert severity="warning">
                  The estimate is higher than the wallet — the campaign will pause when money runs
                  out
                  {draft.mode === 'dry_run'
                    ? ' (a dry run pauses the same way, without charging)'
                    : ''}
                  .
                </Alert>
              )}
              {draft.mode === 'dry_run' && (
                <Typography variant="caption" color="text.secondary">
                  A dry run is never charged — this is what real calls would cost.
                </Typography>
              )}
            </Stack>
          )}
        </Paper>
      )}
      <Divider />
      <Alert severity="info">
        {voice
          ? 'Do-not-call numbers, opted-out contacts and numbers that are not Indian mobiles are skipped. Calls go out only inside the calling window (09:00–21:00 at most).'
          : team
            ? 'Do-not-call numbers and opted-out contacts are always skipped; each contact is called at most as often as the account’s call limits allow. Team members join the calling session on the campaign page after you start it.'
            : 'Do-not-call numbers and opted-out contacts are always skipped; each contact is called at most as often as the account’s call limits allow. The flow opens with the AI disclosure line.'}
      </Alert>
    </Stack>
  );
}
