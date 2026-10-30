import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  error?: boolean;
}

/** One box per digit: auto-advance, backspace goes back, pasting a full code fills all boxes. */
export function OtpInput({ value, onChange, length = 6, disabled, error }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  const setDigit = (index: number, digit: string) => {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join('').slice(0, length));
  };

  const onPaste = (e: ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  };

  const onKeyDown = (index: number) => (e: KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) refs.current[index - 1]?.focus();
  };

  return (
    <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }} onPaste={onPaste}>
      {digits.map((digit, index) => (
        <TextField
          key={index}
          value={digit}
          disabled={disabled}
          error={error}
          inputRef={(el: HTMLInputElement | null) => {
            refs.current[index] = el;
          }}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, '').slice(-1);
            setDigit(index, d);
            if (d && index < length - 1) refs.current[index + 1]?.focus();
          }}
          onKeyDown={onKeyDown(index)}
          slotProps={{
            htmlInput: {
              inputMode: 'numeric',
              autoComplete: index === 0 ? 'one-time-code' : 'off',
              maxLength: 1,
              'aria-label': `Digit ${index + 1}`,
              style: { textAlign: 'center', fontSize: 22, width: '1.4em' },
            },
          }}
        />
      ))}
    </Stack>
  );
}
