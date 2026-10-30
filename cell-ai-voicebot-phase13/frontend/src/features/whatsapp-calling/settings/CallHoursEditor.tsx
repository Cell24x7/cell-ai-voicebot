import Add from '@mui/icons-material/Add';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import type { WhatsAppCallHours, WhatsAppCallHoursEntry } from '@/services/api/types';

import {
  CALL_HOURS_LIMITS,
  DAY_LABELS,
  fromInputTime,
  toInputTime,
  WEEK_DAYS,
} from '../call-hours';

/** IANA zones the browser knows (Meta takes the same names). */
const zones = (): string[] => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['Asia/Kolkata', 'UTC'];
  }
};

function TimeField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (hhmm: string) => void;
}) {
  return (
    <TextField
      type="time"
      size="small"
      label={label}
      value={toInputTime(value)}
      disabled={disabled}
      onChange={(e) => onChange(fromInputTime(e.target.value))}
      slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 60 } }}
      sx={{ width: 130 }}
    />
  );
}

/**
 * Meta's call hours: a week grid (≤ 2 ranges a day), holidays that replace a day
 * (≤ 20) and the number's time zone. Customers can only call inside these hours.
 */
export function CallHoursEditor({
  value,
  disabled,
  onChange,
}: {
  value: WhatsAppCallHours;
  disabled: boolean;
  onChange: (next: WhatsAppCallHours) => void;
}) {
  const set = (patch: Partial<WhatsAppCallHours>) => onChange({ ...value, ...patch });
  const ranges = (day: WhatsAppCallHoursEntry['day']) =>
    value.weekly.map((e, i) => ({ e, i })).filter(({ e }) => e.day === day);
  const setRange = (index: number, patch: Partial<WhatsAppCallHoursEntry>) =>
    set({ weekly: value.weekly.map((e, i) => (i === index ? { ...e, ...patch } : e)) });
  return (
    <Stack spacing={1.5} component="fieldset" sx={{ border: 0, p: 0, m: 0 }}>
      <FormControlLabel
        control={
          <Switch
            checked={value.enabled}
            disabled={disabled}
            onChange={(e) => set({ enabled: e.target.checked })}
          />
        }
        label="Only take calls during call hours"
      />
      {value.enabled && (
        <>
          <Autocomplete
            size="small"
            options={zones()}
            value={value.timezone}
            disabled={disabled}
            disableClearable
            onChange={(_e, tz) => set({ timezone: tz })}
            renderInput={(params) => <TextField {...params} label="Time zone" />}
          />
          <Stack spacing={1} role="group" aria-label="Weekly hours">
            {WEEK_DAYS.map((day) => {
              const list = ranges(day);
              return (
                <Stack
                  key={day}
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}
                >
                  <Typography variant="body2" sx={{ width: 40 }}>
                    {DAY_LABELS[day]}
                  </Typography>
                  {list.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      Closed
                    </Typography>
                  )}
                  {list.map(({ e, i }) => (
                    <Stack key={i} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                      <TimeField
                        label="Opens"
                        value={e.open}
                        disabled={disabled}
                        onChange={(open) => setRange(i, { open })}
                      />
                      <TimeField
                        label="Closes"
                        value={e.close}
                        disabled={disabled}
                        onChange={(close) => setRange(i, { close })}
                      />
                      <IconButton
                        size="small"
                        aria-label={`Remove ${DAY_LABELS[day]} range`}
                        disabled={disabled}
                        onClick={() => set({ weekly: value.weekly.filter((_x, k) => k !== i) })}
                      >
                        <DeleteOutlined fontSize="small" />
                      </IconButton>
                    </Stack>
                  ))}
                  {list.length < CALL_HOURS_LIMITS.entriesPerDayMax && (
                    <IconButton
                      size="small"
                      aria-label={`Add ${DAY_LABELS[day]} range`}
                      disabled={disabled}
                      onClick={() =>
                        set({
                          weekly: [
                            ...value.weekly,
                            list.length
                              ? { day, open: '1400', close: '1800' }
                              : { day, open: '0900', close: '1800' },
                          ],
                        })
                      }
                    >
                      <Add fontSize="small" />
                    </IconButton>
                  )}
                </Stack>
              );
            })}
          </Stack>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            Holidays
          </Typography>
          {value.holidays.map((h, i) => (
            <Stack
              key={i}
              direction="row"
              spacing={0.5}
              sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}
            >
              <TextField
                type="date"
                size="small"
                label="Date"
                value={h.date}
                disabled={disabled}
                slotProps={{ inputLabel: { shrink: true } }}
                onChange={(e) =>
                  set({
                    holidays: value.holidays.map((x, k) =>
                      k === i ? { ...x, date: e.target.value } : x,
                    ),
                  })
                }
              />
              <TimeField
                label="From"
                value={h.start}
                disabled={disabled}
                onChange={(start) =>
                  set({ holidays: value.holidays.map((x, k) => (k === i ? { ...x, start } : x)) })
                }
              />
              <TimeField
                label="To"
                value={h.end}
                disabled={disabled}
                onChange={(end) =>
                  set({ holidays: value.holidays.map((x, k) => (k === i ? { ...x, end } : x)) })
                }
              />
              <IconButton
                size="small"
                aria-label="Remove holiday"
                disabled={disabled}
                onClick={() => set({ holidays: value.holidays.filter((_x, k) => k !== i) })}
              >
                <DeleteOutlined fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          {value.holidays.length < CALL_HOURS_LIMITS.holidaysMax && (
            <Button
              size="small"
              startIcon={<Add />}
              disabled={disabled}
              sx={{ alignSelf: 'flex-start' }}
              onClick={() =>
                set({ holidays: [...value.holidays, { date: '', start: '0000', end: '2359' }] })
              }
            >
              Add holiday
            </Button>
          )}
          <Typography variant="caption" color="text.secondary">
            A holiday replaces that day&apos;s weekly hours: customers can call only between the
            times you set for it.
          </Typography>
        </>
      )}
    </Stack>
  );
}
