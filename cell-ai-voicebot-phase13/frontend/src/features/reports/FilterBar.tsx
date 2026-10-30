import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { useCan } from '@/features/auth/hooks';
import { agentsApi } from '@/services/api/agents';
import { campaignsApi } from '@/services/api/campaigns';
import { flowsApi } from '@/services/api/flows';
import { teamApi } from '@/services/api/team';
import { whatsappApi } from '@/services/api/whatsapp';

import {
  PRESETS,
  presetRange,
  rangeProblem,
  SLICES,
  type Preset,
  type ReportFilters,
  type SliceKey,
} from './filters';

const PERMISSION: Record<SliceKey, string> = {
  campaignId: 'campaigns.read',
  flowId: 'flows.read',
  agentId: 'agents.read',
  userId: 'team.read',
  channelId: 'whatsapp.read',
};

type Option = { id: string; label: string };

const loadOptions = async (key: SliceKey): Promise<Option[]> => {
  switch (key) {
    case 'campaignId':
      return (await campaignsApi.list({ limit: 100 })).data.map((c) => ({
        id: c.id,
        label: c.name,
      }));
    case 'flowId':
      return (await flowsApi.list({ limit: 100 })).data.map((f) => ({ id: f.id, label: f.name }));
    case 'agentId':
      return (await agentsApi.list({ limit: 100 })).data.map((a) => ({ id: a.id, label: a.name }));
    case 'userId':
      return (await teamApi.list({ limit: 100 })).data.map((u) => ({ id: u.id, label: u.name }));
    case 'channelId':
      return (await whatsappApi.channels()).items.map((c) => ({ id: c.id, label: c.label }));
  }
};

/** The slice list of one kind (only fetched when that kind is chosen). */
function SlicePicker({
  sliceKey,
  value,
  onChange,
}: {
  sliceKey: SliceKey;
  value: string;
  onChange: (id: string) => void;
}) {
  const options = useQuery({
    queryKey: ['reports', 'slice-options', sliceKey],
    queryFn: () => loadOptions(sliceKey),
    staleTime: 60_000,
    meta: { silent: true },
  });
  const label = SLICES.find((s) => s.key === sliceKey)?.label ?? '';
  return (
    <TextField
      select
      size="small"
      label={label}
      sx={{ minWidth: 200 }}
      value={options.data?.some((o) => o.id === value) ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={options.isPending}
      helperText={options.isError ? 'Could not load the list' : undefined}
      slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
    >
      <MenuItem value="" disabled>
        {options.isPending ? 'Loading…' : `Choose a ${label.toLowerCase()}`}
      </MenuItem>
      {(options.data ?? []).map((o) => (
        <MenuItem key={o.id} value={o.id}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

/** Report filters (all in the URL): range, compare, calls channel, one slice, test calls. */
export function FilterBar({
  filters,
  today,
  timezone,
  onChange,
}: {
  filters: ReportFilters;
  today: string;
  timezone: string;
  onChange: (next: ReportFilters) => void;
}) {
  const can = useCan();
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [sliceKey, setSliceKey] = useState<SliceKey | ''>(filters.slice?.key ?? '');
  const problem = filters.preset === 'custom' ? rangeProblem(from, to) : null;
  const kinds = SLICES.filter((s) => can(PERMISSION[s.key]));
  const set = (patch: Partial<ReportFilters>) => onChange({ ...filters, ...patch });

  const choosePreset = (preset: Preset) => {
    if (preset === 'custom') {
      set({ preset, from, to });
      return;
    }
    const range = presetRange(preset, today);
    setFrom(range.from);
    setTo(range.to);
    set({ preset, ...range });
  };

  return (
    <Stack spacing={1}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ alignItems: { md: 'center' }, flexWrap: 'wrap' }}
        useFlexGap
      >
        <TextField
          select
          size="small"
          label="Period"
          sx={{ minWidth: 160 }}
          value={filters.preset}
          onChange={(e) => choosePreset(e.target.value as Preset)}
        >
          {PRESETS.map((p) => (
            <MenuItem key={p.key} value={p.key}>
              {p.label}
            </MenuItem>
          ))}
        </TextField>
        {filters.preset === 'custom' && (
          <>
            <TextField
              type="date"
              size="small"
              label="From"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              type="date"
              size="small"
              label="To"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              error={Boolean(problem)}
              helperText={problem ?? undefined}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Button onClick={() => set({ from, to })} disabled={Boolean(problem)}>
              Apply
            </Button>
          </>
        )}
        <FormControlLabel
          control={
            <Switch
              checked={filters.compare}
              onChange={(e) => set({ compare: e.target.checked })}
            />
          }
          label="Compare with the period before"
        />
        <TextField
          select
          size="small"
          label="Calls"
          sx={{ minWidth: 150 }}
          value={filters.channel ?? ''}
          onChange={(e) => set({ channel: (e.target.value || null) as ReportFilters['channel'] })}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
        >
          <MenuItem value="">Phone + WhatsApp</MenuItem>
          <MenuItem value="voice">Phone / web only</MenuItem>
          <MenuItem value="whatsapp">WhatsApp only</MenuItem>
        </TextField>
        {kinds.length > 0 && (
          <TextField
            select
            size="small"
            label="Show one"
            sx={{ minWidth: 170 }}
            value={sliceKey}
            onChange={(e) => {
              const key = e.target.value as SliceKey | '';
              setSliceKey(key);
              if (!key) set({ slice: null });
            }}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value="">Everything</MenuItem>
            {kinds.map((s) => (
              <MenuItem key={s.key} value={s.key}>
                {s.label}
              </MenuItem>
            ))}
          </TextField>
        )}
        {sliceKey && (
          <SlicePicker
            key={sliceKey}
            sliceKey={sliceKey}
            value={filters.slice?.key === sliceKey ? filters.slice.id : ''}
            onChange={(id) => set({ slice: { key: sliceKey, id } })}
          />
        )}
        <FormControlLabel
          control={
            <Switch
              checked={filters.includeTest}
              onChange={(e) => set({ includeTest: e.target.checked })}
            />
          }
          label="Include test calls"
        />
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {filters.from === filters.to ? filters.from : `${filters.from} – ${filters.to}`} · days in{' '}
        {timezone} · updated about once a minute
      </Typography>
    </Stack>
  );
}
