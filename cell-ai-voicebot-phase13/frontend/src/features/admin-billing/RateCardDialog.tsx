import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { useState } from 'react';

import type { RateCardInput } from '@/services/api/admin-billing';
import { getErrorMessage } from '@/services/api/errors';
import {
  formatBps,
  formatRupeesInput,
  MICROS_PER_RUPEE,
  parsePercentToBps,
  parseRupeesInput,
} from '@/utils/money';

/** Values a dialog starts from (any rate card shape). */
export type RateCardValues = Omit<RateCardInput, 'note' | 'pulseSeconds'> & {
  pulseSeconds: number;
};

const RATE_MAX = 1000 * MICROS_PER_RUPEE;
const PULSES = [15, 30, 60] as const;
const asPulse = (n: number): RateCardInput['pulseSeconds'] => PULSES.find((p) => p === n) ?? 60;

/**
 * Edits a rate card as rupees / percent; saves integer micros / bps.
 * `onSave` rejects with the API error, shown in the dialog.
 */
export function RateCardDialog({
  title,
  initial,
  saveLabel = 'Save new rates',
  onSave,
  onClose,
}: {
  title: string;
  initial: RateCardValues;
  saveLabel?: string;
  onSave: (values: RateCardInput) => Promise<unknown>;
  onClose: () => void;
}) {
  const [call, setCall] = useState(formatRupeesInput(initial.callPerMinuteMicros));
  const [pulse, setPulse] = useState<RateCardInput['pulseSeconds']>(asPulse(initial.pulseSeconds));
  const [ai, setAi] = useState(formatRupeesInput(initial.aiPerMinuteMicros));
  const [tts, setTts] = useState(formatRupeesInput(initial.ttsPer1kCharsMicros));
  const [aiText, setAiText] = useState(formatRupeesInput(initial.aiTextPer1kTokensMicros));
  const [embedding, setEmbedding] = useState(formatRupeesInput(initial.embeddingPer1kTokensMicros));
  const [commission, setCommission] = useState(formatBps(initial.commissionBps).replace('%', ''));
  const [unanswered, setUnanswered] = useState(initial.billUnansweredAttempts);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const money = (v: string) => parseRupeesInput(v, { maxMicros: RATE_MAX });
  const c = money(call);
  const a = money(ai);
  const t = money(tts);
  const x = money(aiText);
  const e = money(embedding);
  const bps = parsePercentToBps(commission);
  const noteProblem = note.trim() && note.trim().length < 3 ? 'At least 3 characters' : null;
  const valid = c.ok && a.ok && t.ok && x.ok && e.ok && bps !== null && !noteProblem;

  const save = async () => {
    setTouched(true);
    if (!c.ok || !a.ok || !t.ok || !x.ok || !e.ok || bps === null || noteProblem) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        callPerMinuteMicros: c.micros,
        pulseSeconds: pulse,
        aiPerMinuteMicros: a.micros,
        ttsPer1kCharsMicros: t.micros,
        commissionBps: bps,
        aiTextPer1kTokensMicros: x.micros,
        embeddingPer1kTokensMicros: e.micros,
        billUnansweredAttempts: unanswered,
        note: note.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  const help = (r: ReturnType<typeof money>, text: string) => (touched && !r.ok ? r.message : text);

  return (
    <Dialog
      open
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="rate-card-title"
    >
      <DialogTitle id="rate-card-title">{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              fullWidth
              label="Call (₹ per minute)"
              value={call}
              onChange={(e) => setCall(e.target.value)}
              error={touched && !c.ok}
              helperText={help(c, 'Charged per pulse')}
            />
            <TextField
              select
              fullWidth
              label="Billing pulse"
              value={pulse}
              onChange={(e) => setPulse(asPulse(Number(e.target.value)))}
            >
              {PULSES.map((p) => (
                <MenuItem key={p} value={p}>
                  {p} seconds
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              fullWidth
              label="AI (₹ per minute)"
              value={ai}
              onChange={(e) => setAi(e.target.value)}
              error={touched && !a.ok}
              helperText={help(a, 'Per second of AI conversation')}
            />
            <TextField
              fullWidth
              label="Voice / TTS (₹ per 1,000 characters)"
              value={tts}
              onChange={(e) => setTts(e.target.value)}
              error={touched && !t.ok}
              helperText={help(t, 'Spoken text')}
            />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              fullWidth
              label="AI text (₹ per 1,000 tokens)"
              value={aiText}
              onChange={(ev) => setAiText(ev.target.value)}
              error={touched && !x.ok}
              helperText={help(x, 'Playground and chat turns, input + output')}
            />
            <TextField
              fullWidth
              label="Embeddings (₹ per 1,000 tokens)"
              value={embedding}
              onChange={(ev) => setEmbedding(ev.target.value)}
              error={touched && !e.ok}
              helperText={help(e, 'Knowledge processing and search')}
            />
          </Stack>
          <TextField
            label="Platform commission (%)"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            error={touched && bps === null}
            helperText={
              touched && bps === null
                ? 'A percent from 0 to 100, at most 2 decimals'
                : 'Added to each call charge'
            }
          />
          <FormControlLabel
            control={
              <Switch checked={unanswered} onChange={(e) => setUnanswered(e.target.checked)} />
            }
            label="Bill unanswered call attempts"
          />
          <TextField
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            error={Boolean(noteProblem)}
            helperText={noteProblem ?? 'Why the prices change — kept in the history and audit log'}
            slotProps={{ htmlInput: { maxLength: 300 } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void save()}
          disabled={saving || (touched && !valid)}
        >
          {saveLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
