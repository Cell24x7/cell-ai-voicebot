import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';

import { jsonTemplateError } from './text-utils';

/** Monospace JSON template editor: checked on blur, "Format" pretty-prints it. */
export function JsonTemplateField({
  label,
  value,
  onChange,
  disabled,
  error,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** Server-side error (shown until the text changes). */
  error?: string;
  helperText?: string;
}) {
  const [checked, setChecked] = useState<string | null>(null);
  const shown = checked ?? error ?? null;
  return (
    <Stack spacing={1}>
      <TextField
        label={label}
        value={value}
        onChange={(e) => {
          setChecked(null);
          onChange(e.target.value);
        }}
        onBlur={() => setChecked(jsonTemplateError(value))}
        multiline
        minRows={4}
        fullWidth
        disabled={disabled}
        error={Boolean(shown)}
        helperText={shown ?? helperText}
        slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: 'monospace' } } }}
      />
      <div>
        <Button
          size="small"
          disabled={disabled || !value.trim() || Boolean(jsonTemplateError(value))}
          onClick={() => onChange(JSON.stringify(JSON.parse(value), null, 2))}
        >
          Format
        </Button>
      </div>
    </Stack>
  );
}
