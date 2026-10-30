import AddOutlined from '@mui/icons-material/AddOutlined';
import ArrowDownwardOutlined from '@mui/icons-material/ArrowDownwardOutlined';
import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { JsonTemplateField } from '@/components/fields/JsonTemplateField';
import { SecretField } from '@/components/fields/SecretField';
import { jsonTemplateError } from '@/components/fields/text-utils';
import { VariablePicker, type PickerVariable } from '@/components/fields/VariablePicker';
import { agentsApi } from '@/services/api/agents';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import type { Agent, AgentFunction, AgentFunctionParam, AgentVariable } from '@/services/api/types';

import {
  emptyDraft,
  toDraft,
  toFunctionInput,
  type FunctionDraft,
  type ParamDraft,
} from './function-draft';

const PARAM_TYPES: AgentFunctionParam['type'][] = [
  'string',
  'number',
  'integer',
  'boolean',
  'enum',
];
const PARAMS_MAX = 10;
const HEADERS_MAX = 10;

/** Add / edit one custom API function. */
export function FunctionDialog({
  agent,
  fn,
  variables,
  open,
  onClose,
  onSaved,
}: {
  agent: Agent;
  /** `null` = new function. */
  fn: AgentFunction | null;
  variables: AgentVariable[];
  open: boolean;
  onClose: () => void;
  onSaved: (agent: Agent) => void;
}) {
  const [draft, setDraft] = useState<FunctionDraft>(() => (fn ? toDraft(fn) : emptyDraft()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const urlRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const set = <K extends keyof FunctionDraft>(key: K, value: FunctionDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const setParam = (i: number, patch: Partial<ParamDraft>) =>
    set(
      'parameters',
      draft.parameters.map((p, j) => (j === i ? { ...p, ...patch } : p)),
    );
  const moveParam = (i: number, by: number) => {
    const next = [...draft.parameters];
    const [row] = next.splice(i, 1);
    if (row) next.splice(i + by, 0, row);
    set('parameters', next);
  };

  const save = useMutation({
    mutationFn: () => {
      const body = toFunctionInput(draft);
      return fn
        ? agentsApi.updateFunction(agent.id, fn.id, body)
        : agentsApi.createFunction(agent.id, body);
    },
    onSuccess: onSaved,
    onError: (err) => {
      const e = toApiError(err);
      const next: Record<string, string> = {};
      for (const d of e.details) next[d.path.replace(/^body\./, '')] = d.message;
      setErrors(next);
      setFormError(
        e.code === 'FUNCTION_URL_BLOCKED'
          ? `${e.message.replace(/\.$/, '')}: ${e.details[0]?.message ?? ''}`.replace(/: $/, '')
          : e.details.length
            ? 'Fix the highlighted fields'
            : getErrorMessage(err),
      );
    },
  });

  const submit = () => {
    const local: Record<string, string> = {};
    if (!/^[a-z][a-z0-9_]{2,39}$/.test(draft.name.trim())) {
      local.name = '3–40 characters: a-z, 0-9 and _ (start with a letter)';
    }
    if (draft.description.trim().length < 10)
      local.description = 'Describe it in at least 10 characters';
    const body = draft.method !== 'GET' ? jsonTemplateError(draft.bodyTemplate) : null;
    if (body) local.bodyTemplate = body;
    const timeout = Number(draft.timeoutSec);
    if (!Number.isFinite(timeout) || timeout < 1 || timeout > 10)
      local.timeoutMs = '1 to 10 seconds';
    draft.parameters.forEach((p, i) => {
      if (!/^[a-z][a-z0-9_]{0,39}$/.test(p.name.trim()))
        local[`parameters.${i}.name`] = 'a-z, 0-9 and _';
      if (p.type === 'enum' && !p.enumText.trim())
        local[`parameters.${i}.enumValues`] = 'Add at least one value';
    });
    setErrors(local);
    setFormError(Object.keys(local).length ? 'Fix the highlighted fields' : null);
    if (!Object.keys(local).length) save.mutate();
  };

  const urlVariables: PickerVariable[] = [
    ...draft.parameters
      .filter((p) => p.name.trim())
      .map((p) => ({
        name: `args.${p.name.trim()}`,
        label: p.name,
        hint: `From the AI: ${p.description || p.type}`,
      })),
    {
      name: 'contact.phone',
      label: 'Phone',
      hint: 'Full phone — server only, not shown to the AI',
    },
    { name: 'contact.name', label: 'Name', hint: 'Contact name — server only' },
    {
      name: 'contact.externalId',
      label: 'External id',
      hint: 'Your id for the contact — server only',
    },
    ...variables
      .filter((v) => v.type !== 'built_in')
      .map((v) => ({
        name: `contact.${v.name}`,
        label: v.label,
        hint: `${v.label} — server only`,
      })),
    { name: 'agent.name', label: 'Agent name' },
    { name: 'company', label: 'Company' },
  ];
  const err = (path: string) => errors[path];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle>{fn ? `Edit ${fn.name}` : 'Add function'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Function name"
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              error={Boolean(err('name'))}
              helperText={err('name') ?? 'e.g. check_payment_status — the AI calls it by this name'}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Timeout (seconds)"
              type="number"
              value={draft.timeoutSec}
              onChange={(e) => set('timeoutSec', e.target.value)}
              error={Boolean(err('timeoutMs'))}
              helperText={err('timeoutMs') ?? '1–10'}
              slotProps={{ htmlInput: { min: 1, max: 10, step: 0.5 } }}
              sx={{ width: { sm: 180 } }}
            />
          </Stack>
          <TextField
            label="What it does (the AI reads this)"
            value={draft.description}
            onChange={(e) => set('description', e.target.value)}
            multiline
            minRows={2}
            error={Boolean(err('description'))}
            helperText={err('description') ?? 'When to call it and what it returns'}
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />

          <Divider />
          <Typography variant="subtitle1" component="h3">
            Parameters the AI fills in
          </Typography>
          {draft.parameters.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No parameters — fine when the API only needs the contact (e.g. the phone).
            </Typography>
          )}
          {draft.parameters.map((p, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 1.5 }}>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={1}
                sx={{ alignItems: { md: 'flex-start' } }}
              >
                <TextField
                  label={`Parameter ${i + 1} name`}
                  size="small"
                  value={p.name}
                  onChange={(e) => setParam(i, { name: e.target.value })}
                  error={Boolean(err(`parameters.${i}.name`))}
                  helperText={err(`parameters.${i}.name`)}
                />
                <TextField
                  select
                  label="Type"
                  size="small"
                  value={p.type}
                  onChange={(e) => setParam(i, { type: e.target.value as ParamDraft['type'] })}
                  sx={{ minWidth: 120 }}
                >
                  {PARAM_TYPES.map((t) => (
                    <MenuItem key={t} value={t}>
                      {t}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Description"
                  size="small"
                  value={p.description}
                  onChange={(e) => setParam(i, { description: e.target.value })}
                  sx={{ flex: 1 }}
                />
                {p.type === 'enum' && (
                  <TextField
                    label="Allowed values"
                    size="small"
                    value={p.enumText}
                    onChange={(e) => setParam(i, { enumText: e.target.value })}
                    error={Boolean(err(`parameters.${i}.enumValues`))}
                    helperText={err(`parameters.${i}.enumValues`) ?? 'Comma separated'}
                  />
                )}
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={p.required}
                      onChange={(e) => setParam(i, { required: e.target.checked })}
                    />
                  }
                  label="Required"
                />
                <Stack direction="row">
                  <IconButton
                    aria-label={`Move parameter ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => moveParam(i, -1)}
                  >
                    <ArrowUpwardOutlined fontSize="small" />
                  </IconButton>
                  <IconButton
                    aria-label={`Move parameter ${i + 1} down`}
                    disabled={i === draft.parameters.length - 1}
                    onClick={() => moveParam(i, 1)}
                  >
                    <ArrowDownwardOutlined fontSize="small" />
                  </IconButton>
                  <IconButton
                    aria-label={`Remove parameter ${i + 1}`}
                    onClick={() =>
                      set(
                        'parameters',
                        draft.parameters.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <DeleteOutlineOutlined fontSize="small" />
                  </IconButton>
                </Stack>
              </Stack>
            </Paper>
          ))}
          <div>
            <Button
              startIcon={<AddOutlined />}
              disabled={draft.parameters.length >= PARAMS_MAX}
              onClick={() =>
                set('parameters', [
                  ...draft.parameters,
                  { name: '', type: 'string', description: '', required: true, enumText: '' },
                ])
              }
            >
              Add parameter
            </Button>
          </div>

          <Divider />
          <Typography variant="subtitle1" component="h3">
            Request
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select
              label="Method"
              value={draft.method}
              onChange={(e) => set('method', e.target.value as FunctionDraft['method'])}
              sx={{ width: { sm: 140 } }}
            >
              {(['GET', 'POST', 'PUT', 'PATCH'] as const).map((m) => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="URL"
              value={draft.url}
              onChange={(e) => set('url', e.target.value)}
              inputRef={urlRef}
              fullWidth
              error={Boolean(err('url'))}
              helperText={err('url') ?? 'https only in production; placeholders are URL-encoded'}
              slotProps={{ htmlInput: { spellCheck: false } }}
            />
          </Stack>
          <div>
            <VariablePicker
              variables={urlVariables}
              value={draft.url}
              onChange={(v) => set('url', v)}
              inputRef={urlRef}
              label="Insert placeholder"
            />
          </div>

          <Typography variant="subtitle2">Headers</Typography>
          {draft.headers.map((h, i) => (
            <Stack
              key={i}
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              sx={{ alignItems: { sm: 'flex-start' } }}
            >
              <TextField
                label={`Header ${i + 1} name`}
                size="small"
                value={h.name}
                onChange={(e) =>
                  set(
                    'headers',
                    draft.headers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                  )
                }
                error={Boolean(err(`headers.${i}.name`))}
                helperText={err(`headers.${i}.name`)}
                sx={{ width: { sm: 200 } }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={h.secret}
                    disabled={Boolean(h.stored)}
                    onChange={(e) =>
                      set(
                        'headers',
                        draft.headers.map((x, j) =>
                          j === i ? { ...x, secret: e.target.checked } : x,
                        ),
                      )
                    }
                  />
                }
                label="Secret"
              />
              <div style={{ flex: 1 }}>
                {h.secret ? (
                  <SecretField
                    label={`Header ${i + 1} value`}
                    hint={h.stored}
                    value={h.value}
                    error={err(`headers.${i}.value`)}
                    onChange={(v) =>
                      set(
                        'headers',
                        draft.headers.map((x, j) => (j === i ? { ...x, value: v } : x)),
                      )
                    }
                  />
                ) : (
                  <TextField
                    label={`Header ${i + 1} value`}
                    size="small"
                    fullWidth
                    value={h.value ?? ''}
                    onChange={(e) =>
                      set(
                        'headers',
                        draft.headers.map((x, j) =>
                          j === i ? { ...x, value: e.target.value } : x,
                        ),
                      )
                    }
                    error={Boolean(err(`headers.${i}.value`))}
                    helperText={err(`headers.${i}.value`)}
                  />
                )}
              </div>
              <IconButton
                aria-label={`Remove header ${i + 1}`}
                onClick={() =>
                  set(
                    'headers',
                    draft.headers.filter((_, j) => j !== i),
                  )
                }
              >
                <DeleteOutlineOutlined fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <div>
            <Button
              startIcon={<AddOutlined />}
              disabled={draft.headers.length >= HEADERS_MAX}
              onClick={() =>
                set('headers', [
                  ...draft.headers,
                  { name: '', secret: true, value: '', stored: null },
                ])
              }
            >
              Add header
            </Button>
          </div>

          {draft.method !== 'GET' && (
            <JsonTemplateField
              label="Body template (JSON)"
              value={draft.bodyTemplate}
              onChange={(v) => set('bodyTemplate', v)}
              error={err('bodyTemplate')}
              helperText='Placeholders like "{{args.amount}}" — a value that is only a placeholder keeps its type'
            />
          )}

          <Divider />
          <Typography variant="subtitle1" component="h3">
            Response
          </Typography>
          <TextField
            label="Result path"
            value={draft.resultPath}
            onChange={(e) => set('resultPath', e.target.value)}
            error={Boolean(err('resultPath'))}
            helperText={
              err('resultPath') ?? 'Optional, e.g. data.status — empty sends the whole answer'
            }
          />
          <TextField
            label="Hint for the AI"
            value={draft.responseHint}
            onChange={(e) => set('responseHint', e.target.value)}
            multiline
            error={Boolean(err('responseHint'))}
            helperText={
              err('responseHint') ?? 'How to read the answer, e.g. "status is paid / unpaid"'
            }
            slotProps={{ htmlInput: { maxLength: 300 } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={save.isPending}>
          {fn ? 'Save function' : 'Add function'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
