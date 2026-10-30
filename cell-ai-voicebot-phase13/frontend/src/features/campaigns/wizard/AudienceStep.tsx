import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { useCustomFields, useListOptions, useSegments } from '@/features/contacts/queries';
import { fromFilter, toContactFilter } from '@/features/segments/segment-filter';
import { SegmentBuilder } from '@/features/segments/SegmentBuilder';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { contactsApi } from '@/services/api/contacts';
import { getErrorMessage } from '@/services/api/errors';

import { skipReasonLabel } from '../labels';
import { useAudiencePreview } from '../queries';

import type { StepProps } from './BasicsStep';
import { MAX_PICKED, previewBody, type AudienceMode } from './draft';

const MODES: { value: AudienceMode; label: string }[] = [
  { value: 'lists', label: 'Lists' },
  { value: 'segment', label: 'Segment' },
  { value: 'filter', label: 'Custom filter' },
  { value: 'pick', label: 'Pick contacts' },
];

/** Search + tick contacts (up to 1,000); names only, no phones. */
function PickContactsDialog({
  open,
  initial,
  onClose,
  onDone,
}: {
  open: boolean;
  initial: string[];
  onClose: () => void;
  onDone: (ids: string[]) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initial));
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const results = useQuery({
    queryKey: ['campaigns', 'pick-contacts', q],
    queryFn: () => contactsApi.list({ limit: 50, ...(q ? { q } : {}) }),
    enabled: open,
  });
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else if (next.size < MAX_PICKED) next.add(id);
    setPicked(next);
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Pick contacts</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          size="small"
          label="Search by name or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ mt: 1 }}
        />
        {results.isPending && <CircularProgress size={20} sx={{ mt: 2 }} />}
        {results.error && <Alert severity="error">{getErrorMessage(results.error)}</Alert>}
        <List dense>
          {(results.data?.data ?? []).map((c) => (
            <ListItemButton key={c.id} onClick={() => toggle(c.id)}>
              <ListItemIcon>
                <Checkbox edge="start" checked={picked.has(c.id)} tabIndex={-1} disableRipple />
              </ListItemIcon>
              <ListItemText
                primary={c.name ?? 'No name'}
                secondary={`••••${c.phoneE164.slice(-4)}`}
              />
            </ListItemButton>
          ))}
        </List>
        <Typography variant="caption" color="text.secondary">
          {picked.size} picked (up to {MAX_PICKED})
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => onDone([...picked])}>
          Use {picked.size} contacts
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Who to call: lists, a segment, a custom filter or picked contacts — with a live preview. */
export function AudienceStep({ draft, onChange, lock }: StepProps) {
  const locked = lock === 'live' || lock === 'all';
  const lists = useListOptions();
  const segments = useSegments();
  const fields = useCustomFields();
  const preview = useAudiencePreview(previewBody(draft));
  const [picking, setPicking] = useState(false);
  const fieldList = fields.data ?? [];
  const p = preview.data;
  return (
    <Stack spacing={3}>
      {locked && <Alert severity="info">The audience was copied when the campaign started.</Alert>}
      <RadioGroup
        row
        value={draft.audienceMode}
        onChange={(e) => onChange({ audienceMode: e.target.value as AudienceMode })}
        aria-label="Audience"
      >
        {MODES.map((m) => (
          <FormControlLabel
            key={m.value}
            value={m.value}
            control={<Radio />}
            label={m.label}
            disabled={locked}
          />
        ))}
      </RadioGroup>

      {draft.audienceMode === 'lists' && (
        <Autocomplete
          multiple
          options={lists.data ?? []}
          getOptionLabel={(l) => `${l.name} (${String(l.contactCount ?? 0)})`}
          value={(lists.data ?? []).filter((l) => draft.listIds.includes(l.id))}
          onChange={(_e, v) => onChange({ listIds: v.map((l) => l.id) })}
          disabled={locked}
          renderInput={(params) => <TextField {...params} label="Lists" />}
        />
      )}
      {draft.audienceMode === 'segment' && (
        <TextField
          select
          label="Segment"
          value={draft.segmentId ?? ''}
          disabled={locked}
          onChange={(e) => onChange({ segmentId: e.target.value || null })}
          sx={{ maxWidth: 360 }}
        >
          {(segments.data ?? []).map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name}
            </MenuItem>
          ))}
        </TextField>
      )}
      {draft.audienceMode === 'filter' && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <SegmentBuilder
            value={fromFilter(draft.filter)}
            fields={fieldList}
            onChange={(state) => onChange({ filter: toContactFilter(state, fieldList) })}
          />
        </Paper>
      )}
      {draft.audienceMode === 'pick' && (
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Button variant="outlined" onClick={() => setPicking(true)} disabled={locked}>
            Pick contacts
          </Button>
          <Typography variant="body2">{draft.contactIds.length} picked</Typography>
          {picking && (
            <PickContactsDialog
              open
              initial={draft.contactIds}
              onClose={() => setPicking(false)}
              onDone={(ids) => {
                onChange({ contactIds: ids });
                setPicking(false);
              }}
            />
          )}
        </Stack>
      )}

      <FormControlLabel
        control={
          <Switch
            checked={draft.excludeActiveCampaigns}
            disabled={locked}
            onChange={(e) => onChange({ excludeActiveCampaigns: e.target.checked })}
          />
        }
        label="Skip contacts that are in another active campaign"
      />

      <Paper variant="outlined" sx={{ p: 2 }} aria-label="Audience preview">
        <Typography variant="subtitle2" gutterBottom>
          Preview
        </Typography>
        {!previewBody(draft) && (
          <Typography variant="body2" color="text.secondary">
            Choose a flow and who to call to see the numbers.
          </Typography>
        )}
        {previewBody(draft) && preview.isPending && <CircularProgress size={20} />}
        {preview.error && <Alert severity="error">{getErrorMessage(preview.error)}</Alert>}
        {p && (
          <Stack spacing={1.5}>
            <Typography variant="h6">
              {p.willCall} of {p.total} contacts will be called
            </Typography>
            {p.total === 0 && (
              <Alert severity="warning">
                Nobody matches — the campaign would have no one to call.
              </Alert>
            )}
            {p.tooMany && <Alert severity="error">Too many contacts for one campaign.</Alert>}
            {Object.entries(p.excluded).some(([, n]) => n > 0) && (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Skipped
                </Typography>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                  {Object.entries(p.excluded)
                    .filter(([, n]) => n > 0)
                    .map(([reason, n]) => (
                      <Chip
                        key={reason}
                        size="small"
                        label={`${skipReasonLabel(reason) ?? reason}: ${String(n)}`}
                      />
                    ))}
                </Stack>
              </Box>
            )}
            {p.missing.map((m) => (
              <FormControlLabel
                key={m.field}
                control={
                  <Switch
                    checked={draft.skipIfMissing.includes(m.field)}
                    disabled={locked}
                    onChange={(e) =>
                      onChange({
                        skipIfMissing: e.target.checked
                          ? [...draft.skipIfMissing, m.field]
                          : draft.skipIfMissing.filter((f) => f !== m.field),
                      })
                    }
                  />
                }
                label={`${String(m.count)} without ${m.label} — skip them`}
              />
            ))}
            {p.samples.length > 0 && (
              <Typography variant="body2" color="text.secondary">
                For example:{' '}
                {p.samples.map((s) => `${s.name ?? 'No name'} ••••${s.phoneLast4}`).join(', ')}
              </Typography>
            )}
          </Stack>
        )}
      </Paper>
    </Stack>
  );
}
