import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { AudioPicker } from '../AudioPicker';
import { NumberInput, SelectInput, TemplateField, Toggle } from '../fields';
import {
  LANGUAGE_LABELS,
  bool,
  num,
  smsParts,
  str,
  strings,
  type StepFormProps,
} from '../form-types';

const TRIGGER_LABELS: Record<string, string> = {
  campaign: 'Campaign calls',
  inbound: 'Incoming calls',
  api: 'API-triggered calls',
  test: 'Tests (simulator, web call)',
};

export function StartForm({ config, set, errors, catalog, readOnly }: StepFormProps) {
  const triggers = strings(config.triggers);
  const toggle = (t: string) =>
    set({ triggers: triggers.includes(t) ? triggers.filter((x) => x !== t) : [...triggers, t] });
  return (
    <Stack spacing={1}>
      <FormLabel component="legend">This flow starts for</FormLabel>
      <FormGroup>
        {catalog.triggers.map((t) => (
          <FormControlLabel
            key={t}
            control={
              <Checkbox
                checked={triggers.includes(t)}
                onChange={() => toggle(t)}
                disabled={readOnly}
              />
            }
            label={TRIGGER_LABELS[t] ?? t}
          />
        ))}
      </FormGroup>
      {errors.triggers && <FormHelperText error>{errors.triggers}</FormHelperText>}
    </Stack>
  );
}

export function SpeakForm({ config, set, errors, variables, catalog, readOnly }: StepFormProps) {
  const text = str(config.text);
  const longAt = num(catalog.limits.speakLongWarnChars, 400);
  return (
    <Stack spacing={2}>
      <TemplateField
        label="Text to say"
        value={text}
        onChange={(t) => set({ text: t })}
        variables={variables}
        error={errors.text}
        helperText={`${String(text.length)} / 1000${text.length > longAt ? ' — long for a phone call' : ''}`}
        multiline
        maxLength={1000}
        readOnly={readOnly}
      />
      <SelectInput
        label="Language"
        value={str(config.language, 'flow')}
        onChange={(language) => set({ language })}
        options={['flow', ...catalog.languages].map((l) => ({
          value: l,
          label: LANGUAGE_LABELS[l] ?? l,
        }))}
        readOnly={readOnly}
      />
      <Toggle
        label="Customer can interrupt"
        checked={bool(config.interruptible, true)}
        onChange={(interruptible) => set({ interruptible })}
        readOnly={readOnly}
      />
    </Stack>
  );
}

export function PlayAudioForm({ config, set, errors, variables, readOnly }: StepFormProps) {
  return (
    <Stack spacing={2}>
      <AudioPicker
        value={str(config.audioId)}
        onChange={(audioId) => set({ audioId })}
        error={errors.audioId}
        readOnly={readOnly}
      />
      <TemplateField
        label="Fallback text (if the file is missing)"
        value={str(config.fallbackText)}
        onChange={(t) => set({ fallbackText: t || null })}
        variables={variables}
        readOnly={readOnly}
      />
    </Stack>
  );
}

const dispositionOptions = (catalog: StepFormProps['catalog']) =>
  catalog.dispositions.map((d) => ({ value: d, label: d.replace(/_/g, ' ') }));

export function DispositionForm({
  config,
  set,
  errors,
  variables,
  catalog,
  readOnly,
}: StepFormProps) {
  return (
    <Stack spacing={2}>
      <SelectInput
        label="Disposition"
        value={str(config.disposition)}
        onChange={(disposition) => set({ disposition })}
        options={dispositionOptions(catalog)}
        error={errors.disposition}
        readOnly={readOnly}
      />
      <TemplateField
        label="Note (optional)"
        value={str(config.note)}
        onChange={(t) => set({ note: t || null })}
        variables={variables}
        maxLength={200}
        readOnly={readOnly}
      />
    </Stack>
  );
}

