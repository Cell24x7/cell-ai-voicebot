import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { useSession } from '@/features/auth/hooks';
import { useExportJob } from '@/features/contact-exports/useExportJob';
import { getErrorMessage } from '@/services/api/errors';
import { recordExportsApi, type ExportFormat } from '@/services/api/record-exports';
import type { RecordExport } from '@/services/api/types';

export interface ExportOption {
  key: string;
  label: string;
  /** Shown under the switch (e.g. why it is off). */
  help?: string;
  /** Without the permission the switch stays off. */
  disabled?: boolean;
}

/**
 * Phase 14 record export: choose CSV / XLSX (+ options) → live progress → download link.
 * Hidden while impersonating (the server refuses too).
 */
export function RecordExportButton({
  title,
  options = [],
  note,
  start,
  label = 'Export',
}: {
  title: string;
  options?: ExportOption[];
  note?: ReactNode;
  start: (format: ExportFormat, chosen: Record<string, boolean>) => Promise<RecordExport>;
  label?: string;
}) {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [jobId, setJobId] = useState<string | undefined>();
  const begin = useMutation({
    mutationFn: () =>
      start(
        format,
        Object.fromEntries(options.map((o) => [o.key, !o.disabled && Boolean(chosen[o.key])])),
      ),
    meta: { silent: true },
    onSuccess: (job) => setJobId(job.id),
  });
  const job = useExportJob(jobId, recordExportsApi.get);
  if (session?.impersonation) return null;
  const j = job.data;
  const running = begin.isPending || (j && (j.status === 'pending' || j.status === 'processing'));
  const pct =
    j && j.progress.total ? Math.round((j.progress.processed / j.progress.total) * 100) : 0;
  const close = () => {
    setOpen(false);
    setJobId(undefined);
    begin.reset();
  };

  return (
    <>
      <Button startIcon={<FileDownloadOutlined />} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          {!jobId && (
            <Stack spacing={1.5} sx={{ pt: 1 }}>
              <TextField
                select
                size="small"
                label="File type"
                value={format}
                onChange={(e) => setFormat(e.target.value as ExportFormat)}
                disabled={begin.isPending}
              >
                <MenuItem value="csv">CSV</MenuItem>
                <MenuItem value="xlsx">Excel (XLSX)</MenuItem>
              </TextField>
              {options.map((o) => (
                <div key={o.key}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={!o.disabled && Boolean(chosen[o.key])}
                        disabled={o.disabled || begin.isPending}
                        onChange={(e) => setChosen({ ...chosen, [o.key]: e.target.checked })}
                      />
                    }
                    label={o.label}
                  />
                  {o.help && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {o.help}
                    </Typography>
                  )}
                </div>
              ))}
              {note && (
                <Typography variant="caption" color="text.secondary">
                  {note}
                </Typography>
              )}
            </Stack>
          )}
          {begin.error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {getErrorMessage(begin.error)}
            </Alert>
          )}
          {running && (
            <Stack spacing={1} sx={{ mt: 2 }}>
              <Typography variant="body2">
                Preparing the file…{' '}
                {j ? `${String(j.progress.processed)} / ${String(j.progress.total)}` : ''}
              </Typography>
              <LinearProgress variant={j ? 'determinate' : 'indeterminate'} value={pct} />
            </Stack>
          )}
          {j?.status === 'ready' && j.downloadUrl && (
            <Stack spacing={1}>
              <Link href={j.downloadUrl} download>
                Download ({String(j.rowCount)} {j.rowCount === 1 ? 'row' : 'rows'})
              </Link>
              <Typography variant="caption" color="text.secondary">
                The file is kept for 24 hours.
              </Typography>
            </Stack>
          )}
          {j?.status === 'failed' && (
            <Alert severity="error">
              {j.errorMessage ?? 'The export failed — please try again.'}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Close</Button>
          {!jobId && (
            <Button variant="contained" onClick={() => begin.mutate()} disabled={begin.isPending}>
              Start export
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
