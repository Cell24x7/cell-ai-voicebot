import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import type { ImportJob } from '@/services/api/types';
import { formatNumber } from '@/utils/format';

/** Checking / importing in the background — live progress. */
export function ProgressStep({ job, onCancel }: { job: ImportJob; onCancel?: () => void }) {
  const { processed, total } = job.progress;
  const percent = total ? Math.round((processed / total) * 100) : 0;
  const importing = job.status === 'importing';
  return (
    <Stack spacing={2} sx={{ maxWidth: 560 }}>
      <Typography variant="subtitle1">
        {importing ? 'Importing…' : 'Checking the file…'} {formatNumber(processed)} of{' '}
        {formatNumber(total)} rows
      </Typography>
      <Box>
        <LinearProgress variant="determinate" value={percent} aria-label="Progress" />
      </Box>
      <Typography variant="body2" color="text.secondary">
        You can leave this page — it keeps running and you can come back from Imports & exports.
      </Typography>
      {importing && onCancel && (
        <Box>
          <Button color="error" onClick={onCancel}>
            Stop import
          </Button>
        </Box>
      )}
    </Stack>
  );
}
