import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

/**
 * A write-only secret: with a stored value it shows only the hint
 * (`••••1234`) and "Replace"; `value === null` means "keep the stored one".
 */
export function SecretField({
  label,
  hint,
  value,
  onChange,
  disabled,
  error,
}: {
  label: string;
  /** Hint of the stored secret, `null` when nothing is stored yet. */
  hint: string | null;
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  error?: string;
}) {
  if (hint && value === null) {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <TextField
          label={label}
          value={hint}
          size="small"
          fullWidth
          slotProps={{ input: { readOnly: true }, htmlInput: { 'aria-readonly': true } }}
          helperText="Stored securely — only the last 4 characters are shown"
        />
        <Button size="small" onClick={() => onChange('')} disabled={disabled}>
          Replace
        </Button>
      </Stack>
    );
  }
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <TextField
        label={label}
        type="password"
        autoComplete="off"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        size="small"
        fullWidth
        disabled={disabled}
        error={Boolean(error)}
        helperText={
          error ?? (hint ? `Replaces ${hint}` : 'Saved encrypted — you will not see it again')
        }
      />
      {hint && (
        <Button size="small" onClick={() => onChange(null)} disabled={disabled}>
          Keep current
        </Button>
      )}
    </Stack>
  );
}
