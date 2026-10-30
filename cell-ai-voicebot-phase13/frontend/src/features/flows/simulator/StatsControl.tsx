import InsightsOutlined from '@mui/icons-material/InsightsOutlined';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

import type { StatsSelection } from './stats';

export function StatsControl({
  value,
  onChange,
  publishedVersion,
}: {
  value: StatsSelection;
  onChange: (next: StatsSelection) => void;
  publishedVersion: number | null;
}) {
  const versions = publishedVersion
    ? Array.from({ length: publishedVersion }, (_x, i) => publishedVersion - i)
    : [];
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Button
        startIcon={<InsightsOutlined />}
        variant={value.on ? 'contained' : 'text'}
        onClick={() => onChange({ ...value, on: !value.on })}
        aria-pressed={value.on}
      >
        Stats
      </Button>
      {value.on && (
        <>
          <TextField
            select
            size="small"
            label="Stats of"
            value={String(value.version)}
            onChange={(e) =>
              onChange({
                ...value,
                version: e.target.value === 'draft' ? 'draft' : Number(e.target.value),
              })
            }
            sx={{ minWidth: 110 }}
          >
            <MenuItem value="draft">Draft</MenuItem>
            {versions.map((v) => (
              <MenuItem key={v} value={String(v)}>
                v{v}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Range"
            value={String(value.days)}
            onChange={(e) => onChange({ ...value, days: e.target.value === '30' ? 30 : 7 })}
            sx={{ minWidth: 110 }}
          >
            <MenuItem value="7">7 days</MenuItem>
            <MenuItem value="30">30 days</MenuItem>
          </TextField>
        </>
      )}
    </Stack>
  );
}
