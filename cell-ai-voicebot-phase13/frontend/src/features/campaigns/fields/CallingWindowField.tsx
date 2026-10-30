import {
  Alert,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';

import type { CampaignWindow } from '@/services/api/types';

import { DAY_SHORT } from '../labels';
import { intersectWindows } from '../time';

export interface CallingWindowFieldProps {
  value: CampaignWindow;
  onChange: (value: CampaignWindow) => void;
  label?: string;
  disabled?: boolean;
  /** The account window — the effective window (∩) is shown under the field. */
  accountWindow?: CampaignWindow;
  /** Compliance bound for live calls (e.g. TRAI 09:00–21:00), also intersected. */
  bound?: { start: string; end: string; label: string };
}

const dayList = (days: number[]) =>
  days.length === 7 ? 'every day' : days.map((d) => DAY_SHORT[d]).join(', ');

/** Days (Sun–Sat) + start / end; shows the window that really applies. */
export function CallingWindowField({
  value,
  onChange,
  label = 'Calling window',
  disabled = false,
  accountWindow,
  bound,
}: CallingWindowFieldProps) {
  const badTimes = value.start >= value.end;
  const noDays = value.days.length === 0;
  const withAccount = accountWindow ? intersectWindows(value, accountWindow) : value;
  const effective = withAccount && bound ? intersectWindows(withAccount, bound) : withAccount;
  const narrowed =
    effective &&
    (effective.start !== value.start ||
      effective.end !== value.end ||
      effective.days.length !== value.days.length);
  return (
    <div>
      <Typography variant="subtitle2" gutterBottom>
        {label}
      </Typography>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ alignItems: { sm: 'flex-start' } }}
      >
        <TextField
          label="From"
          type="time"
          value={value.start}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, start: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="To"
          type="time"
          value={value.end}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, end: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
          error={badTimes}
          helperText={badTimes ? 'Must be after the start' : ' '}
        />
        <div>
          <ToggleButtonGroup
            size="small"
            value={value.days}
            disabled={disabled}
            onChange={(_e, days: number[]) => onChange({ ...value, days: [...days].sort() })}
            aria-label="Calling days"
          >
            {DAY_SHORT.map((d, i) => (
              <ToggleButton key={d} value={i} aria-label={d}>
                {d}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          {noDays && (
            <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
              Pick at least one day
            </Typography>
          )}
        </div>
      </Stack>
      {!badTimes && !noDays && (accountWindow || bound) && (
        <Alert severity={effective ? (narrowed ? 'info' : 'success') : 'warning'} sx={{ mt: 1 }}>
          {effective
            ? `Calls go out ${effective.start}–${effective.end}, ${dayList(effective.days)}${
                narrowed
                  ? ' (narrowed by the account window' + (bound ? ` and ${bound.label}` : '') + ')'
                  : ''
              }.`
            : 'This window does not overlap the account window' +
              (bound ? ` and ${bound.label}` : '') +
              ' — no call could go out.'}
        </Alert>
      )}
    </div>
  );
}
