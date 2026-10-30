import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { Link as RouterLink } from 'react-router';

import { useAgents } from '@/features/agents/queries';

import { NumberInput, SelectInput, TemplateField, Toggle } from '../fields';
import { bool, num, str, strings, type StepFormProps } from '../form-types';

export function AiAgentForm({
  config,
  set,
  errors,
  variables,
  flowVariables,
  allNames,
  readOnly,
}: StepFormProps) {
  const agents = useAgents({ limit: 100 });
  const list = agents.data?.data ?? [];
  const agentId = str(config.agentId);
  const selected = list.find((a) => a.id === agentId);
  const passNames = allNames.length > 0 ? allNames : flowVariables.map((v) => v.name);
  return (
    <Stack spacing={2}>
      <SelectInput
        label="AI agent"
        value={agentId}
        onChange={(id) => set({ agentId: id })}
        options={[
          { value: '', label: agents.isPending ? 'Loading agents…' : 'Choose an agent' },
          ...list.map((a) => ({
            value: a.id,
            label: a.isActive ? a.name : `${a.name} (inactive)`,
          })),
          ...(agentId && !selected && !agents.isPending
            ? [{ value: agentId, label: 'Unknown agent' }]
            : []),
        ]}
        error={errors.agentId}
        readOnly={readOnly}
      />
      {agents.isError && <Alert severity="warning">Couldn’t load your AI agents.</Alert>}
      {selected && !selected.isActive && (
        <Alert severity="warning">
          This agent is inactive — calls will take the Error exit.{' '}
          <Link component={RouterLink} to={`/agents/${selected.id}`}>
            Open agent
          </Link>
        </Alert>
      )}
      {!agents.isPending && list.length === 0 && !agents.isError && (
        <Alert severity="info">
          No AI agents yet.{' '}
          <Link component={RouterLink} to="/agents">
            Create one
          </Link>
        </Alert>
      )}
      <TemplateField
        label="Goal for this step"
        value={str(config.goal)}
        onChange={(goal) => set({ goal })}
        variables={variables}
        error={errors.goal}
        multiline
        maxLength={1000}
        placeholder="e.g. Ask when the customer will pay and confirm the date"
        readOnly={readOnly}
      />
      <Autocomplete
        multiple
        options={passNames}
        value={strings(config.passVariables)}
        onChange={(_e, value) => set({ passVariables: value.slice(0, 10) })}
        disabled={readOnly}
        renderInput={(params) => (
          <TextField
            {...params}
            size="small"
            label="Share these values with the agent"
            helperText={errors.passVariables ?? 'Up to 10 — phone numbers are never shared'}
            error={Boolean(errors.passVariables)}
          />
        )}
      />
      <NumberInput
        label="Max turns"
        value={num(config.maxTurns, 20)}
        onChange={(maxTurns) => set({ maxTurns })}
        min={1}
        max={50}
        error={errors.maxTurns}
        readOnly={readOnly}
      />
      <Toggle
        label="Agent speaks its opening line"
        checked={bool(config.speakOpeningLine, true)}
        onChange={(speakOpeningLine) => set({ speakOpeningLine })}
        readOnly={readOnly}
      />
    </Stack>
  );
}
