import DataObjectOutlined from '@mui/icons-material/DataObjectOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';

import type {
  DraftGraph,
  FlowCatalog,
  FlowSettings,
  FlowVariable,
  FlowVariableInfo,
} from '@/services/api/types';

import type { GraphAction } from '../graph/reducer';

import { NumberInput, SelectInput, TemplateField } from './fields';
import { LANGUAGE_LABELS } from './form-types';
import { pickerVariables } from './picker-variables';

const VARIABLE_NAME = /^[a-z][a-z0-9_]{0,39}$/;
const PHONE = /^\+?[0-9]{8,15}$/;
const VARIABLES_MAX = 50;

type Apply = (action: GraphAction, options?: { coalesce?: string }) => void;

function SettingsDialog({
  graph,
  catalog,
  known,
  onApply,
  onClose,
}: {
  graph: DraftGraph;
  catalog: FlowCatalog;
  known: FlowVariableInfo[] | undefined;
  onApply: (settings: FlowSettings) => void;
  onClose: () => void;
}) {
  const [s, setS] = useState<FlowSettings>(graph.settings);
  const patch = (p: Partial<FlowSettings>) => setS((prev) => ({ ...prev, ...p }));
  const phoneError =
    s.onError === 'transfer' && !PHONE.test(s.errorTransferPhone ?? '')
      ? 'Enter a phone number like +919876543210'
      : undefined;
  const messageError = s.errorMessage.trim() ? undefined : 'Required';
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Flow settings</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <SelectInput
            label="Language"
            value={s.language}
            onChange={(language) => patch({ language: language as FlowSettings['language'] })}
            options={catalog.languages.map((l) => ({ value: l, label: LANGUAGE_LABELS[l] ?? l }))}
            readOnly={false}
          />
          <SelectInput
            label="Voice"
            value={s.voice}
            onChange={(voice) => patch({ voice: voice as FlowSettings['voice'] })}
            options={catalog.voices.map((v) => ({ value: v, label: v }))}
            readOnly={false}
          />
          <NumberInput
            label="Longest call (minutes)"
            value={Math.round(s.maxDurationSec / 60)}
            onChange={(m) => patch({ maxDurationSec: Math.min(3600, Math.max(60, m * 60)) })}
            min={1}
            max={60}
            readOnly={false}
          />
          <TemplateField
            label="If something goes wrong, say"
            value={s.errorMessage}
            onChange={(errorMessage) => patch({ errorMessage })}
            variables={pickerVariables(known, graph)}
            error={messageError}
            maxLength={300}
            multiline
            readOnly={false}
          />
          <SelectInput
            label="Then"
            value={s.onError}
            onChange={(onError) => patch({ onError: onError as FlowSettings['onError'] })}
            options={[
              { value: 'hangup', label: 'Hang up' },
              { value: 'transfer', label: 'Transfer to a person' },
            ]}
            readOnly={false}
          />
          {s.onError === 'transfer' && (
            <TextField
              size="small"
              label="Transfer to phone"
              value={s.errorTransferPhone ?? ''}
              onChange={(e) => patch({ errorTransferPhone: e.target.value.trim() || null })}
              error={Boolean(phoneError)}
              helperText={phoneError}
              slotProps={{ htmlInput: { maxLength: 20 } }}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={Boolean(phoneError ?? messageError)}
          onClick={() => onApply(s.onError === 'hangup' ? { ...s, errorTransferPhone: null } : s)}
        >
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface Row extends FlowVariable {
  /** Name when the dialog opened (`null` for new rows) — drives renames. */
  original: string | null;
}

const shownDefault = (d: FlowVariable['default']): string =>
  d === null || d === undefined ? '' : String(d);

const parseDefault = (type: FlowVariable['type'], raw: string): FlowVariable['default'] => {
  if (raw.trim() === '') return null;
  if (type === 'number') return Number.isFinite(Number(raw)) ? Number(raw) : null;
  if (type === 'boolean') return raw === 'true';
  return raw;
};

function VariablesDialog({
  graph,
  catalog,
  known,
  onApply,
  onClose,
}: {
  graph: DraftGraph;
  catalog: FlowCatalog;
  known: FlowVariableInfo[] | undefined;
  onApply: (variables: FlowVariable[], renames: { from: string; to: string }[]) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Row[]>(
    graph.variables.map((v) => ({ ...v, original: v.name })),
  );
  const reserved = new Set((known ?? []).filter((v) => v.source !== 'flow').map((v) => v.name));
  const errorOf = (row: Row, i: number): string | undefined => {
    if (!VARIABLE_NAME.test(row.name)) return 'Use a-z, 0-9 and _ (start with a letter)';
    if (reserved.has(row.name)) return 'This name is used by a contact or system value';
    if (items.findIndex((x) => x.name === row.name) !== i) return 'Name already used';
    return undefined;
  };
  const invalid = items.some((row, i) => errorOf(row, i));
  const update = (i: number, p: Partial<Row>) =>
    setItems((prev) => prev.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const removed = graph.variables.filter((v) => !items.some((x) => x.original === v.name));
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Flow variables</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {items.length === 0 && (
            <Alert severity="info">No flow variables yet. They hold answers during a call.</Alert>
          )}
          {items.map((row, i) => {
            const err = errorOf(row, i);
            return (
              <Stack key={String(i)} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                <TextField
                  size="small"
                  label="Name"
                  value={row.name}
                  onChange={(e) => update(i, { name: e.target.value.toLowerCase() })}
                  error={Boolean(err)}
                  helperText={
                    err ??
                    (row.original && row.original !== row.name
                      ? `Renamed from ${row.original} — steps are updated`
                      : undefined)
                  }
                  slotProps={{ htmlInput: { maxLength: 40 } }}
                />
                <SelectInput
                  label="Type"
                  value={row.type}
                  onChange={(type) =>
                    update(i, { type: type as FlowVariable['type'], default: null })
                  }
                  options={catalog.variableTypes.map((t) => ({ value: t, label: t }))}
                  readOnly={false}
                />
                <TextField
                  size="small"
                  label="Label"
                  value={row.label ?? ''}
                  onChange={(e) => update(i, { label: e.target.value })}
                  slotProps={{ htmlInput: { maxLength: 60 } }}
                />
                {row.type === 'boolean' ? (
                  <SelectInput
                    label="Default"
                    value={shownDefault(row.default)}
                    onChange={(raw) => update(i, { default: parseDefault('boolean', raw) })}
                    options={[
                      { value: '', label: 'None' },
                      { value: 'true', label: 'Yes' },
                      { value: 'false', label: 'No' },
                    ]}
                    readOnly={false}
                  />
                ) : (
                  <TextField
                    size="small"
                    label="Default"
                    type={row.type === 'number' ? 'number' : row.type === 'date' ? 'date' : 'text'}
                    value={shownDefault(row.default)}
                    onChange={(e) => update(i, { default: parseDefault(row.type, e.target.value) })}
                    slotProps={{
                      inputLabel: { shrink: true },
                      htmlInput: { maxLength: 300 },
                    }}
                  />
                )}
                <IconButton
                  aria-label={`Remove variable ${row.name || String(i + 1)}`}
                  onClick={() => setItems((prev) => prev.filter((_x, j) => j !== i))}
                >
                  <DeleteOutlineOutlined />
                </IconButton>
              </Stack>
            );
          })}
          {removed.length > 0 && (
            <Alert severity="warning">
              Removing {removed.map((v) => v.name).join(', ')} — steps that use{' '}
              {removed.length === 1 ? 'it' : 'them'} will show problems.
            </Alert>
          )}
          {items.length < VARIABLES_MAX && (
            <Button
              sx={{ alignSelf: 'flex-start' }}
              onClick={() =>
                setItems((prev) => [
                  ...prev,
                  { name: '', type: 'text', label: '', default: null, original: null },
                ])
              }
            >
              Add variable
            </Button>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={invalid}
          onClick={() =>
            onApply(
              items.map(({ original: _o, label, ...v }) => (label ? { ...v, label } : v)),
              items
                .filter((x) => x.original && x.original !== x.name)
                .map((x) => ({ from: x.original ?? '', to: x.name })),
            )
          }
        >
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** "Flow settings" and "Variables" buttons with their dialogs (draft only). */
export function FlowDialogs({
  graph,
  apply,
  readOnly,
  catalog,
  known,
}: {
  graph: DraftGraph;
  apply: Apply;
  readOnly: boolean;
  catalog: FlowCatalog;
  known: FlowVariableInfo[] | undefined;
}) {
  const [open, setOpen] = useState<'settings' | 'variables' | null>(null);
  if (readOnly) return null;
  return (
    <>
      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        <Button size="small" startIcon={<TuneOutlined />} onClick={() => setOpen('settings')}>
          Flow settings
        </Button>
        <Button
          size="small"
          startIcon={<DataObjectOutlined />}
          onClick={() => setOpen('variables')}
        >
          Variables ({graph.variables.length})
        </Button>
      </Stack>
      {open === 'settings' && (
        <SettingsDialog
          graph={graph}
          catalog={catalog}
          known={known}
          onClose={() => setOpen(null)}
          onApply={(settings) => {
            apply({ type: 'set_settings', settings });
            setOpen(null);
          }}
        />
      )}
      {open === 'variables' && (
        <VariablesDialog
          graph={graph}
          catalog={catalog}
          known={known}
          onClose={() => setOpen(null)}
          onApply={(variables, renames) => {
            apply({ type: 'set_variables', variables, renames });
            setOpen(null);
          }}
        />
      )}
    </>
  );
}
