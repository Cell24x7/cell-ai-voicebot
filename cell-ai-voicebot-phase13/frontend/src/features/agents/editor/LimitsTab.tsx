import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Controller } from 'react-hook-form';

import type { AgentForm } from '../agent-form';

import type { EditorTabProps } from './editor-context';

const FALLBACKS: { key: keyof AgentForm['fallback']; label: string; help: string }[] = [
  {
    key: 'aiFailed',
    label: 'When the AI fails',
    help: 'The AI service is down or a reply broke a rule twice',
  },
  { key: 'walletEmpty', label: 'When the wallet is empty', help: 'No balance left for AI usage' },
  { key: 'agentOff', label: 'When the agent is off', help: 'The agent is switched off' },
  {
    key: 'capReached',
    label: 'When a spend cap is reached',
    help: 'Daily or monthly cap of this agent',
  },
];

type NumberField =
  | 'callBehaviour.maxCallDurationSec'
  | 'callBehaviour.silenceTimeoutSec'
  | 'callBehaviour.endCallAfterSilenceRetries'
  | 'model.maxOutputTokens';

/** Limits: call behaviour, model, spend caps, fallback messages. */
export function LimitsTab({ form, catalog, readOnly }: EditorTabProps) {
  const { errors } = form.formState;
  const number = (name: NumberField, label: string, min: number, max: number, unit?: string) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          label={label}
          type="number"
          value={Number.isNaN(field.value) ? '' : field.value}
          onChange={(e) =>
            field.onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))
          }
          disabled={readOnly}
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message ?? `${min}–${max}${unit ? ` ${unit}` : ''}`}
          slotProps={{ htmlInput: { min, max } }}
          sx={{ maxWidth: 260 }}
        />
      )}
    />
  );

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="subtitle1" component="h2">
            Calls
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {number('callBehaviour.maxCallDurationSec', 'Longest call (seconds)', 60, 1800)}
            {number('callBehaviour.silenceTimeoutSec', 'Silence before a nudge (seconds)', 3, 30)}
            {number('callBehaviour.endCallAfterSilenceRetries', 'Nudges before hanging up', 1, 3)}
          </Stack>
          <Controller
            control={form.control}
            name="callBehaviour.bargeIn"
            render={({ field }) => (
              <FormControlLabel
                control={
                  <Switch
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                    disabled={readOnly}
                  />
                }
                label="Let the customer interrupt the agent"
              />
            )}
          />
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="subtitle1" component="h2">
            AI model
          </Typography>
          <Controller
            control={form.control}
            name="model.textModel"
            render={({ field, fieldState }) => (
              <TextField
                select
                label="Text model"
                value={field.value}
                onChange={field.onChange}
                disabled={readOnly}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message}
                sx={{ maxWidth: 320 }}
              >
                {[...new Set([...(catalog?.textModels ?? []), field.value])].map((m) => (
                  <MenuItem key={m} value={m}>
                    {m}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Controller
            control={form.control}
            name="model.temperatureTenths"
            render={({ field }) => (
              <div>
                <Typography id="temperature-label" variant="body2">
                  Creativity (temperature): {(field.value / 10).toFixed(1)}
                </Typography>
                <Slider
                  aria-labelledby="temperature-label"
                  value={field.value}
                  onChange={(_e, v) => field.onChange(v)}
                  min={0}
                  max={12}
                  step={1}
                  marks={[
                    { value: 0, label: '0' },
                    { value: 6, label: '0.6' },
                    { value: 12, label: '1.2' },
                  ]}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(v) => (v / 10).toFixed(1)}
                  disabled={readOnly}
                  sx={{ maxWidth: 360 }}
                />
              </div>
            )}
          />
          {number('model.maxOutputTokens', 'Longest reply (tokens)', 50, 1000)}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <div>
            <Typography variant="subtitle1" component="h2">
              Spend caps
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Leave empty for no cap. Counted in your account's timezone.
            </Typography>
          </div>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {(['daily', 'monthly'] as const).map((k) => (
              <TextField
                key={k}
                label={k === 'daily' ? 'Daily cap' : 'Monthly cap'}
                {...form.register(`limits.${k}`)}
                disabled={readOnly}
                error={Boolean(errors.limits?.[k])}
                helperText={errors.limits?.[k]?.message ?? 'No cap when empty'}
                slotProps={{
                  input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> },
                  htmlInput: { inputMode: 'decimal' },
                }}
                sx={{ maxWidth: 260 }}
              />
            ))}
          </Stack>
          <Controller
            control={form.control}
            name="limits.onCap"
            render={({ field }) => (
              <FormControl disabled={readOnly}>
                <FormLabel id="on-cap-label">When a cap is reached</FormLabel>
                <RadioGroup
                  aria-labelledby="on-cap-label"
                  value={field.value}
                  onChange={field.onChange}
                >
                  <FormControlLabel
                    value="fallback"
                    control={<Radio />}
                    label="Say the cap message (no AI cost)"
                  />
                  <FormControlLabel value="stop" control={<Radio />} label="Refuse the turn" />
                </RadioGroup>
              </FormControl>
            )}
          />
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="subtitle1" component="h2">
            Fallback messages
          </Typography>
          {FALLBACKS.map((f) => (
            <TextField
              key={f.key}
              label={f.label}
              {...form.register(`fallback.${f.key}`)}
              disabled={readOnly}
              multiline
              fullWidth
              error={Boolean(errors.fallback?.[f.key])}
              helperText={errors.fallback?.[f.key]?.message ?? f.help}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
          ))}
          <FallbackNote />
        </Stack>
      </Paper>
    </Stack>
  );
}

function FallbackNote() {
  return (
    <Typography variant="caption" color="text.secondary">
      Fallbacks are said as they are — no AI involved, no cost.
    </Typography>
  );
}
