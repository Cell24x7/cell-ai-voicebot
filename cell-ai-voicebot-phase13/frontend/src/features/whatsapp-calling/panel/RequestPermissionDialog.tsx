import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { getErrorMessage, toApiError } from '@/services/api/errors';

import { CALL_ERROR_TEXT } from '../labels';
import { useCallingSettings, useRequestCallPermission } from '../queries';
import { CALLING_FORM_LIMITS } from '../settings/form';

const errorText = (err: unknown) => {
  const e = toApiError(err);
  return (
    (e.kind === 'http' && e.code ? CALL_ERROR_TEXT[e.code] : undefined) ?? getErrorMessage(err)
  );
};

/**
 * Ask a customer to allow WhatsApp calls: inside the 24-hour window an interactive
 * request (free); outside it the approved call permission template (a charged
 * template message). The text starts from the number's request text.
 */
export function RequestPermissionDialog({
  channelId,
  contactId,
  windowOpen,
  onClose,
}: {
  channelId: string;
  contactId: string;
  /** The chat's 24-hour window (decides interactive vs template). */
  windowOpen: boolean;
  onClose: () => void;
}) {
  const settings = useCallingSettings(channelId);
  const request = useRequestCallPermission();
  const fallback = settings.data?.permissionRequestBody ?? '';
  const [body, setBody] = useState<string | null>(null);
  const text = body ?? fallback;
  const tooLong = text.trim().length > CALLING_FORM_LIMITS.requestBodyMax;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Ask to allow calls</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {windowOpen ? (
            <TextField
              multiline
              minRows={3}
              label="Message"
              value={text}
              error={tooLong}
              helperText={`${String(text.trim().length)} / ${String(CALLING_FORM_LIMITS.requestBodyMax)}`}
              onChange={(e) => setBody(e.target.value)}
            />
          ) : (
            <Typography variant="body2">
              The 24-hour chat window is closed, so the approved call permission template is sent.
              It is charged like a utility template.
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary">
            The customer sees Allow / Don&apos;t allow buttons in WhatsApp. One request a day and
            two a week per customer.
          </Typography>
          {request.isError && <Alert severity="error">{errorText(request.error)}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={request.isPending || (windowOpen && (!text.trim() || tooLong))}
          onClick={() =>
            request.mutate(
              {
                channelId,
                contactId,
                ...(windowOpen && body !== null && body.trim() !== fallback
                  ? { body: body.trim() }
                  : {}),
              },
              {
                onSuccess: () => {
                  enqueueSnackbar('Call permission requested', { variant: 'success' });
                  onClose();
                },
              },
            )
          }
        >
          Send request
        </Button>
      </DialogActions>
    </Dialog>
  );
}
