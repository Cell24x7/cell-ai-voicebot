import AddOutlined from '@mui/icons-material/AddOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Controller, useFieldArray, useWatch } from 'react-hook-form';

import type { AgentLanguage, AgentVoice, ToneRule } from '@/services/api/types';

import { LANGUAGE_LABELS, TONE_LABELS, VOICE_LABELS } from '../agent-form';

import type { EditorTabProps } from './editor-context';

const TONE_RULES_MAX = 10;
const VOICES = Object.keys(VOICE_LABELS) as AgentVoice[];
const LANGUAGES = Object.keys(LANGUAGE_LABELS) as AgentLanguage[];
const TRIGGERS = Object.keys(TONE_LABELS) as ToneRule['when'][];

/** Voice & Language: voice, language mode, tone rules. */
export function VoiceTab({ form, catalog, readOnly }: EditorTabProps) {
  const rules = useFieldArray({ control: form.control, name: 'toneRules' });
  const mode = useWatch({ control: form.control, name: 'languageMode' });
  const watched = useWatch({ control: form.control, name: 'toneRules' });
  const { errors } = form.formState;
  const voices = catalog?.voices ?? VOICES;

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="subtitle1" component="h2">
            Voice and language
          </Typography>
          <Controller
            control={form.control}
            name="voice"
            render={({ field }) => (
              <TextField
                select
                label="Voice (used on calls)"
                value={field.value}
                onChange={field.onChange}
                disabled={readOnly}
                sx={{ maxWidth: 320 }}
              >
                {voices.map((v) => (
                  <MenuItem key={v} value={v}>
                    {VOICE_LABELS[v]}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Controller
            control={form.control}
            name="languageMode"
            render={({ field }) => (
              <FormControl disabled={readOnly}>
                <FormLabel id="language-mode-label">Language</FormLabel>
                <RadioGroup
                  aria-labelledby="language-mode-label"
                  value={field.value}
                  onChange={field.onChange}
                >
                  <FormControlLabel
                    value="auto"
                    control={<Radio />}
                    label="Follow the customer (Hindi, English or Hinglish)"
                  />
                  <FormControlLabel value="fixed" control={<Radio />} label="Always one language" />
                </RadioGroup>
              </FormControl>
            )}
          />
          <Controller
            control={form.control}
            name="language"
            render={({ field }) => (
              <TextField
                select
                label={mode === 'auto' ? 'Start in' : 'Always reply in'}
                value={field.value}
                onChange={field.onChange}
                disabled={readOnly}
                sx={{ maxWidth: 320 }}
              >
                {LANGUAGES.map((l) => (
                  <MenuItem key={l} value={l}>
                    {LANGUAGE_LABELS[l]}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <div>
            <Typography variant="subtitle1" component="h2">
              Tone rules
            </Typography>
            <Typography variant="body2" color="text.secondary">
              How to answer when the customer is in a certain mood (up to {TONE_RULES_MAX}).
            </Typography>
          </div>
          {rules.fields.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No tone rules.
            </Typography>
          )}
          {rules.fields.map((rule, i) => (
            <Stack
              key={rule.id}
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              sx={{ alignItems: { sm: 'flex-start' } }}
            >
              <Controller
                control={form.control}
                name={`toneRules.${i}.when`}
                render={({ field }) => (
                  <TextField
                    select
                    label="When the customer is"
                    value={field.value}
                    onChange={field.onChange}
                    disabled={readOnly}
                    sx={{ minWidth: 180 }}
                  >
                    {TRIGGERS.map((t) => (
                      <MenuItem key={t} value={t}>
                        {TONE_LABELS[t]}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
              {watched[i]?.when === 'custom' && (
                <TextField
                  label="Describe when"
                  {...form.register(`toneRules.${i}.customWhen`)}
                  disabled={readOnly}
                  error={Boolean(errors.toneRules?.[i]?.customWhen)}
                  helperText={errors.toneRules?.[i]?.customWhen?.message}
                  slotProps={{ htmlInput: { maxLength: 100 } }}
                />
              )}
              <TextField
                label="Respond like this"
                {...form.register(`toneRules.${i}.respond`)}
                disabled={readOnly}
                fullWidth
                multiline
                error={Boolean(errors.toneRules?.[i]?.respond)}
                helperText={errors.toneRules?.[i]?.respond?.message}
                slotProps={{ htmlInput: { maxLength: 500 } }}
              />
              {!readOnly && (
                <IconButton
                  aria-label={`Remove tone rule ${i + 1}`}
                  onClick={() => rules.remove(i)}
                >
                  <DeleteOutlineOutlined />
                </IconButton>
              )}
            </Stack>
          ))}
          {!readOnly && (
            <div>
              <Button
                startIcon={<AddOutlined />}
                onClick={() => rules.append({ when: 'angry', customWhen: '', respond: '' })}
                disabled={rules.fields.length >= TONE_RULES_MAX}
              >
                Add tone rule
              </Button>
            </div>
          )}
          {errors.toneRules?.message && (
            <Typography variant="body2" color="error">
              {errors.toneRules.message}
            </Typography>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
