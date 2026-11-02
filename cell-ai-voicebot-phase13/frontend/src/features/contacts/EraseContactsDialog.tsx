import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useMutation, useQuery } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useEffect, useState } from 'react';

import { contactsApi } from '@/services/api/contacts';
import { getErrorMessage } from '@/services/api/errors';

const WORD = 'ERASE';

/** Erases contacts for good after the word is typed. One contact at once; several as a job. */
export function EraseContactsDialog({
  ids,
  label,
  onClose,
  onDone,
}: {
  ids: string[];
  /** A contact's name, or "12 contacts". */
  label: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const finish = (message: string) => {
    enqueueSnackbar(message, { variant: 'success' });
    onDone();
    onClose();
  };
  const erase = useMutation({
    mutationFn: async () => {
      if (ids.length === 1) {
        await contactsApi.erase(ids[0] ?? '');
        return null;
      }
      return contactsApi.bulkErase(ids);
    },
    meta: { silent: true },
    onSuccess: (job) => {
      if (job) setJobId(job.id);
      else finish(`${label} erased`);
    },
  });
  const job = useQuery({
    queryKey: ['contact-erase-job', jobId],
    queryFn: () => contactsApi.eraseJob(jobId ?? ''),
    enabled: jobId !== null,
    meta: { silent: true },
    refetchInterval: (query) => (query.state.data?.status === 'done' ? false : 2_000),
  });
  const finished = job.data?.status === 'done';
  useEffect(() => {
    if (finished) finish(`${label} erased`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the job ends
  }, [finished]);

  const working = jobId !== null;
  const total = job.data?.total ?? ids.length;
  const done = job.data?.done ?? 0;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="erase-title">
      <DialogTitle id="erase-title">Erase {label} permanently?</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          This removes chats, recordings, transcripts and call details, and can&apos;t be undone.
          Call counts and charges stay. Their number can&apos;t come back through an import or the
          API. Exports and imports that include them are deleted too.
        </DialogContentText>
        <Stack spacing={2}>
          {erase.error && <Alert severity="error">{getErrorMessage(erase.error)}</Alert>}
          {working ? (
            <>
              <LinearProgress
                variant="determinate"
                value={total ? (done / total) * 100 : 0}
                aria-label="Erase progress"
              />
              <DialogContentText>
                {done} of {total} erased. Contacts on a live call are erased when the call ends.
              </DialogContentText>
            </>
          ) : (
            <TextField
              label={`Type ${WORD} to confirm`}
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{working ? 'Close' : 'Cancel'}</Button>
        {!working && (
          <Button
            variant="contained"
            color="error"
            disabled={typed !== WORD || erase.isPending}
            onClick={() => erase.mutate()}
          >
            Erase permanently
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
