import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useRef } from 'react';

import { VariablePicker, type PickerVariable } from '@/components/fields/VariablePicker';

import { AudioPicker } from './AudioPicker';
import { str } from './form-types';

/** Text with `{{variables}}` + an "Insert variable" menu. */
export function TemplateField({
  label,
  value,
  onChange,
  variables,
  error,
  helperText,
  multiline,
  maxLength,
  readOnly,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  variables: PickerVariable[];
  error?: string | undefined;
  helperText?: string;
  multiline?: boolean;
  maxLength?: number;
  readOnly: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  return (
    <Stack spacing={0.5}>
      <TextField
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputRef={ref}
        size="small"
        fullWidth
        multiline={multiline}
        minRows={multiline ? 2 : undefined}
        error={Boolean(error)}
        helperText={error ?? helperText}
        placeholder={placeholder}
        disabled={readOnly}
        slotProps={{ htmlInput: maxLength ? { maxLength } : {} }}
      />
      {!readOnly && (
        <VariablePicker variables={variables} value={value} onChange={onChange} inputRef={ref} />
      )}
    </Stack>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  error,
  readOnly,
  helperText,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  error?: string | undefined;
  readOnly: boolean;
  helperText?: string;
}) {
  return (
    <TextField
      label={label}
      type="number"
      size="small"
      value={value}
      onChange={(e) => {
        // an emptied field keeps the last number (no silent 0)
        const n = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(Math.round(n));
      }}
      error={Boolean(error)}
      helperText={error ?? helperText ?? `${String(min)}–${String(max)}`}
      disabled={readOnly}
      slotProps={{ htmlInput: { min, max } }}
    />
  );
}

export function SelectInput({
  label,
  value,
  onChange,
  options,
  error,
  readOnly,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
  error?: string | undefined;
  readOnly: boolean;
  helperText?: string;
}) {
  return (
    <TextField
      select
      label={label}
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={Boolean(error)}
      helperText={error ?? helperText}
      disabled={readOnly}
      fullWidth
    >
      {options.map((o) => (
        <MenuItem key={o.value || '_'} value={o.value}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  readOnly,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  readOnly: boolean;
}) {
  return (
    <FormControlLabel
      control={
        <Switch
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={readOnly}
        />
      }
      label={label}
    />
  );
}

/** Prompt of a gather node: TTS text or an audio file. */
export function PromptEditor({
  value,
  onChange,
  variables,
  errors,
  readOnly,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  variables: PickerVariable[];
  errors: Record<string, string>;
  readOnly: boolean;
}) {
  const kind = value.kind === 'audio' ? 'audio' : 'speak';
  return (
    <Stack spacing={1}>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={kind}
        onChange={(_e, next: 'speak' | 'audio' | null) => {
          if (next === 'audio') onChange({ kind: 'audio', audioId: '', fallbackText: null });
          else if (next === 'speak') onChange({ kind: 'speak', text: '' });
        }}
        aria-label="Prompt type"
        disabled={readOnly}
      >
        <ToggleButton value="speak">Text</ToggleButton>
        <ToggleButton value="audio">Audio file</ToggleButton>
      </ToggleButtonGroup>
      {kind === 'speak' ? (
        <TemplateField
          label="Prompt"
          value={str(value.text)}
          onChange={(text) => onChange({ kind: 'speak', text })}
          variables={variables}
          error={errors['prompt.text']}
          multiline
          maxLength={1000}
          readOnly={readOnly}
        />
      ) : (
        <>
          <AudioPicker
            value={str(value.audioId)}
            onChange={(audioId) => onChange({ ...value, kind: 'audio', audioId })}
            error={errors['prompt.audioId']}
            readOnly={readOnly}
          />
          <TemplateField
            label="Fallback text (if the file is missing)"
            value={str(value.fallbackText)}
            onChange={(t) => onChange({ ...value, kind: 'audio', fallbackText: t || null })}
            variables={variables}
            readOnly={readOnly}
          />
        </>
      )}
    </Stack>
  );
}
