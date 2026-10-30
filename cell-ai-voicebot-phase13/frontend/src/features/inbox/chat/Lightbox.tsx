import CloseOutlined from '@mui/icons-material/CloseOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';

/** Full-size photo (lazy chunk). The link is the short-lived signed one. */
export function Lightbox({
  url,
  caption,
  onClose,
}: {
  url: string;
  caption: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={onClose} maxWidth="lg" aria-labelledby="lightbox-title">
      <DialogTitle id="lightbox-title" sx={{ py: 1, pr: 7 }}>
        Photo
      </DialogTitle>
      <IconButton
        aria-label="Close photo"
        onClick={onClose}
        sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'background.paper' }}
      >
        <CloseOutlined />
      </IconButton>
      <Box
        component="img"
        src={url}
        alt={caption ?? 'Photo'}
        sx={{ display: 'block', maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
      />
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <Typography variant="body2" sx={{ px: 1, overflowWrap: 'anywhere' }}>
          {caption}
        </Typography>
        <Button href={url} download target="_blank" rel="noopener noreferrer">
          Download
        </Button>
      </DialogActions>
    </Dialog>
  );
}
