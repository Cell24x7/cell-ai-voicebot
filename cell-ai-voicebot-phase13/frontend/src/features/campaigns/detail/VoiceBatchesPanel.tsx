import { Alert, Chip, Paper, Stack, Typography } from '@mui/material';

import { DataTable, type Column } from '@/components/DataTable';
import type { Campaign } from '@/services/api/types';
import { formatCurrencyMicros } from '@/utils/format';

import { formatInZone } from '../time';

type Batch = NonNullable<Campaign['voiceApi']>['batches'][number];

const STATE_LABELS: Record<Batch['state'], string> = {
  holding: 'Preparing',
  submitting: 'Sending',
  open: 'Dialing',
  done: 'Done',
  uncertain: 'Checking with support',
  failed: 'Not sent',
};

const stateColor = (s: Batch['state']): 'default' | 'info' | 'success' | 'warning' | 'error' =>
  s === 'done'
    ? 'success'
    : s === 'open'
      ? 'info'
      : s === 'uncertain'
        ? 'warning'
        : s === 'failed'
          ? 'error'
          : 'default';

/** Recorded voice: what is played and each batch sent to the provider. */
export function VoiceBatchesPanel({
  campaign,
  timezone,
}: {
  campaign: Campaign;
  timezone: string;
}) {
  const v = campaign.voiceApi;
  if (!v) return null;
  const columns: Column<Batch>[] = [
    { key: 'no', header: 'Batch', render: (b) => `#${String(b.no)}` },
    {
      key: 'state',
      header: 'State',
      render: (b) => (
        <Chip size="small" color={stateColor(b.state)} label={STATE_LABELS[b.state]} />
      ),
    },
    { key: 'count', header: 'Numbers', align: 'right', render: (b) => String(b.count) },
    {
      key: 'amount',
      header: 'Charged',
      align: 'right',
      render: (b) => (b.state === 'failed' ? '—' : formatCurrencyMicros(b.amountMicros)),
    },
    {
      key: 'sent',
      header: 'Sent',
      render: (b) => (b.submittedAt ? formatInZone(b.submittedAt, timezone) : '—'),
    },
  ];
  return (
    <Paper variant="outlined" sx={{ p: 2 }} aria-label="Recorded voice">
      <Stack spacing={1.5}>
        <Typography variant="subtitle2">
          {v.content?.kind === 'ivr' ? 'IVR menu' : 'Recorded audio'}: {v.content?.name || '—'} ·{' '}
          {v.retries
            ? `${String(v.retries)} redials, ${String(v.retryIntervalMin)} min apart`
            : 'no redial'}
        </Typography>
        {v.batches.some((b) => b.state === 'uncertain') && (
          <Alert severity="warning">
            The provider did not answer when a batch was sent. Support checks whether it went out;
            it is never sent twice.
          </Alert>
        )}
        <DataTable
          aria-label="Batches"
          columns={columns}
          rows={v.batches}
          getRowId={(b) => String(b.no)}
          loading={false}
          error={null}
          emptyTitle="No batch sent yet"
          emptyDescription="Numbers go to the provider in batches once the campaign runs."
        />
        <Typography variant="caption" color="text.secondary">
          Each batch is charged when it is sent. Stop holds back numbers not yet sent; numbers
          already sent keep ringing.
        </Typography>
      </Stack>
    </Paper>
  );
}
