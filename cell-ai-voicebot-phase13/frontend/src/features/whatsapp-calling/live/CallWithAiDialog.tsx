import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import { getErrorMessage } from '@/services/api/errors';
import type { WhatsAppCallProgram } from '@/services/api/types';
import { formatCurrencyMicros } from '@/utils/format';

import { ProgramPicker } from '../ProgramPicker';
import { useCallPrice } from '../queries';

/** "Call with AI": the program (published flow / active AI agent) and the cost per minute. */
export function CallWithAiDialog({
  mode = 'ai',
  phoneE164,
  channelId,
  contactId,
  contactLabel,
  onCall,
  onClose,
}: {
  mode?: 'ai' | 'human';
  phoneE164: string;
  channelId: string;
  contactId: string;
  contactLabel: string;
  onCall: (program?: WhatsAppCallProgram) => void;
  onClose: () => void;
}) {
  const [program, setProgram] = useState<WhatsAppCallProgram | null>(null);
  const quote = useCallPrice(channelId, contactId);
  const cost = quote.data
    ? { call: quote.data.callPerMinuteMicros, ai: quote.data.aiPerMinuteMicros }
    : null;
  const human = mode === 'human';
  const title = human ? 'Call yourself' : 'Call with AI';
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {human
              ? 'Talk using this browser’s microphone and speaker. Allow microphone access before the customer is called.'
              : 'The AI program talks to the customer on WhatsApp. You can take the call over from the call bar.'}
          </Typography>
          <Typography>
            {contactLabel} · {phoneE164}
          </Typography>
          {quote.data && (
            <Typography>
              WhatsApp from {quote.data.senderLabel} · {quote.data.senderPhone}
            </Typography>
          )}
          {quote.isFetching && <LinearProgress aria-label="Loading call price" />}
          {quote.error && (
            <Alert
              severity="error"
              action={<Button onClick={() => void quote.refetch()}>Retry</Button>}
            >
              {getErrorMessage(quote.error)}
            </Alert>
          )}
          {!human && <ProgramPicker value={program} onChange={setProgram} />}
          {cost && (
            <Typography variant="body2" aria-label="Estimated cost">
              {human
                ? `About ${formatCurrencyMicros(cost.call)} a minute, charged in 6-second steps.`
                : `About ${formatCurrencyMicros(cost.call + cost.ai)} a minute (call ${formatCurrencyMicros(cost.call)} + AI ${formatCurrencyMicros(cost.ai)}), charged in 6-second steps.`}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={
            (!human && !program?.id) || !quote.data || quote.isFetching || Boolean(quote.error)
          }
          onClick={() => {
            if (human) onCall();
            else if (program?.id) onCall(program);
          }}
        >
          {title}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
