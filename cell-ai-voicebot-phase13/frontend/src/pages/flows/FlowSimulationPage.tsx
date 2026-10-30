import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import { Link as RouterLink, useParams } from 'react-router';

import { PageHeader } from '@/components/PageHeader';
import { RelativeTime } from '@/components/RelativeTime';
import { useFlow, useSimulation } from '@/features/flows/queries';
import {
  aiFallbacks,
  END_REASON_LABELS,
  STATUS_LABELS,
  versionLabel,
} from '@/features/flows/simulator/labels';
import { RunDetails } from '@/features/flows/simulator/RunDetails';
import { Transcript } from '@/features/flows/simulator/Transcript';
import { getErrorMessage } from '@/services/api/errors';
import { formatCurrencyMicros } from '@/utils/format';

/** `/flows/:id/simulations/:runId` — one test call: transcript, values, outcome, trace. */
export function FlowSimulationPage() {
  const { id = '', runId = '' } = useParams();
  const flow = useFlow(id);
  const run = useSimulation(id, runId);

  const back = (
    <Button component={RouterLink} to={`/flows/${id}`} startIcon={<ArrowBackOutlined />}>
      Back to the builder
    </Button>
  );
  if (run.isError) {
    return (
      <>
        <PageHeader title="Test call" actions={back} />
        <Alert severity="error" action={<Button onClick={() => void run.refetch()}>Retry</Button>}>
          {getErrorMessage(run.error)}
        </Alert>
      </>
    );
  }
  if (!run.data)
    return <Skeleton variant="rounded" height={420} aria-label="Loading the test call" />;
  const r = run.data;
  const transcript = r.transcript ?? [];
  const fallbacks = aiFallbacks(transcript);
  return (
    <>
      <PageHeader
        title={`${flow.data?.name ?? 'Flow'} — test call`}
        subtitle={
          <>
            {r.contactName ?? 'Typed values'} · {r.createdBy?.name ?? '—'} ·{' '}
            <RelativeTime value={r.createdAt} />
          </>
        }
        actions={back}
      />
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Chip label={versionLabel(r.versionRef)} />
        <Chip
          label={STATUS_LABELS[r.status]}
          color={r.status === 'ended' ? 'default' : 'success'}
        />
        {r.endReason && <Chip variant="outlined" label={END_REASON_LABELS[r.endReason]} />}
        <Chip variant="outlined" label={`Cost ${formatCurrencyMicros(r.costMicros)}`} />
      </Stack>
      {fallbacks.walletEmpty && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          The wallet was empty, so the AI agent couldn’t reply.
        </Alert>
      )}
      {fallbacks.capReached && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          An AI agent reached its spending limit during this call.
        </Alert>
      )}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ display: 'flex', maxHeight: 640 }}>
            <Transcript entries={transcript} />
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <RunDetails run={r} />
        </Grid>
      </Grid>
    </>
  );
}
