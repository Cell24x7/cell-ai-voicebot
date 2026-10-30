import {
  Alert,
  FormControlLabel,
  FormHelperText,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';

import { useFlows, useFlowVersions } from '@/features/flows/queries';

import { isLocked, LIMITS, type LockRule, type WizardDraft } from './draft';

export interface StepProps {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
  lock: LockRule;
}

export const LOCKED_HINT = "Can't change this once the campaign started";

/** Name, mode (live waits for phone lines), flow (published, campaign trigger) and version. */
export function BasicsStep({ draft, onChange, lock }: StepProps) {
  const flows = useFlows({ status: 'published', limit: 100 });
  const usable = (flows.data?.data ?? []).filter(
    (f) => f.publishedVersion && f.triggers.includes('campaign'),
  );
  const versions = useFlowVersions(draft.flowId);
  const selected = usable.find((f) => f.id === draft.flowId);
  const flowLocked = isLocked(lock, 'flow');
  return (
    <Stack spacing={3}>
      <TextField
        label="Campaign name"
        value={draft.name}
        required
        disabled={isLocked(lock, 'name')}
        onChange={(e) => onChange({ name: e.target.value })}
        slotProps={{ htmlInput: { maxLength: LIMITS.nameMax } }}
      />
      <div>
        <Typography variant="subtitle2">Mode</Typography>
        <RadioGroup
          row
          value={draft.mode}
          onChange={(e) => onChange({ mode: e.target.value as WizardDraft['mode'] })}
          aria-label="Mode"
        >
          <FormControlLabel
            value="dry_run"
            control={<Radio />}
            label="Dry run (simulated calls)"
            disabled={isLocked(lock, 'mode')}
          />
          <Tooltip title="Needs a phone line (SIP) — coming with phone numbers">
            <span>
              <FormControlLabel value="live" control={<Radio />} label="Live calls" disabled />
            </span>
          </Tooltip>
        </RadioGroup>
        <FormHelperText>
          A dry run goes through the real flow with simulated customers and virtual time — no phone
          is called and nothing is charged.
        </FormHelperText>
      </div>
      <Tooltip title={flowLocked ? LOCKED_HINT : ''}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            select
            label="Flow"
            value={usable.some((f) => f.id === draft.flowId) ? draft.flowId : ''}
            disabled={flowLocked || flows.isPending}
            onChange={(e) => onChange({ flowId: e.target.value, chosenVersion: null })}
            sx={{ minWidth: 280 }}
            helperText={
              flows.isSuccess && !usable.length
                ? 'Publish a flow whose start step allows campaigns first.'
                : 'Published flows that can start from a campaign'
            }
          >
            {usable.map((f) => (
              <MenuItem key={f.id} value={f.id}>
                {f.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Version"
            value={draft.chosenVersion ?? 'latest'}
            disabled={flowLocked || !selected}
            onChange={(e) =>
              onChange({
                chosenVersion: e.target.value === 'latest' ? null : Number(e.target.value),
              })
            }
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="latest">
              Latest{selected?.publishedVersion ? ` (v${String(selected.publishedVersion)})` : ''}
            </MenuItem>
            {(versions.data ?? []).map((v) => (
              <MenuItem key={v.version} value={v.version}>
                v{v.version}
                {v.notes ? ` — ${v.notes}` : ''}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Tooltip>
      {selected && (
        <Alert severity="info">
          {selected.name}: {selected.nodesCount} steps
          {selected.agents.length
            ? `, AI agent ${selected.agents.map((a) => a.name).join(', ')}`
            : ''}
          . The version is pinned when the campaign starts.
        </Alert>
      )}
    </Stack>
  );
}
