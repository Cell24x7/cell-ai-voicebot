import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormLabel from '@mui/material/FormLabel';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';

import { exportKeys } from '@/features/contacts/keys';
import { useCustomFields, useListOptions, useSegments } from '@/features/contacts/queries';
import {
  BASE_EXPORT_COLUMNS,
  contactExportsApi,
  type ExportRequest,
} from '@/services/api/contact-exports';
import { getErrorMessage } from '@/services/api/errors';
import type { ContactFilter } from '@/services/api/types';
import { formatNumber } from '@/utils/format';

import { useCanExport, useExportJob } from './useExportJob';

type Scope = ExportRequest['scope'];

const COLUMN_LABEL: Record<(typeof BASE_EXPORT_COLUMNS)[number], string> = {
  name: 'Name',
  phone: 'Phone',
  email: 'E-mail',
  external_id: 'External id',
  tags: 'Tags',
  lists: 'Lists',
  dnd: 'Do-not-call',
  opted_out: 'Opted out',
  consent_source: 'Consent / relationship',
  consent_at: 'Consent date',
  created_at: 'Added on',
};

/** Export contacts to CSV: scope, columns, progress, download. */
export function ExportDialog({
  open,
  onClose,
  ids,
  filter,
  filterCount,
  listId,
  segmentId,
}: {
  open: boolean;
  onClose: () => void;
  /** Selected contacts. */
  ids?: string[];
  /** The Contacts tab's current filters (`null` = can't be expressed). */
  filter?: ContactFilter | null;
  filterCount?: number;
  listId?: string;
  segmentId?: string;
}) {
  const queryClient = useQueryClient();
  const canExport = useCanExport();
  const fields = useCustomFields();
  const lists = useListOptions();
  const segments = useSegments();
  const [scope, setScope] = useState<Scope>(
    ids?.length ? 'ids' : filter ? 'filter' : segmentId ? 'segment' : 'list',
  );
  const [list, setList] = useState(listId ?? '');
  const [segment, setSegment] = useState(segmentId ?? '');
  const allColumns = [...BASE_EXPORT_COLUMNS, ...(fields.data ?? []).map((f) => f.key)] as string[];
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const columns = allColumns.filter((c) => !unchecked.has(c));
  const [jobId, setJobId] = useState<string>();
  const job = useExportJob(jobId);

  const start = useMutation({
    mutationFn: () =>
      contactExportsApi.create({
        scope,
        ...(scope === 'ids' ? { ids } : {}),
        ...(scope === 'filter' && filter ? { filter } : {}),
        ...(scope === 'list' ? { listId: list } : {}),
        ...(scope === 'segment' ? { segmentId: segment } : {}),
        ...(unchecked.size ? { columns } : {}),
      }),
    meta: { silent: true },
    onSuccess: (created) => {
      queryClient.setQueryData(exportKeys.detail(created.id), created);
      void queryClient.invalidateQueries({ queryKey: exportKeys.all });
      setJobId(created.id);
    },
  });
  const download = useMutation({
    mutationFn: () => contactExportsApi.get(jobId ?? ''),
    meta: { silent: true },
    onSuccess: (fresh) => {
      if (fresh.downloadUrl) window.open(fresh.downloadUrl, '_blank', 'noopener');
    },
  });

  const toggle = (c: string) => {
    const next = new Set(unchecked);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    setUnchecked(next);
  };
  const ready =
    columns.length > 0 &&
    (scope === 'ids' ? Boolean(ids?.length) : true) &&
    (scope === 'filter' ? Boolean(filter) : true) &&
    (scope === 'list' ? Boolean(list) : true) &&
    (scope === 'segment' ? Boolean(segment) : true);
  const current = job.data;
  const label = (key: string) =>
    COLUMN_LABEL[key as keyof typeof COLUMN_LABEL] ??
    fields.data?.find((f) => f.key === key)?.label ??
    key;

  let body;
  if (!canExport) {
    body = (
      <Alert severity="warning">
        Exports are not available while you are signed in as someone else.
      </Alert>
    );
  } else if (jobId) {
    const status = current?.status ?? 'pending';
    const total = current?.progress.total ?? 0;
    const processed = current?.progress.processed ?? 0;
    body = (
      <Stack spacing={2}>
        {(status === 'pending' || status === 'processing') && (
          <>
            <Typography>
              Preparing the file… {formatNumber(processed)} of {formatNumber(total)} contacts
            </Typography>
            <LinearProgress
              aria-label="Export progress"
              variant={total ? 'determinate' : 'indeterminate'}
              value={total ? Math.min(100, (processed / total) * 100) : undefined}
            />
            <Typography variant="body2" color="text.secondary">
              You can close this — the file will also be under{' '}
              <Link component={RouterLink} to="/contacts/activity">
                Imports &amp; exports
              </Link>
              .
            </Typography>
          </>
        )}
        {status === 'ready' && (
          <Alert severity="success">
            {formatNumber(current?.rowCount ?? 0)} contacts exported. The file is kept for 24 hours.
          </Alert>
        )}
        {status === 'failed' && (
          <Alert severity="error">{current?.errorMessage ?? 'The export failed.'}</Alert>
        )}
        {status === 'expired' && <Alert severity="info">This export has expired.</Alert>}
        {download.error && <Alert severity="error">{getErrorMessage(download.error)}</Alert>}
      </Stack>
    );
  } else {
    body = (
      <Stack spacing={2}>
        <div>
          <FormLabel id="export-scope">Contacts to export</FormLabel>
          <RadioGroup
            aria-labelledby="export-scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
          >
            {Boolean(ids?.length) && (
              <FormControlLabel
                value="ids"
                control={<Radio />}
                label={`Selected contacts (${formatNumber(ids?.length ?? 0)})`}
              />
            )}
            {filter !== undefined && (
              <FormControlLabel
                value="filter"
                control={<Radio />}
                disabled={!filter}
                label={
                  filter
                    ? `${Object.keys(filter).length ? 'Contacts matching the current filters' : 'All contacts'}${filterCount === undefined ? '' : ` (${formatNumber(filterCount)})`}`
                    : 'Contacts matching the current filters (not possible with this mix of filters)'
                }
              />
            )}
            <FormControlLabel value="list" control={<Radio />} label="A list" />
            <FormControlLabel value="segment" control={<Radio />} label="A segment" />
          </RadioGroup>
        </div>
        {scope === 'list' && (
          <TextField select label="List" value={list} onChange={(e) => setList(e.target.value)}>
            {(lists.data ?? []).map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.name} ({formatNumber(l.contactCount)})
              </MenuItem>
            ))}
          </TextField>
        )}
        {scope === 'segment' && (
          <TextField
            select
            label="Segment"
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
          >
            {(segments.data ?? []).map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </TextField>
        )}
        <div>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <FormLabel id="export-columns" sx={{ flexGrow: 1 }}>
              Columns ({columns.length} of {allColumns.length})
            </FormLabel>
            <Button size="small" onClick={() => setUnchecked(new Set())}>
              All
            </Button>
            <Button size="small" onClick={() => setUnchecked(new Set(allColumns))}>
              None
            </Button>
          </Stack>
          <FormGroup
            aria-labelledby="export-columns"
            sx={{ display: 'grid', gridTemplateColumns: { sm: '1fr 1fr' } }}
          >
            {allColumns.map((c) => (
              <FormControlLabel
                key={c}
                control={<Checkbox checked={!unchecked.has(c)} onChange={() => toggle(c)} />}
                label={label(c)}
              />
            ))}
          </FormGroup>
          {columns.length === 0 && (
            <Typography variant="body2" color="error">
              Choose at least one column.
            </Typography>
          )}
        </div>
        <Typography variant="body2" color="text.secondary">
          The CSV opens in Excel. Phone numbers are in +91 format.
        </Typography>
        {start.error && <Alert severity="error">{getErrorMessage(start.error)}</Alert>}
      </Stack>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="export-title">
      <DialogTitle id="export-title">Export contacts</DialogTitle>
      <DialogContent>{body}</DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{jobId ? 'Close' : 'Cancel'}</Button>
        {canExport && !jobId && (
          <Button
            variant="contained"
            disabled={!ready || start.isPending}
            onClick={() => start.mutate()}
          >
            Export
          </Button>
        )}
        {current?.status === 'ready' && (
          <Button
            variant="contained"
            disabled={download.isPending}
            onClick={() => download.mutate()}
          >
            Download
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
