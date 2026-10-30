import AddOutlined from '@mui/icons-material/AddOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { agentsApi } from '@/services/api/agents';
import { getErrorMessage } from '@/services/api/errors';
import type { Agent, BuiltInTools, Disposition } from '@/services/api/types';

import { DISPOSITION_LABELS } from '../agent-form';

/** Built-in tools: switches and their settings (saved on their own). */
export function BuiltInToolsSection({
  agent,
  readOnly,
  onSaved,
}: {
  agent: Agent;
  readOnly: boolean;
  onSaved: (agent: Agent) => void;
}) {
  const [tools, setTools] = useState<BuiltInTools>(agent.builtInTools);
  const dirty = JSON.stringify(tools) !== JSON.stringify(agent.builtInTools);
  const set = <K extends keyof BuiltInTools>(key: K, patch: Partial<BuiltInTools[K]>) =>
    setTools((t) => ({ ...t, [key]: { ...t[key], ...patch } }));
  const save = useMutation({
    mutationFn: () => agentsApi.update(agent.id, { builtInTools: tools }),
    onSuccess: (next) => {
      onSaved(next);
      enqueueSnackbar('Built-in tools saved', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  const toggle = (key: keyof BuiltInTools, label: string, help: string) => (
    <FormControlLabel
      control={
        <Switch
          checked={tools[key].enabled}
          onChange={(e) => set(key, { enabled: e.target.checked })}
          disabled={readOnly}
        />
      }
      label={
        <span>
          {label}
          <Typography
            component="span"
            variant="body2"
            color="text.secondary"
            sx={{ display: 'block' }}
          >
            {help}
          </Typography>
        </span>
      }
    />
  );
  const days = (key: 'scheduleCallback' | 'savePromiseToPay', label: string, max: number) => (
    <TextField
      label={label}
      type="number"
      size="small"
      value={tools[key].maxDaysAhead}
      onChange={(e) => set(key, { maxDaysAhead: Number(e.target.value) })}
      disabled={readOnly || !tools[key].enabled}
      slotProps={{ htmlInput: { min: 1, max } }}
      sx={{ maxWidth: 220, ml: 6 }}
    />
  );

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <div>
          <Typography variant="subtitle1" component="h2">
            Built-in tools
          </Typography>
          <Typography variant="body2" color="text.secondary">
            In the playground these are simulated: they record the outcome but call or message no
            one.
          </Typography>
        </div>
        {toggle(
          'endCall',
          'End the conversation',
          'When the customer wants to stop or the matter is settled',
        )}
        {toggle('transferToHuman', 'Transfer to a person', 'When the customer asks for a human')}
        {tools.transferToHuman.enabled && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ ml: { sm: 6 } }}>
            <TextField
              label="Transfer number"
              size="small"
              value={tools.transferToHuman.phone ?? ''}
              onChange={(e) => set('transferToHuman', { phone: e.target.value.trim() || null })}
              disabled={readOnly}
              helperText="+91… (used on live calls)"
            />
            <TextField
              label="Message before the transfer"
              size="small"
              value={tools.transferToHuman.message ?? ''}
              onChange={(e) => set('transferToHuman', { message: e.target.value || null })}
              disabled={readOnly}
              fullWidth
            />
          </Stack>
        )}
        {toggle('setDisposition', 'Set the outcome', 'The AI records how the conversation ended')}
        {tools.setDisposition.enabled && (
          <Autocomplete
            multiple
            options={Object.keys(DISPOSITION_LABELS) as Disposition[]}
            value={tools.setDisposition.allowed}
            onChange={(_e, v) => set('setDisposition', { allowed: v })}
            getOptionLabel={(d) => DISPOSITION_LABELS[d]}
            disabled={readOnly}
            sx={{ ml: { sm: 6 } }}
            renderInput={(params) => (
              <TextField {...params} label="Allowed outcomes" size="small" />
            )}
          />
        )}
        {toggle(
          'scheduleCallback',
          'Schedule a call back',
          'When the customer asks to be called later',
        )}
        {tools.scheduleCallback.enabled && days('scheduleCallback', 'Within days', 30)}
        {toggle(
          'savePromiseToPay',
          'Save a promise to pay',
          'Date (and amount) the customer promises',
        )}
        {tools.savePromiseToPay.enabled && days('savePromiseToPay', 'Within days', 60)}
        {toggle(
          'sendSmsAfterCall',
          'Send an SMS after the call',
          'One of your approved messages (live from Phase 10)',
        )}
        {tools.sendSmsAfterCall.enabled && (
          <Stack spacing={1} sx={{ ml: { sm: 6 } }}>
            {tools.sendSmsAfterCall.templates.map((t, i) => (
              <Stack key={i} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  label={`SMS ${i + 1} key`}
                  size="small"
                  value={t.key}
                  onChange={(e) =>
                    set('sendSmsAfterCall', {
                      templates: tools.sendSmsAfterCall.templates.map((x, j) =>
                        j === i ? { ...x, key: e.target.value } : x,
                      ),
                    })
                  }
                  disabled={readOnly}
                />
                <TextField
                  label={`SMS ${i + 1} text`}
                  size="small"
                  fullWidth
                  value={t.text}
                  onChange={(e) =>
                    set('sendSmsAfterCall', {
                      templates: tools.sendSmsAfterCall.templates.map((x, j) =>
                        j === i ? { ...x, text: e.target.value } : x,
                      ),
                    })
                  }
                  disabled={readOnly}
                />
                {!readOnly && (
                  <IconButton
                    aria-label={`Remove SMS ${i + 1}`}
                    onClick={() =>
                      set('sendSmsAfterCall', {
                        templates: tools.sendSmsAfterCall.templates.filter((_, j) => j !== i),
                      })
                    }
                  >
                    <DeleteOutlineOutlined fontSize="small" />
                  </IconButton>
                )}
              </Stack>
            ))}
            {!readOnly && (
              <div>
                <Button
                  size="small"
                  startIcon={<AddOutlined />}
                  onClick={() =>
                    set('sendSmsAfterCall', {
                      templates: [...tools.sendSmsAfterCall.templates, { key: '', text: '' }],
                    })
                  }
                >
                  Add SMS
                </Button>
              </div>
            )}
          </Stack>
        )}
        {!readOnly && (
          <div>
            <Button
              variant="contained"
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending}
            >
              Save tools
            </Button>
          </div>
        )}
      </Stack>
    </Paper>
  );
}
