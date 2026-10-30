import { InputAdornment, Stack, TextField, Typography } from '@mui/material';

import type { DryRunOutcome, ScenarioKey } from '@/services/api/campaigns';

import { OUTCOME_LABELS, SCENARIO_LABELS } from '../labels';

import { remainder } from './weights';

export interface PercentFieldProps {
  label: string;
  /** Whole percent 0–100 (decimals allowed with `step`). */
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  step?: number;
}

/** A 0–100 % number input (empty → 0, clamped). */
export function PercentField({
  label,
  value,
  onChange,
  disabled = false,
  step = 1,
}: PercentFieldProps) {
  return (
    <TextField
      label={label}
      type="number"
      size="small"
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const n = Number(e.target.value);
        onChange(Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);
      }}
      slotProps={{
        htmlInput: { min: 0, max: 100, step },
        input: { endAdornment: <InputAdornment position="end">%</InputAdornment> },
      }}
      sx={{ width: 150 }}
    />
  );
}

const Remainder = ({ left }: { left: number }) => (
  <Typography variant="caption" color={left === 0 ? 'text.secondary' : 'error'}>
    {left === 0
      ? 'Adds up to 100 %'
      : left > 0
        ? `${String(left)} % left to give`
        : `${String(-left)} % too much`}
  </Typography>
);

export interface OutcomeMixFieldProps {
  /** Basis points per outcome (sum 10 000), as the API stores them. */
  value: Record<DryRunOutcome, number>;
  onChange: (value: Record<DryRunOutcome, number>) => void;
  disabled?: boolean;
}

/** Dry-run call outcomes in % (stored as basis points); must add up to 100. */
export function OutcomeMixField({ value, onChange, disabled = false }: OutcomeMixFieldProps) {
  const percent = Object.fromEntries(
    Object.entries(value).map(([k, bps]) => [k, bps / 100]),
  ) as Record<DryRunOutcome, number>;
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">Call outcomes</Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {(Object.keys(OUTCOME_LABELS) as DryRunOutcome[]).map((k) => (
          <PercentField
            key={k}
            label={OUTCOME_LABELS[k]}
            value={percent[k]}
            step={0.01}
            disabled={disabled}
            onChange={(v) => onChange({ ...value, [k]: Math.round(v * 100) })}
          />
        ))}
      </Stack>
      <Remainder left={remainder(percent)} />
    </Stack>
  );
}

export interface ScenarioWeightsFieldProps {
  /** Whole percent per scenario (sum 100). */
  value: Record<ScenarioKey, number>;
  onChange: (value: Record<ScenarioKey, number>) => void;
  disabled?: boolean;
}

/** How the simulated customers answer (answered calls); must add up to 100. */
export function ScenarioWeightsField({
  value,
  onChange,
  disabled = false,
}: ScenarioWeightsFieldProps) {
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">Simulated customers</Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {(Object.keys(SCENARIO_LABELS) as ScenarioKey[]).map((k) => (
          <PercentField
            key={k}
            label={SCENARIO_LABELS[k]}
            value={value[k]}
            disabled={disabled}
            onChange={(v) => onChange({ ...value, [k]: Math.round(v) })}
          />
        ))}
      </Stack>
      <Remainder left={remainder(value)} />
    </Stack>
  );
}
