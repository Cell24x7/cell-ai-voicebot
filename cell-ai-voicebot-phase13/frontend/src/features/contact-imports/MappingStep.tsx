import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import type { CustomField, FieldType, ImportColumnMapping, ImportJob } from '@/services/api/types';

import { TYPE_LABEL, WARNINGS, slugKey } from './import-text';
import {
  BASE_TARGETS,
  checkChoices,
  initialChoices,
  isDateChoice,
  toMapping,
  type ColumnChoice,
} from './mapping-state';

const DATE_FORMATS = [
  { value: 'DMY', label: 'DD/MM/YYYY' },
  { value: 'MDY', label: 'MM/DD/YYYY' },
  { value: 'YMD', label: 'YYYY-MM-DD' },
];

/** Step "Map columns": what each column of the sheet is. */
export function MappingStep({
  job,
  fields,
  busy,
  onSwitchSheet,
  onNext,
  onCancel,
}: {
  job: ImportJob;
  fields: CustomField[];
  busy: boolean;
  onSwitchSheet: (sheet: string) => void;
  onNext: (columns: ImportColumnMapping[]) => void;
  onCancel: () => void;
}) {
  const [choices, setChoices] = useState<ColumnChoice[]>(() => initialChoices(job));
  const check = checkChoices(choices, fields);
  const valid = !check.global && Object.keys(check.columns).length === 0;
  const set = (index: number, patch: Partial<ColumnChoice>) =>
    setChoices((all) => all.map((c) => (c.index === index ? { ...c, ...patch } : c)));
  const targets = BASE_TARGETS[job.kind];

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        {job.fileName} · {job.rowCount} rows. Tell us what each column is — new columns can become
        new fields.
      </Typography>
      {job.warnings.map((w) => (
        <Alert key={w} severity="warning">
          {WARNINGS[w] ?? w}
        </Alert>
      ))}
      {job.sheets.length > 1 && (
        <TextField
          select
          size="small"
          label="Sheet"
          value={job.sheet ?? ''}
          onChange={(e) => onSwitchSheet(e.target.value)}
          sx={{ maxWidth: 260 }}
          disabled={busy}
        >
          {job.sheets.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </TextField>
      )}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" aria-label="Column mapping">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Column</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Examples</TableCell>
              <TableCell sx={{ fontWeight: 600, minWidth: 260 }}>Use as</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {choices.map((c) => (
              <TableRow key={c.index}>
                <TableCell>{c.header}</TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 260 }} noWrap>
                    {c.samples.join(' · ') || '—'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Stack spacing={1}>
                    <TextField
                      select
                      size="small"
                      label={`Use "${c.header}" as`}
                      value={c.target}
                      onChange={(e) => set(c.index, { target: e.target.value })}
                      error={Boolean(check.columns[c.index])}
                      helperText={check.columns[c.index]}
                    >
                      <ListSubheader>Contact</ListSubheader>
                      {targets.map((t) => (
                        <MenuItem key={t.value} value={t.value}>
                          {t.label}
                        </MenuItem>
                      ))}
                      {job.kind === 'contacts' && fields.length > 0 && (
                        <ListSubheader>Your fields</ListSubheader>
                      )}
                      {job.kind === 'contacts' &&
                        fields.map((f) => (
                          <MenuItem key={f.key} value={`field:${f.key}`}>
                            {f.label}
                          </MenuItem>
                        ))}
                      {job.kind === 'contacts' && <ListSubheader>Other</ListSubheader>}
                      {job.kind === 'contacts' && <MenuItem value="new">New field…</MenuItem>}
                      <MenuItem value="ignore">Don&apos;t import</MenuItem>
                    </TextField>
                    {c.target === 'new' && (
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <TextField
                          size="small"
                          label="Field name"
                          value={c.newLabel}
                          onChange={(e) =>
                            set(c.index, {
                              newLabel: e.target.value,
                              newKey: slugKey(e.target.value),
                            })
                          }
                        />
                        <TextField
                          size="small"
                          label="Key"
                          value={c.newKey}
                          onChange={(e) => set(c.index, { newKey: e.target.value })}
                          helperText={`{{${c.newKey}}}`}
                        />
                        <TextField
                          select
                          size="small"
                          label="Type"
                          value={c.newType}
                          onChange={(e) => set(c.index, { newType: e.target.value as FieldType })}
                          sx={{ minWidth: 130 }}
                        >
                          {(Object.keys(TYPE_LABEL) as FieldType[]).map((t) => (
                            <MenuItem key={t} value={t}>
                              {TYPE_LABEL[t]}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Stack>
                    )}
                    {isDateChoice(c, fields) && (
                      <TextField
                        select
                        size="small"
                        label="Date format"
                        value={c.dateFormat}
                        onChange={(e) =>
                          set(c.index, { dateFormat: e.target.value as ColumnChoice['dateFormat'] })
                        }
                        sx={{ maxWidth: 200 }}
                      >
                        {DATE_FORMATS.map((d) => (
                          <MenuItem key={d.value} value={d.value}>
                            {d.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {check.global && <Alert severity="info">{check.global}</Alert>}
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
        <Button onClick={onCancel}>Cancel import</Button>
        <Button
          variant="contained"
          disabled={!valid || busy}
          onClick={() => onNext(toMapping(choices, fields))}
        >
          Next
        </Button>
      </Stack>
    </Stack>
  );
}
