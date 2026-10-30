import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import { useRates } from '@/features/wallet/queries';
import type { WhatsAppCallProgram } from '@/services/api/types';
import { formatCurrencyMicros } from '@/utils/format';

import { ProgramPicker } from '../ProgramPicker';

import { aiCallMinuteMicros } from './cost';

/** "Call with AI": the program (published flow / active AI agent) and the cost per minute. */
export function CallWithAiDialog({
  phoneE164,
  onCall,
  onClose,
}: {
  phoneE164: string;
  onCall: (program: WhatsAppCallProgram) => void;
  onClose: () => void;
}) {
  const [program, setProgram] = useState<WhatsAppCallProgram | null>(null);
  const rates = useRates();
  const cost = aiCallMinuteMicros(rates.data, phoneE164);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Call with AI</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            The AI program talks to the customer on WhatsApp. You can take the call over from the
            call bar.
          </Typography>
          <ProgramPicker value={program} onChange={setProgram} />
          {cost && (
            <Typography variant="body2" aria-label="Estimated cost">
              About {formatCurrencyMicros(cost.call + cost.ai)} a minute (call{' '}
              {formatCurrencyMicros(cost.call)} + AI {formatCurrencyMicros(cost.ai)}), charged in
              6-second steps.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!program?.id}
          onClick={() => {
            if (program?.id) onCall(program);
          }}
        >
          Call with AI
        </Button>
      </DialogActions>
    </Dialog>
  );
}
