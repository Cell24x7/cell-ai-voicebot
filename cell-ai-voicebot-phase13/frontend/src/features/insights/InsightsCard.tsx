import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type ReactNode } from 'react';

import { useConfirm } from '@/components/confirm-context';
import { getErrorMessage } from '@/services/api/errors';
import type { CallInsightVersion } from '@/services/api/types';
import { formatInAccountTz } from '@/utils/datetime';
import { formatCurrencyMicros } from '@/utils/format';

import {
  LOW_CONFIDENCE,
  reasonText,
  SENTIMENT_LABELS,
  sentimentColor,
  SOURCE_TEXT,
  STATUS_TEXT,
} from './labels';
import {
  outcomeLabel,
  useCallInsights,
  useCallInsightsLive,
  useDispositions,
  useInsightPermissions,
  useRegenerateInsights,
  useSetDisposition,
} from './queries';

function Fact({
  label,
  children,
  unsure,
}: {
  label: string;
  children: ReactNode;
  unsure?: boolean;
}) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="body2" component="div" sx={{ textAlign: 'right' }}>
          {children}
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          label={unsure ? 'AI — unsure' : 'AI'}
          color={unsure ? 'warning' : 'default'}
        />
      </Stack>
    </Stack>
  );
}

function Output({ version, timezone }: { version: CallInsightVersion; timezone: string }) {
  const o = version.output;
  if (!o) return null;
  const k = o.keyInfo;
  const promiseUnsure = o.confidence.promise < LOW_CONFIDENCE;
  return (
    <Stack spacing={1}>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
        {o.summary}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
        <Chip
          size="small"
          color={sentimentColor(o.sentiment.label)}
          label={`Customer: ${SENTIMENT_LABELS[o.sentiment.label]}`}
        />
        {k.wrongNumber && <Chip size="small" color="warning" label="Wrong number" />}
      </Stack>
      {k.promiseDate && (
        <Fact label="Promise to pay" unsure={promiseUnsure}>
          {k.promiseDate}
          {k.promiseAmountMicros !== null
            ? ` · ${formatCurrencyMicros(k.promiseAmountMicros)}`
            : ''}
        </Fact>
      )}
      {k.callbackAt && <Fact label="Call back">{formatInAccountTz(k.callbackAt, timezone)}</Fact>}
      {k.disputeReason && <Fact label="Dispute">{k.disputeReason}</Fact>}
      {k.languagePreference && <Fact label="Language">{k.languagePreference}</Fact>}
      {k.notes && <Fact label="Notes">{k.notes}</Fact>}
    </Stack>
  );
}

/**
 * Call page "AI insights" (Phase 14): summary, outcome (editable), sentiment and key
 * facts marked as AI, the reason when there are none, regenerate, earlier versions.
 */
