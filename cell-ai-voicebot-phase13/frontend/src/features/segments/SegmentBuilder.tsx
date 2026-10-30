import Add from '@mui/icons-material/Add';
import Close from '@mui/icons-material/Close';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { TYPE_LABEL } from '@/features/contact-imports/import-text';
import { useContactTags, useListOptions } from '@/features/contacts/queries';
import type { CustomField } from '@/services/api/types';

import {
  checkConditions,
  emptyCondition,
  isDaysOp,
  MAX_CONDITIONS,
  OP_LABEL,
  OPERATORS_BY_TYPE,
  valueCount,
  type BuilderState,
  type ConditionDraft,
  type FilterOp,
  type Tri,
} from './segment-filter';

function ValueInput({
  field,
  op,
  label,
  value,
  error,
  onChange,
}: {
  field: CustomField;
  op: FilterOp;
  label: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const days = isDaysOp(op);
  const date = field.type === 'date' && !days;
  return (
    <TextField
      size="small"
      label={label}
      type={date ? 'date' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={Boolean(error)}
      helperText={error}
      sx={{ minWidth: 150, flex: 1 }}
      slotProps={{
        inputLabel: date ? { shrink: true } : undefined,
        htmlInput: {
          inputMode:
            days || field.type === 'number' || field.type === 'currency' ? 'decimal' : undefined,
        },
        input: {
          startAdornment:
            field.type === 'currency' && !days ? (
              <InputAdornment position="start">₹</InputAdornment>
            ) : undefined,
          endAdornment: days ? <InputAdornment position="end">days</InputAdornment> : undefined,
        },
      }}
    />
  );
}

const TRI_LABELS: Record<string, [string, string, string]> = {
  dnd: ['All', 'On the list', 'Not on the list'],
  optedOut: ['All', 'Opted out', 'Not opted out'],
};

/**
 * Edits a contact filter: conditions on custom fields (operators by type),
 * tags any / all, lists, do-not-call and opted-out. Used by segments and by
 * the Contacts tab's "Advanced filter".
 */
export function SegmentBuilder({
  value,
  onChange,
  fields,
  serverErrors = {},
}: {
  value: BuilderState;
  onChange: (next: BuilderState) => void;
  fields: CustomField[];
  /** Server messages by path, e.g. `conditions.0.value`. */
  serverErrors?: Record<string, string>;
}) {
  const lists = useListOptions();
  const tags = useContactTags();
  const problems = checkConditions(value.conditions, fields);
  const set = (patch: Partial<BuilderState>) => onChange({ ...value, ...patch });
  const setRow = (i: number, patch: Partial<ConditionDraft>) =>
    set({ conditions: value.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  const chooseField = (i: number, key: string) => {
    const field = fields.find((f) => f.key === key);
    const ops = field ? OPERATORS_BY_TYPE[field.type] : [];
    setRow(i, { key, op: ops[0] ?? '', value: '', value2: '' });
  };
  const chooseOp = (i: number, op: FilterOp) => {
    const row = value.conditions[i];
    const reset = row && isDaysOp(row.op) !== isDaysOp(op);
    setRow(i, { op, ...(reset ? { value: '', value2: '' } : {}) });
  };

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle2">Field conditions (all must match)</Typography>
      {value.conditions.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {fields.length
            ? 'No conditions — every contact matches the parts below.'
            : 'Add custom fields in the Fields tab to filter by them.'}
        </Typography>
      )}
      {value.conditions.map((c, i) => {
        const field = fields.find((f) => f.key === c.key);
        const problem = problems[i] ?? {};
        const n = valueCount(c.op);
        return (
          <Stack
            key={i}
            role="group"
            aria-label={`Condition ${i + 1}`}
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ alignItems: { sm: 'flex-start' } }}
          >
            <TextField
              size="small"
              select
              label="Field"
              value={field ? c.key : ''}
              onChange={(e) => chooseField(i, e.target.value)}
              error={Boolean(problem.key)}
              helperText={problem.key}
              sx={{ minWidth: 180 }}
            >
              {fields.map((f) => (
                <MenuItem key={f.key} value={f.key}>
                  {f.label} ({TYPE_LABEL[f.type]})
                </MenuItem>
              ))}
            </TextField>
            {field && (
              <TextField
                size="small"
                select
                label="Condition"
                value={c.op}
                onChange={(e) => chooseOp(i, e.target.value as FilterOp)}
                error={Boolean(problem.op)}
                helperText={problem.op}
                sx={{ minWidth: 170 }}
              >
                {OPERATORS_BY_TYPE[field.type].map((op) => (
                  <MenuItem key={op} value={op}>
                    {OP_LABEL[op]}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {field && c.op && n >= 1 && (
              <ValueInput
                key={`${c.key}-${isDaysOp(c.op)}-from`}
                field={field}
                op={c.op}
                label={n === 2 ? 'From' : isDaysOp(c.op) ? 'Days' : 'Value'}
                value={c.value}
                error={problem.value ?? serverErrors[`conditions.${i}.value`]}
                onChange={(v) => setRow(i, { value: v })}
              />
            )}
            {field && c.op && n === 2 && (
              <ValueInput
                key={`${c.key}-to`}
                field={field}
                op={c.op}
                label="To"
                value={c.value2}
                error={problem.value2 ?? serverErrors[`conditions.${i}.value2`]}
                onChange={(v) => setRow(i, { value2: v })}
              />
            )}
            <IconButton
              aria-label={`Remove condition ${i + 1}`}
              onClick={() => set({ conditions: value.conditions.filter((_c, j) => j !== i) })}
            >
              <Close />
            </IconButton>
          </Stack>
        );
      })}
      <div>
        <Button
          startIcon={<Add />}
          disabled={!fields.length || value.conditions.length >= MAX_CONDITIONS}
          onClick={() => set({ conditions: [...value.conditions, emptyCondition()] })}
        >
          Add condition
        </Button>
      </div>

      <Typography variant="subtitle2">Tags and lists</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField
          size="small"
          select
          label="Tags match"
          value={value.tagsMode}
          onChange={(e) => set({ tagsMode: e.target.value as 'any' | 'all' })}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="any">Any of</MenuItem>
          <MenuItem value="all">All of</MenuItem>
        </TextField>
        <Autocomplete
          multiple
          freeSolo
          size="small"
          options={(tags.data ?? []).map((t) => t.tag)}
          value={value.tags}
          onChange={(_e, v) =>
            set({ tags: [...new Set(v.map((t) => t.trim().toLowerCase()).filter(Boolean))] })
          }
          renderInput={(p) => <TextField {...p} label="Tags" />}
          sx={{ flex: 1 }}
        />
      </Stack>
      <Autocomplete
        multiple
        size="small"
        options={(lists.data ?? []).map((l) => l.id)}
        getOptionLabel={(id) => lists.data?.find((l) => l.id === id)?.name ?? 'Deleted list'}
        value={value.listIds}
        onChange={(_e, v) => set({ listIds: v })}
        renderInput={(p) => <TextField {...p} label="In any of these lists" />}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        {(['dnd', 'optedOut'] as const).map((k) => {
          const labels = TRI_LABELS[k] ?? ['', '', ''];
          return (
            <TextField
              key={k}
              size="small"
              select
              label={k === 'dnd' ? 'Do-not-call' : 'Opted out'}
              value={value[k]}
              onChange={(e) => set({ [k]: e.target.value as Tri })}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">{labels[0]}</MenuItem>
              <MenuItem value="true">{labels[1]}</MenuItem>
              <MenuItem value="false">{labels[2]}</MenuItem>
            </TextField>
          );
        })}
      </Stack>
      {value.rest.q && <Alert severity="info">Also matches the search “{value.rest.q}”.</Alert>}
    </Stack>
  );
}
