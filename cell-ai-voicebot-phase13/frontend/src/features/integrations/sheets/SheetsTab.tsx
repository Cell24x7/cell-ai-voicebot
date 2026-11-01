import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { useConfirm } from '@/components/confirm-context';
import { DataTable } from '@/components/DataTable';
import { RelativeTime } from '@/components/RelativeTime';
import { StatusChip } from '@/components/StatusChip';
import { usePermission, useSession } from '@/features/auth/hooks';
import {
  BASE_TARGETS,
  checkChoices,
  toMapping,
  type ColumnChoice,
} from '@/features/contact-imports/mapping-state';
import { useCustomFields } from '@/features/contacts/queries';
import { getErrorMessage } from '@/services/api/errors';
import { sheetImportsApi, type SheetSchedule } from '@/services/api/sheet-imports';
import type { SheetImport } from '@/services/api/types';

import { integrationKeys } from '../keys';

import { choicesOf, SCHEDULE_LABELS } from './sheets';

const RUN_CHIP: Record<NonNullable<SheetImport['lastStatus']>, string> = {
  ok: 'completed',
  failed: 'failed',
  busy: 'pending',
  running: 'importing',
};
const RUN_LABEL: Record<NonNullable<SheetImport['lastStatus']>, string> = {
  ok: 'Imported',
  failed: 'Failed',
  busy: 'Waiting for another import',
  running: 'Importing',
};

function AddSheetDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const fields = useCustomFields();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [schedule, setSchedule] = useState<SheetSchedule>('daily');
  const [updateExisting, setUpdateExisting] = useState(true);
  const [choices, setChoices] = useState<ColumnChoice[] | null>(null);
  const preview = useMutation({
    mutationFn: () => sheetImportsApi.preview(url.trim()),
    meta: { silent: true },
    onSuccess: (p) => setChoices(choicesOf(p)),
  });
  const fieldList = fields.data ?? [];
  const check = choices ? checkChoices(choices, fieldList) : null;
  const create = useMutation({
    mutationFn: () =>
      sheetImportsApi.create({
        name: name.trim(),
        url: url.trim(),
        schedule,
        updateExisting,
        mapping: toMapping(choices ?? [], fieldList),
      }),
    meta: { silent: true },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: integrationKeys.sheets });
      enqueueSnackbar('Sheet added — the first import has started', { variant: 'success' });
      onClose();
    },
  });
  const ready =
    Boolean(name.trim()) &&
    choices !== null &&
    !check?.global &&
    !Object.keys(check?.columns ?? {}).length;
  const targets = [
    { value: 'ignore', label: "Don't import" },
    ...BASE_TARGETS.contacts.map((t) => ({ value: t.value, label: t.label })),
    ...fieldList.map((f) => ({ value: `field:${f.key}`, label: f.label })),
  ];
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="sheet-title">
      <DialogTitle id="sheet-title">Import contacts from a Google Sheet</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            In Google Sheets: File → Share → Publish to web → choose the sheet and{' '}
            <strong>Comma-separated values (.csv)</strong> → Publish, and paste the link here.
          </Typography>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 80 } }}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              fullWidth
              label="Published CSV link"
              placeholder="https://docs.google.com/spreadsheets/d/e/…/pub?output=csv"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setChoices(null);
              }}
            />
            <Button
              variant="outlined"
              disabled={!url.trim() || preview.isPending}
              onClick={() => preview.mutate()}
              sx={{ flexShrink: 0 }}
            >
              Check link
            </Button>
          </Stack>
          {preview.error && <Alert severity="error">{getErrorMessage(preview.error)}</Alert>}
          {preview.data && choices && (
            <Stack spacing={1} aria-label="Column mapping">
              <Typography variant="subtitle2">
                {preview.data.rowCount} rows found — choose what each column is
              </Typography>
              {choices.map((c, i) => (
                <Stack
                  key={c.index}
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  sx={{ alignItems: { sm: 'center' } }}
                >
                  <Typography sx={{ minWidth: 180 }}>
                    <strong>{c.header || `Column ${String(c.index + 1)}`}</strong>
                    <Typography
                      component="span"
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block' }}
                    >
                      {c.samples.slice(0, 2).join(', ')}
                    </Typography>
                  </Typography>
                  <TextField
                    select
                    size="small"
                    label="Import as"
                    value={c.target}
                    onChange={(e) =>
                      setChoices(
                        choices.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)),
                      )
                    }
                    sx={{ minWidth: 220 }}
                    error={Boolean(check?.columns[c.index])}
                    helperText={check?.columns[c.index]}
                  >
                    {targets.map((t) => (
                      <MenuItem key={t.value} value={t.value}>
                        {t.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
              ))}
              {check?.global && <FormHelperText error>{check.global}</FormHelperText>}
              <Typography variant="caption" color="text.secondary">
                New contact fields: create them first in Settings → Contact fields.
              </Typography>
            </Stack>
          )}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ alignItems: { sm: 'center' } }}
          >
            <TextField
              select
              label="Import"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value as SheetSchedule)}
              sx={{ minWidth: 180 }}
            >
              {Object.entries(SCHEDULE_LABELS).map(([k, label]) => (
                <MenuItem key={k} value={k}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <FormControlLabel
              control={
                <Switch
                  checked={updateExisting}
                  onChange={(e) => setUpdateExisting(e.target.checked)}
                />
              }
              label="Update contacts that already exist (same phone)"
            />
          </Stack>
          {create.error && <Alert severity="error">{getErrorMessage(create.error)}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!ready || create.isPending}
          onClick={() => create.mutate()}
        >
          Add sheet
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Integrations → Google Sheets (`contacts.import`). */
export function SheetsTab() {
  const session = useSession();
  const canManage = usePermission('contacts.import') && !session?.impersonation;
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const list = useQuery({
    queryKey: integrationKeys.sheets,
    queryFn: sheetImportsApi.list,
    meta: { silent: true },
    refetchInterval: (q) => (q.state.data?.some((s) => s.lastStatus === 'running') ? 5_000 : false),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: integrationKeys.sheets });
  const run = useMutation({
    mutationFn: (id: string) => sheetImportsApi.run(id),
    meta: { silent: true },
    onSuccess: refresh,
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: 'error' }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => sheetImportsApi.remove(id),
    meta: { silent: true },
    onSuccess: () => {
      refresh();
      enqueueSnackbar('Sheet import stopped', { variant: 'success' });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: 'error' }),
  });
  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ justifyContent: 'space-between' }}
      >
        <Typography variant="body2" color="text.secondary">
          Keep contacts in step with a Google Sheet (once, every hour or every day). To send call
          results to a sheet, use a webhook with the{' '}
          <Link href="/api/docs" target="_blank" rel="noopener">
            Apps Script receiver
          </Link>
          .
        </Typography>
        {canManage && (
          <Button variant="contained" onClick={() => setAdding(true)} sx={{ flexShrink: 0 }}>
            Add sheet
          </Button>
        )}
      </Stack>
      <DataTable<SheetImport>
        aria-label="Google Sheet imports"
        columns={[
          { key: 'name', header: 'Sheet', render: (s) => s.name },
          { key: 'schedule', header: 'Import', render: (s) => SCHEDULE_LABELS[s.schedule] },
          { key: 'list', header: 'Adds to list', render: (s) => s.listName ?? '—' },
          {
            key: 'last',
            header: 'Last run',
            render: (s) =>
              s.lastStatus ? (
                <Stack>
                  <StatusChip status={RUN_CHIP[s.lastStatus]} label={RUN_LABEL[s.lastStatus]} />
                  {s.lastResult && (
                    <Typography variant="caption" color="text.secondary">
                      {s.lastResult.created} added · {s.lastResult.updated} updated ·{' '}
                      {s.lastResult.failed} skipped
                    </Typography>
                  )}
                  {s.lastStatus === 'failed' && s.lastError && (
                    <Typography variant="caption" color="error">
                      {s.lastError}
                    </Typography>
                  )}
                </Stack>
              ) : (
                '—'
              ),
          },
          {
            key: 'next',
            header: 'Next',
            render: (s) => (s.nextRunAt ? <RelativeTime value={s.nextRunAt} /> : '—'),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (s) =>
              canManage ? (
                <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                  <Button
                    size="small"
                    disabled={s.lastStatus === 'running' || run.isPending}
                    onClick={() => run.mutate(s.id)}
                  >
                    Run now
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    onClick={() =>
                      void confirm({
                        title: `Stop importing "${s.name}"?`,
                        message: 'Contacts already imported and their list stay.',
                        confirmText: 'Stop',
                        destructive: true,
                      }).then((ok) => {
                        if (ok) remove.mutate(s.id);
                      })
                    }
                  >
                    Remove
                  </Button>
                </Stack>
              ) : null,
          },
        ]}
        rows={list.data}
        getRowId={(s) => s.id}
        loading={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        emptyTitle="No Google Sheets yet"
        emptyDescription="Add a published sheet to import its contacts on a schedule."
      />
      {adding && <AddSheetDialog onClose={() => setAdding(false)} />}
    </Stack>
  );
}
