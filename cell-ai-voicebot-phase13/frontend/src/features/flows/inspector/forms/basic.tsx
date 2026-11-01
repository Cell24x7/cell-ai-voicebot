import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { useTemplates } from '@/features/templates/queries';
import { useChannels } from '@/features/whatsapp/queries';

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
        Queued during the call. SMS sending starts with phone lines.
      </Typography>
    </Stack>
  );
}

export function WhatsappForm({ config, set, errors, variables, readOnly }: StepFormProps) {
  const params = strings(config.params);
  const channelId = str(config.channelId);
  const channels = useChannels();
  const templates = useTemplates({ status: ['APPROVED'] });
  const offered = (templates.data ?? []).filter(
    (t) => !channelId || t.channelIds.includes(channelId),
  );
  const name = str(config.templateName);
  const language = str(config.language, 'hi');
  const chosen = offered.find((t) => t.name === name && t.language === language);
  return (
    <Stack spacing={2}>
      <TextField
        select
        label="Send from"
        size="small"
        value={channelId}
        onChange={(e) => set({ channelId: e.target.value || null })}
        disabled={readOnly}
        error={Boolean(errors.channelId)}
        helperText={errors.channelId ?? "Empty = the account's only connected number"}
      >
        <MenuItem value="">Default number</MenuItem>
        {(channels.data?.items ?? []).map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {c.label} {c.displayPhoneNumber ?? ''}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label="Approved template"
        size="small"
        value={chosen?.id ?? ''}
        onChange={(e) => {
          const t = offered.find((x) => x.id === e.target.value);
          if (t) set({ templateName: t.name, language: t.language });
        }}
        disabled={readOnly}
        helperText={
          chosen
            ? `Needs ${String(chosen.variablesCount)} parameter(s)`
            : offered.length
              ? 'Pick one, or type the name below'
              : 'No approved templates yet — type the name below'
        }
      >
        {offered.map((t) => (
          <MenuItem key={t.id} value={t.id}>
            {t.name} ({t.language})
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Template name"
        size="small"
        value={name}
        onChange={(e) => set({ templateName: e.target.value.toLowerCase() })}
        error={Boolean(errors.templateName)}
        helperText={errors.templateName ?? 'As approved in WhatsApp (a-z, 0-9, _)'}
        disabled={readOnly}
      />
      <SelectInput
        label="Template language"
        value={language}
        onChange={(l) => set({ language: l })}
        options={[
          { value: 'hi', label: 'Hindi' },
          { value: 'en', label: 'English' },
          ...(['hi', 'en'].includes(language) ? [] : [{ value: language, label: language }]),
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
      <Typography variant="caption" color="text.secondary">
        Sent after the call ends, with the same rules as the dashboard (approved template, opt-out,
        DND, wallet). Skipped messages show the reason on the call.
      </Typography>
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
