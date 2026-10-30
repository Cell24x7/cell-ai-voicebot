import {
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';

import { DAY_SHORT } from '../labels';
import { fromLocalInput, toLocalInput } from '../time';

import { scheduleMode, scheduleProblems, type ScheduleMode, type ScheduleValue } from './schedule';

export interface ScheduleFieldProps {
  value: ScheduleValue;
  onChange: (value: ScheduleValue) => void;
  /** Account (or campaign) timezone — dates are typed and shown in it. */
  timezone: string;
  disabled?: boolean;
  now?: Date;
  /** Only the end (a started campaign can still move its end). */
  endOnly?: boolean;
}

/** Start now / later (date-time) / recurring (daily or weekly at a time), + an optional end. */
export function ScheduleField({
  value,
  onChange,
  timezone,
  disabled = false,
  now,
  endOnly = false,
}: ScheduleFieldProps) {
  const mode = scheduleMode(value);
  const problems = scheduleProblems(value, now);
  const setMode = (next: ScheduleMode) => {
    if (next === 'now') onChange({ ...value, startAt: null, recurrence: null });
    if (next === 'later') {
      const inAnHour = new Date((now ?? new Date()).getTime() + 3_600_000).toISOString();
      onChange({ ...value, startAt: value.startAt ?? inAnHour, recurrence: null });
    }
    if (next === 'recurring') {
      onChange({
        ...value,
        startAt: null,
        recurrence: value.recurrence ?? { freq: 'daily', days: [], time: '10:00', until: null },
      });
    }
  };
  const recurrence = value.recurrence;
  const end = (
    <TextField
      label={`End (optional, ${timezone})`}
      type="datetime-local"
      value={toLocalInput(value.endAt, timezone)}
      disabled={disabled}
      onChange={(e) => onChange({ ...value, endAt: fromLocalInput(e.target.value, timezone) })}
      helperText="Waiting contacts are skipped at the end; live calls finish."
      slotProps={{ inputLabel: { shrink: true } }}
      sx={{ maxWidth: 320 }}
    />
  );
  if (endOnly) return end;
  return (
    <Stack spacing={2}>
      <RadioGroup
        row
        value={mode}
        onChange={(e) => setMode(e.target.value as ScheduleMode)}
        aria-label="When"
      >
        <FormControlLabel value="now" control={<Radio />} label="Start now" disabled={disabled} />
        <FormControlLabel value="later" control={<Radio />} label="Later" disabled={disabled} />
        <FormControlLabel
          value="recurring"
          control={<Radio />}
          label="Repeat"
          disabled={disabled}
        />
      </RadioGroup>
      {mode === 'later' && (
        <TextField
          label={`Start at (${timezone})`}
          type="datetime-local"
          value={toLocalInput(value.startAt, timezone)}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...value, startAt: fromLocalInput(e.target.value, timezone) })
          }
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ maxWidth: 320 }}
        />
      )}
      {mode === 'recurring' && recurrence && (
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <RadioGroup
              row
              value={recurrence.freq}
              onChange={(e) =>
                onChange({
                  ...value,
                  recurrence: { ...recurrence, freq: e.target.value as 'daily' | 'weekly' },
                })
              }
              aria-label="Repeat"
            >
              <FormControlLabel
                value="daily"
                control={<Radio />}
                label="Daily"
                disabled={disabled}
              />
              <FormControlLabel
                value="weekly"
                control={<Radio />}
                label="Weekly"
                disabled={disabled}
              />
            </RadioGroup>
            <TextField
              label={`At (${timezone})`}
              type="time"
              value={recurrence.time}
              disabled={disabled}
              onChange={(e) =>
                onChange({ ...value, recurrence: { ...recurrence, time: e.target.value } })
              }
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
          {recurrence.freq === 'weekly' && (
            <ToggleButtonGroup
              size="small"
              value={recurrence.days}
              disabled={disabled}
              onChange={(_e, days: number[]) =>
                onChange({ ...value, recurrence: { ...recurrence, days: [...days].sort() } })
              }
              aria-label="Repeat on"
            >
              {DAY_SHORT.map((d, i) => (
                <ToggleButton key={d} value={i} aria-label={d}>
                  {d}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          )}
          <TextField
            label={`Until (optional, ${timezone})`}
            type="datetime-local"
            value={toLocalInput(recurrence.until, timezone)}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                ...value,
                recurrence: { ...recurrence, until: fromLocalInput(e.target.value, timezone) },
              })
            }
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ maxWidth: 320 }}
          />
        </Stack>
      )}
      {end}
      {problems.map((p) => (
        <Typography key={p} variant="caption" color="error">
          {p}
        </Typography>
      ))}
    </Stack>
  );
}
