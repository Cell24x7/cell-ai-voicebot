import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { agentsApi } from '@/services/api/agents';
import { getErrorMessage } from '@/services/api/errors';
import type { Agent, AgentFunction } from '@/services/api/types';

import { prettyResult, testArgs, toolErrorText } from './function-draft';

/** Run one function for real (through the same safe executor the AI uses). */
export function FunctionTestDialog({
  agent,
  fn,
  open,
  onClose,
}: {
  agent: Agent;
  fn: AgentFunction;
  open: boolean;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [who, setWho] = useState<'phone' | 'none'>('phone');
  const [phone, setPhone] = useState('+91');
  const run = useMutation({
    mutationFn: () =>
      agentsApi.testFunction(agent.id, fn.id, {
        args: testArgs(fn.parameters, values),
        ...(who === 'phone' && /^\+[1-9]\d{6,14}$/.test(phone) ? { testPhone: phone } : {}),
      }),
  });
  const result = run.data;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Test {fn.name}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {fn.parameters.map((p) =>
            p.type === 'boolean' || p.type === 'enum' ? (
              <TextField
                key={p.name}
                select
                label={`${p.name}${p.required ? ' *' : ''}`}
                value={values[p.name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [p.name]: e.target.value }))}
                helperText={p.description}
              >
                {(p.type === 'boolean' ? ['true', 'false'] : (p.enumValues ?? [])).map((o) => (
                  <MenuItem key={o} value={o}>
                    {o}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <TextField
                key={p.name}
                label={`${p.name}${p.required ? ' *' : ''}`}
                type={p.type === 'string' ? 'text' : 'number'}
                value={values[p.name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [p.name]: e.target.value }))}
                helperText={p.description}
              />
            ),
          )}
          <RadioGroup
            row
            value={who}
            onChange={(e) => setWho(e.target.value as 'phone' | 'none')}
            aria-label="Contact for the test"
          >
            <FormControlLabel value="phone" control={<Radio />} label="Use a test phone" />
            <FormControlLabel value="none" control={<Radio />} label="No contact" />
          </RadioGroup>
          {who === 'phone' && (
            <TextField
              label="Test phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ''))}
              helperText="Fills {{contact.phone}} — e.g. +919000000002 (mock API: even = paid, odd = unpaid)"
            />
          )}
          {run.isError && <Alert severity="error">{getErrorMessage(run.error)}</Alert>}
          {result && (
            <Stack spacing={1} role="status" aria-label="Test result">
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Chip
                  size="small"
                  color={result.ok ? 'success' : 'error'}
                  label={result.ok ? 'OK' : 'Failed'}
                />
                {result.httpStatus !== null && (
                  <Chip size="small" variant="outlined" label={`HTTP ${result.httpStatus}`} />
                )}
                <Chip size="small" variant="outlined" label={`${result.durationMs} ms`} />
              </Stack>
              {result.error && (
                <Alert severity="error">
                  {toolErrorText(result.error)}
                  {result.details?.length ? (
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {result.details.map((d) => (
                        <li key={d.path}>
                          {d.path || 'arguments'}: {d.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Alert>
              )}
              {result.warnings.map((w) => (
                <Alert key={w} severity="warning">
                  {w.startsWith('missing:')
                    ? `No value for {{${w.slice(8)}}} — sent empty`
                    : w === 'result_path_not_found'
                      ? 'The result path was not found in the answer'
                      : w}
                </Alert>
              ))}
              {result.ok && (
                <>
                  <Typography variant="subtitle2">What the AI would see</Typography>
                  <Box
                    component="pre"
                    aria-label="Function result"
                    sx={{
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'monospace',
                      fontSize: 13,
                      bgcolor: 'action.hover',
                      p: 1.5,
                      borderRadius: 1,
                      m: 0,
                      maxHeight: 280,
                      overflow: 'auto',
                    }}
                  >
                    {prettyResult(result.result)}
                  </Box>
                </>
              )}
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" onClick={() => run.mutate()} disabled={run.isPending}>
          Run test
        </Button>
      </DialogActions>
    </Dialog>
  );
}
