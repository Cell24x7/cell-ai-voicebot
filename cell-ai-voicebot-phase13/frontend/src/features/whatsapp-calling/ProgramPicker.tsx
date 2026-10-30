import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

import { useAgents } from '@/features/agents/queries';
import { useFlows } from '@/features/flows/queries';
import type { WhatsAppCallProgram } from '@/services/api/types';

/**
 * The AI program of a WhatsApp call: a published flow or an active AI agent (what the
 * server accepts — PHASE_12_PLAN §1e). Used by the inbound route and "Call with AI".
 */
export function ProgramPicker({
  value,
  onChange,
  disabled = false,
  error,
}: {
  value: WhatsAppCallProgram | null;
  onChange: (program: WhatsAppCallProgram | null) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const flows = useFlows({ status: 'published', limit: 100 });
  const agents = useAgents({ activeOnly: true, limit: 50 });
  const runnableFlows = (flows.data?.data ?? []).filter((f) => f.publishedVersion);
  const kind = value?.kind ?? 'flow';
  const options =
    kind === 'flow'
      ? runnableFlows.map((f) => ({ id: f.id, name: f.name }))
      : (agents.data?.data ?? []).map((a) => ({ id: a.id, name: a.name }));
  const known = options.some((o) => o.id === value?.id);
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
      <TextField
        select
        size="small"
        label="AI program"
        value={kind}
        disabled={disabled}
        sx={{ minWidth: 140 }}
        onChange={(e) => {
          const next = e.target.value as WhatsAppCallProgram['kind'];
          // a new kind starts without a program chosen
          if (next !== kind) onChange({ kind: next, id: '' });
        }}
      >
        <MenuItem value="flow">Flow</MenuItem>
        <MenuItem value="agent">AI agent</MenuItem>
      </TextField>
      <TextField
        select
        size="small"
        fullWidth
        label={kind === 'flow' ? 'Published flow' : 'Active AI agent'}
        value={known ? (value?.id ?? '') : ''}
        disabled={disabled}
        error={Boolean(error)}
        helperText={
          error ??
          (options.length === 0
            ? kind === 'flow'
              ? 'Publish a flow first.'
              : 'Turn on an AI agent first.'
            : ' ')
        }
        onChange={(e) => onChange({ kind, id: e.target.value })}
      >
        {options.map((o) => (
          <MenuItem key={o.id} value={o.id}>
            {o.name}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  );
}
