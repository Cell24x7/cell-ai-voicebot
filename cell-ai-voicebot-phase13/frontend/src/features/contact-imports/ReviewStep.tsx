import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useMutation } from '@tanstack/react-query';

import { contactImportsApi } from '@/services/api/contact-imports';
import { getErrorMessage } from '@/services/api/errors';
import type { ImportJob } from '@/services/api/types';
import { formatNumber } from '@/utils/format';

import { describeReason } from './import-text';
import { ResultCards } from './ResultCards';

/** Opens the signed error-report link (CSV download). */
export function ErrorReportButton({ jobId }: { jobId: string }) {
  const report = useMutation({
    mutationFn: () => contactImportsApi.errorReport(jobId),
    meta: { silent: true },
    onSuccess: ({ url }) => {
      window.open(url, '_blank', 'noopener');
    },
  });
  return (
    <>
      <Button onClick={() => report.mutate()} disabled={report.isPending}>
        Download error report
      </Button>
      {report.error && <Alert severity="error">{getErrorMessage(report.error)}</Alert>}
    </>
  );
}

/** Step "Check": what will happen + the problem rows. */
export function ReviewStep({
  job,
  busy,
  onBack,
  onStart,
}: {
  job: ImportJob;
  busy: boolean;
  onBack: () => void;
  onStart: () => void;
}) {
  const toImport = job.totals.created + job.totals.updated + job.totals.unchanged;
  return (
    <Stack spacing={2}>
      <ResultCards job={job} done={false} />
      {job.problemRows.length > 0 && (
        <>
          <Typography variant="subtitle2">
            Rows that will be skipped{job.problemRows.length >= 100 ? ' (first 100)' : ''}
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 320 }}>
            <Table size="small" stickyHeader aria-label="Problem rows">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, width: 80 }}>Row</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Problem</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {job.problemRows.map((p) => (
                  <TableRow key={p.row}>
                    <TableCell>{p.row}</TableCell>
                    <TableCell>{p.reasons.map(describeReason).join('; ')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ justifyContent: 'flex-end' }}
      >
        {job.hasErrorReport && <ErrorReportButton jobId={job.id} />}
        <Button onClick={onBack}>Back to mapping</Button>
        <Button variant="contained" disabled={busy || toImport === 0} onClick={onStart}>
          {job.kind === 'dnd'
            ? `Add ${formatNumber(toImport)} numbers`
            : `Import ${formatNumber(toImport)} contacts`}
        </Button>
      </Stack>
    </Stack>
  );
}
