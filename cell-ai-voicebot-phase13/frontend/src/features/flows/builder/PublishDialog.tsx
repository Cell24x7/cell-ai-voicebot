import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';

import type { FlowIssue } from '@/services/api/types';

/** Publish with notes; blocked while the draft has errors. */
export function PublishDialog({
  issues,
  busy,
  onClose,
  onPublish,
}: {
  issues: FlowIssue[];
  busy: boolean;
  onClose: () => void;
  onPublish: (notes: string) => void;
}) {
  const [notes, setNotes] = useState('');
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="publish-title">
      <DialogTitle id="publish-title">Publish this flow</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {errors > 0 ? (
            <Alert severity="error">
              Fix {errors} problem{errors === 1 ? '' : 's'} before publishing (see the problems
              list).
            </Alert>
          ) : (
            <Alert severity="info">
              A new version is created; campaigns started later use it. Older versions stay
              unchanged.
              {warnings
                ? ` ${String(warnings)} warning${warnings === 1 ? '' : 's'} — publishing is still allowed.`
                : ''}
            </Alert>
          )}
          <TextField
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            minRows={2}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={errors > 0 || busy}
          onClick={() => onPublish(notes.trim())}
        >
          Publish
        </Button>
      </DialogActions>
    </Dialog>
  );
}
