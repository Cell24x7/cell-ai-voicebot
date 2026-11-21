import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRef, useState } from 'react';

import { useSession } from '@/features/auth/hooks';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import type { ScheduledCallWarnings, WhatsAppCallProgram } from '@/services/api/types';
import { formatCurrencyMicros } from '@/utils/format';

import { ProgramPicker } from '../ProgramPicker';
import { useCallPrice, useCancelScheduledCall, useScheduleCall } from '../queries';

import { instantOf, localInputOf } from './schedule-time';

const MIN = 60_000;

const WARNING_TEXT: Record<keyof ScheduledCallWarnings, string> = {
  noPermission:
    'Is customer ne abhi call ki permission nahi di — us samay permission na hui to call skip hogi.',
  permissionExpiresBeforeDue:
    'Customer ki call permission is time se pehle khatam ho jayegi — call skip ho sakti hai.',
  outsideWindow:
    'Ye time 09:00–21:00 ke bahar hai — call agle allowed time par ek baar shift hogi.',
  lowWallet: 'Wallet mein balance nahi hai — us samay balance na hua to call skip hogi.',
};

/**
 * SAC-T10: "Schedule AI call" — the AI program calls the customer later (account timezone),
 * with optional retries. Every check runs again at that time.
 */
export function ScheduleAiCallDialog({
  channelId,
  contactId,
  conversationId,
  contactLabel,
  phoneE164,
  onClose,
}: {
  channelId: string;
  contactId: string;
  conversationId: string | null;
  contactLabel: string;
  phoneE164: string;
  onClose: (scheduled: boolean) => void;
}) {
  const tz = useSession()?.account.timezone ?? 'Asia/Kolkata';
  const [when, setWhen] = useState(() => localInputOf(new Date(Date.now() + 60 * MIN), tz));
  const [program, setProgram] = useState<WhatsAppCallProgram | null>(null);
  const [purpose, setPurpose] = useState('');
  const [retries, setRetries] = useState(0);
  const [gapMin, setGapMin] = useState(60);
  const key = useRef(crypto.randomUUID());
  const schedule = useScheduleCall();
  const cancel = useCancelScheduledCall();
  const quote = useCallPrice(channelId, contactId);
  // the clock when the dialog opened (render stays pure); the server checks again
  const [openedAt] = useState(() => Date.now());
  const due = instantOf(when, tz);
  const soon = !due || due.getTime() < openedAt + 5 * MIN;
  const far = Boolean(due && due.getTime() > openedAt + 30 * 86_400_000);
  const quick = (at: Date) => setWhen(localInputOf(at, tz));
  const tomorrow11 = () => {
    const today = localInputOf(new Date(), tz).slice(0, 10);
    const base = instantOf(`${today}T11:00`, tz) ?? new Date();
    return new Date(base.getTime() + 86_400_000);
  };
  const done = schedule.data;
  const warnings = done
    ? (Object.keys(WARNING_TEXT) as (keyof ScheduledCallWarnings)[]).filter((k) => done.warnings[k])
    : [];
  const error = schedule.error ? toApiError(schedule.error) : null;

  const submit = () => {
    if (!due || !program) return;
    schedule.mutate(
      {
        key: key.current,
        body: {
          channelId,
          contactId,
          conversationId,
          program,
          purpose: purpose.trim() || null,
          dueAt: due.toISOString(),
          retry: retries ? { max: retries, gapMin, on: ['no_answer', 'busy', 'failed'] } : null,
        },
      },
      {
        onSuccess: (r) => {
          const anyWarning = Object.values(r.warnings).some(Boolean);
          if (!anyWarning) onClose(true);
        },
      },
    );
  };

  if (done && warnings.length) {
    return (
      <Dialog open onClose={() => onClose(true)} fullWidth maxWidth="sm">
        <DialogTitle>AI call scheduled — check this</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ pt: 1 }}>
            {warnings.map((w) => (
              <Alert key={w} severity="warning">
                {WARNING_TEXT[w]}
              </Alert>
            ))}
            {cancel.error && <Alert severity="error">{getErrorMessage(cancel.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            color="error"
            disabled={cancel.isPending}
            onClick={() =>
              cancel.mutate(done.scheduledCall.id, { onSuccess: () => onClose(false) })
            }
          >
            Cancel this scheduled call
          </Button>
          <Button variant="contained" onClick={() => onClose(true)}>
            Phir bhi rakho
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={() => onClose(false)} fullWidth maxWidth="sm">
      <DialogTitle>Schedule AI call</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Baad mein AI is customer ko WhatsApp par call karega. Us samay permission, DND, calling
            time aur wallet dobara check honge.
          </Typography>
          <Typography>
            {contactLabel} · {phoneE164}
          </Typography>
          {error && !error.details.length && (
            <Alert severity="error">{getErrorMessage(error)}</Alert>
          )}
          <TextField
            type="datetime-local"
            label={`Kab (${tz})`}
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            error={soon || far || Boolean(error?.details.find((d) => d.path === 'dueAt'))}
            helperText={
              error?.details.find((d) => d.path === 'dueAt')?.message ??
              (soon ? 'Kam se kam 5 minute baad' : far ? 'Zyada se zyada 30 din aage' : ' ')
            }
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Button size="small" onClick={() => quick(new Date(Date.now() + 30 * MIN))}>
              30 min baad
            </Button>
            <Button size="small" onClick={() => quick(new Date(Date.now() + 120 * MIN))}>
              2 ghante baad
            </Button>
            <Button size="small" onClick={() => quick(tomorrow11())}>
              Kal 11:00
            </Button>
          </Stack>
          <ProgramPicker
            value={program}
            onChange={setProgram}
            error={error?.details.find((d) => d.path === 'program')?.message ?? null}
          />
          <TextField
            label="Purpose (AI ko context ke liye, optional)"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
          <Stack direction="row" spacing={2}>
            <TextField
              select
              size="small"
              label="Retry (no answer / busy)"
              value={retries}
              onChange={(e) => setRetries(Number(e.target.value))}
              sx={{ minWidth: 200 }}
            >
              <MenuItem value={0}>Off</MenuItem>
              <MenuItem value={1}>1 baar</MenuItem>
              <MenuItem value={2}>2 baar</MenuItem>
            </TextField>
            {retries > 0 && (
              <TextField
                select
                size="small"
                label="Gap"
                value={gapMin}
                onChange={(e) => setGapMin(Number(e.target.value))}
                sx={{ minWidth: 140 }}
              >
                {[15, 30, 60, 120, 240].map((m) => (
                  <MenuItem key={m} value={m}>
                    {m < 60 ? `${String(m)} min` : `${String(m / 60)} ghante`}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Stack>
          {quote.data && (
            <Typography variant="body2" color="text.secondary">
              Estimate: call {formatCurrencyMicros(quote.data.callPerMinuteMicros)} + AI{' '}
              {formatCurrencyMicros(quote.data.aiPerMinuteMicros)} per minute (wallet se, call ke
              samay)
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!program || soon || far || schedule.isPending}
          onClick={submit}
        >
          Schedule AI call
        </Button>
      </DialogActions>
    </Dialog>
  );
}