export function TransferForm({ config, set, errors, variables, readOnly }: StepFormProps) {
  return (
    <Stack spacing={2}>
      <TemplateField
        label="Phone number"
        value={str(config.phone)}
        onChange={(phone) => set({ phone })}
        variables={variables}
        error={errors.phone}
        helperText="+91 mobile number, or one {{variable}} that holds it"
        placeholder="+919876543210"
        readOnly={readOnly}
      />
      <TemplateField
        label="Say before transferring"
        value={str(config.announcement)}
        onChange={(t) => set({ announcement: t || null })}
        variables={variables}
        maxLength={300}
        readOnly={readOnly}
      />
      <NumberInput
        label="Ring for (seconds)"
        value={num(config.timeoutSec, 30)}
        onChange={(timeoutSec) => set({ timeoutSec })}
        min={10}
        max={60}
        error={errors.timeoutSec}
        readOnly={readOnly}
      />
      <Alert severity="info">
        Real transfers need the SIP phase — the simulator asks whether it was answered.
      </Alert>
    </Stack>
  );
}

export function SmsForm({ config, set, errors, variables, readOnly }: StepFormProps) {
  const text = str(config.text);
  const parts = smsParts(text);
  return (
    <Stack spacing={2}>
      <TemplateField
        label="SMS text"
        value={text}
        onChange={(t) => set({ text: t })}
        variables={variables}
        error={errors.text}
        helperText={`${String(text.length)} / 500 · ${String(parts)} SMS`}
        multiline
        maxLength={500}
        readOnly={readOnly}
      />
      <TextField
        label="DLT template id (optional)"
        size="small"
        value={str(config.dltTemplateId)}
        onChange={(e) => set({ dltTemplateId: e.target.value || null })}
        disabled={readOnly}
        slotProps={{ htmlInput: { maxLength: 30 } }}
      />
      <Typography variant="caption" color="text.secondary">
        Queued during the call and sent after it ends.
      </Typography>
    </Stack>
  );
}

export function WhatsappForm({ config, set, errors, variables, readOnly }: StepFormProps) {
  const params = strings(config.params);
  return (
    <Stack spacing={2}>
      <TextField
        label="Template name"
        size="small"
        value={str(config.templateName)}
        onChange={(e) => set({ templateName: e.target.value.toLowerCase() })}
        error={Boolean(errors.templateName)}
        helperText={errors.templateName ?? 'As approved in WhatsApp (a-z, 0-9, _)'}
        disabled={readOnly}
      />
      <SelectInput
        label="Template language"
        value={str(config.language, 'hi')}
        onChange={(language) => set({ language })}
        options={[
          { value: 'hi', label: 'Hindi' },
          { value: 'en', label: 'English' },
        ]}
        readOnly={readOnly}
      />
      {params.map((p, i) => (
        <Stack key={String(i)} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <TemplateField
            label={`Parameter ${String(i + 1)}`}
            value={p}
            onChange={(t) => set({ params: params.map((x, j) => (j === i ? t : x)) })}
            variables={variables}
            readOnly={readOnly}
          />
          {!readOnly && (
            <IconButton
              aria-label={`Remove parameter ${String(i + 1)}`}
              onClick={() => set({ params: params.filter((_x, j) => j !== i) })}
            >
              <DeleteOutlineOutlined fontSize="small" />
            </IconButton>
          )}
        </Stack>
      ))}
      {!readOnly && params.length < 10 && (
        <Button
          size="small"
          onClick={() => set({ params: [...params, ''] })}
          sx={{ alignSelf: 'flex-start' }}
        >
          Add parameter
        </Button>
      )}
    </Stack>
  );
}

export function WaitForm({ config, set, errors, readOnly }: StepFormProps) {
  return (
    <NumberInput
      label="Pause (seconds)"
      value={num(config.seconds, 5)}
      onChange={(seconds) => set({ seconds })}
      min={1}
      max={60}
      error={errors.seconds}
      readOnly={readOnly}
      helperText="Silence in the call. Skipped instantly in the simulator."
    />
  );
}

export function HangupForm({ config, set, variables, catalog, readOnly }: StepFormProps) {
  return (
    <Stack spacing={2}>
      <TemplateField
        label="Goodbye line (optional)"
        value={str(config.text)}
        onChange={(t) => set({ text: t || null })}
        variables={variables}
        multiline
        maxLength={500}
        readOnly={readOnly}
      />
      <SelectInput
        label="Disposition if none was set"
        value={str(config.disposition)}
        onChange={(d) => set({ disposition: d || null })}
        options={[{ value: '', label: 'None' }, ...dispositionOptions(catalog)]}
        readOnly={readOnly}
      />
    </Stack>
  );
}
