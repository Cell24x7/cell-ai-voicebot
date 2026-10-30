import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState, type DragEvent } from 'react';

import { contactImportsApi, type ImportKind } from '@/services/api/contact-imports';
import { getErrorMessage } from '@/services/api/errors';
import type { ImportJob } from '@/services/api/types';

import { checkFile } from './file-check';

/** Saves a Blob as a download (CSV template). */
const saveBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

export function UploadStep({
  kind,
  onUploaded,
}: {
  kind: ImportKind;
  onUploaded: (job: ImportJob) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const upload = useMutation({
    mutationFn: (file: File) => contactImportsApi.upload(file, kind, setProgress),
    meta: { silent: true },
    onSuccess: onUploaded,
  });
  const template = useMutation({
    mutationFn: () => contactImportsApi.template(),
    meta: { silent: true },
    onSuccess: (blob) => saveBlob(blob, 'contacts-template.csv'),
  });

  const pick = (file: File | undefined) => {
    if (!file) return;
    const error = checkFile(file);
    setProblem(error);
    if (!error) {
      setProgress(0);
      upload.mutate(file);
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files[0]);
  };

  return (
    <Stack spacing={2}>
      {(problem ?? upload.error) && (
        <Alert severity="error">{problem ?? getErrorMessage(upload.error)}</Alert>
      )}
      <Paper
        variant="outlined"
        role="button"
        tabIndex={0}
        aria-label="Choose a file to upload"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        sx={{
          p: 5,
          textAlign: 'center',
          cursor: 'pointer',
          borderStyle: 'dashed',
          borderColor: dragging ? 'primary.main' : 'divider',
          bgcolor: dragging ? 'action.hover' : 'transparent',
        }}
      >
        <UploadFileOutlined color="primary" sx={{ fontSize: 40 }} />
        <Typography variant="subtitle1">
          Drop a .csv or .xlsx file here, or click to choose
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Up to 10 MB and 50,000 rows. The first row must have the column names.
        </Typography>
        <input
          ref={input}
          type="file"
          hidden
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          data-testid="file-input"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </Paper>
      {upload.isPending && (
        <Box>
          <Typography variant="body2">Uploading… {progress}%</Typography>
          <LinearProgress variant="determinate" value={progress} />
        </Box>
      )}
      <Typography variant="body2" color="text.secondary">
        {kind === 'dnd'
          ? 'One column with phone numbers is enough; a "Reason" column is optional.'
          : 'Excel tip: format the phone column as Text, otherwise long numbers turn into 9.87654E+09.'}{' '}
        {kind === 'contacts' && (
          <Link component="button" type="button" onClick={() => template.mutate()}>
            Download a sample sheet
          </Link>
        )}
      </Typography>
      {template.error && <Alert severity="error">{getErrorMessage(template.error)}</Alert>}
      <Box>
        <Button
          disabled={upload.isPending}
          onClick={() => input.current?.click()}
          variant="contained"
        >
          Choose file
        </Button>
      </Box>
    </Stack>
  );
}
