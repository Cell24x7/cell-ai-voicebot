import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { Link as RouterLink } from 'react-router';

import type { ImportJob } from '@/services/api/types';

import { ResultCards } from './ResultCards';
import { ErrorReportButton } from './ReviewStep';

/** Finished (completed / failed / canceled). */
export function SummaryStep({ job, onAnother }: { job: ImportJob; onAnother: () => void }) {
  return (
    <Stack spacing={2}>
      {job.status === 'completed' && (
        <Alert severity="success">
          {job.kind === 'dnd' ? 'Numbers added to the do-not-call list.' : 'Import finished.'}
        </Alert>
      )}
      {job.status === 'failed' && (
        <Alert severity="error">{job.errorMessage ?? 'The import failed.'}</Alert>
      )}
      {job.status === 'canceled' && (
        <Alert severity="info">Canceled. Rows imported before stopping are kept.</Alert>
      )}
      {job.totals.rows > 0 && <ResultCards job={job} done />}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ justifyContent: 'flex-end' }}
      >
        {job.hasErrorReport && <ErrorReportButton jobId={job.id} />}
        <Button onClick={onAnother}>Import another file</Button>
        {job.kind === 'dnd' ? (
          <Button component={RouterLink} to="/contacts/dnd" variant="contained">
            View do-not-call list
          </Button>
        ) : (
          <Button
            component={RouterLink}
            to={job.listId ? `/contacts/all?listId=${job.listId}` : '/contacts/all'}
            variant="contained"
          >
            View contacts
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