export function InsightsCard({
  callId,
  answered,
  live = false,
  timezone,
}: {
  callId: string;
  answered: boolean;
  /** The page already listens on the call's topic while the call runs. */
  live?: boolean;
  timezone: string;
}) {
  const insights = useCallInsights(callId);
  useCallInsightsLive(callId, !live);
  const { canRegenerate, canSetOutcome } = useInsightPermissions();
  const dispositions = useDispositions();
  const regenerate = useRegenerateInsights(callId);
  const setOutcome = useSetDisposition(callId);
  const confirm = useConfirm();
  const [showHistory, setShowHistory] = useState(false);

  const header = (extra?: ReactNode) => (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
      <AutoAwesomeOutlined fontSize="small" color="primary" />
      <Typography variant="subtitle1" component="h2" sx={{ flex: 1 }}>
        AI insights
      </Typography>
      {extra}
    </Stack>
  );

  if (insights.isPending)
    return (
      <Paper variant="outlined" sx={{ p: 2 }} component="section" aria-label="AI insights">
        {header()}
        <Skeleton variant="rounded" height={96} />
      </Paper>
    );
  if (insights.isError)
    return (
      <Paper variant="outlined" sx={{ p: 2 }} component="section" aria-label="AI insights">
        {header()}
        <Alert
          severity="error"
          action={<Button onClick={() => void insights.refetch()}>Retry</Button>}
        >
          {getErrorMessage(insights.error)}
        </Alert>
      </Paper>
    );

  const view = insights.data;
  const latest = view.latest;
  const active = (dispositions.data ?? []).filter((d) => d.active);
  const current = outcomeLabel(view.disposition, dispositions.data);

  const onRegenerate = async () => {
    const ok = await confirm({
      title: 'Make the insights again?',
      message: 'The AI reads the transcript again. This uses AI credit from the wallet.',
      confirmText: 'Make again',
    });
    if (ok) regenerate.mutate();
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }} component="section" aria-label="AI insights">
      {header(
        <>
          {view.status && (
            <Chip
              size="small"
              variant="outlined"
              label={STATUS_TEXT[view.status]}
              color={view.status === 'failed' ? 'error' : 'default'}
            />
          )}
          {canRegenerate && view.canRegenerate && (
            <Button
              size="small"
              onClick={() => void onRegenerate()}
              disabled={regenerate.isPending}
            >
              Make again
            </Button>
          )}
        </>,
      )}
      <Stack spacing={1.5}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ alignItems: { sm: 'center' } }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ minWidth: 72 }}>
            Outcome
          </Typography>
          {canSetOutcome && answered ? (
            <TextField
              select
              size="small"
              label="Outcome"
              value={active.some((d) => d.key === view.disposition) ? (view.disposition ?? '') : ''}
              onChange={(e) => setOutcome.mutate(e.target.value)}
              disabled={setOutcome.isPending || dispositions.isPending}
              sx={{ minWidth: 220 }}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            >
              <MenuItem value="" disabled>
                {current ?? 'Choose an outcome'}
              </MenuItem>
              {active.map((d) => (
                <MenuItem key={d.key} value={d.key}>
                  {d.label}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <Typography variant="body2">{current ?? 'None'}</Typography>
          )}
          {view.dispositionSource && (
            <Typography variant="caption" color="text.secondary">
              {SOURCE_TEXT[view.dispositionSource]}
            </Typography>
          )}
        </Stack>

        {view.status === null && (
          <Typography variant="body2" color="text.secondary">
            {answered
              ? 'Insights appear about a minute after the call ends.'
              : 'No insights — the call was not answered.'}
          </Typography>
        )}
        {view.status === 'pending' && (
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              The AI is reading the call…
            </Typography>
            <LinearProgress aria-label="Making the insights" />
          </Stack>
        )}
        {(view.status === 'skipped' || view.status === 'failed') && (
          <Alert severity={view.status === 'failed' ? 'warning' : 'info'}>
            {reasonText(view.reason)}
          </Alert>
        )}
        {latest?.status === 'done' && <Output version={latest} timezone={timezone} />}
        {latest?.status === 'done' && (
          <Typography variant="caption" color="text.secondary">
            Version {latest.version} · {formatInAccountTz(latest.createdAt, timezone)} · cost{' '}
            {formatCurrencyMicros(latest.costMicros)}
            {latest.createdBy ? ` · asked by ${latest.createdBy.name}` : ''}
          </Typography>
        )}
        {view.history.length > 1 && (
          <>
            <Button
              size="small"
              sx={{ alignSelf: 'flex-start' }}
              onClick={() => setShowHistory((v) => !v)}
            >
              {showHistory
                ? 'Hide earlier versions'
                : `Earlier versions (${String(view.history.length - 1)})`}
            </Button>
            <Collapse in={showHistory} unmountOnExit>
              <Stack spacing={0.5}>
                {view.history
                  .filter((h) => h.version !== latest?.version)
                  .map((h) => (
                    <Typography key={h.version} variant="body2" color="text.secondary">
                      Version {h.version} · {STATUS_TEXT[h.status]} ·{' '}
                      {formatInAccountTz(h.createdAt, timezone)}
                      {h.output
                        ? ` — ${h.output.summary}`
                        : h.reason
                          ? ` — ${reasonText(h.reason)}`
                          : ''}
                    </Typography>
                  ))}
              </Stack>
            </Collapse>
          </>
        )}
      </Stack>
    </Paper>
  );
}
