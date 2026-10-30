import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';

/** Someone saved the draft since it was loaded: reload theirs or keep ours as a copy. */
export function ConflictDialog({
  by,
  busy,
  onReload,
  onSaveCopy,
  onClose,
}: {
  by: string | null;
  busy: boolean;
  onReload: () => void;
  onSaveCopy: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={onClose} aria-labelledby="conflict-title">
      <DialogTitle id="conflict-title">This flow was changed</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {by ? `${by} saved this flow` : 'Someone saved this flow'} after you opened it. Reload to
          see their version (your changes are lost), or save your changes as a new flow.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onSaveCopy} disabled={busy}>
          Save as a copy
        </Button>
        <Button variant="contained" onClick={onReload} disabled={busy}>
          Reload
        </Button>
      </DialogActions>
    </Dialog>
  );
}
