import AddOutlined from '@mui/icons-material/AddOutlined';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import FileUploadOutlined from '@mui/icons-material/FileUploadOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import UnarchiveOutlined from '@mui/icons-material/UnarchiveOutlined';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router';

import { useConfirm } from '@/components/confirm-context';
import { DataTable, type Column } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { RelativeTime } from '@/components/RelativeTime';
import { downloadJson, readJsonFile } from '@/features/flows/download';
import { flowKeys } from '@/features/flows/keys';
import { importWarningText, statusColor, statusLabel } from '@/features/flows/labels';
import { useCanWriteFlows, useFlowLiveUpdates, useFlows } from '@/features/flows/queries';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getErrorMessage, isApiError } from '@/services/api/errors';
import { flowsApi } from '@/services/api/flows';
import type { FlowListItem } from '@/services/api/types';

const LIMIT = 20;
const STATUSES = ['all', 'draft', 'published', 'archived'] as const;

/** `/flows?q=&status=&page=` — call flows of the account (flows.read; changes need flows.write). */
export function FlowsPage() {
  const [params, setParams] = useSearchParams();
  const urlQ = params.get('q') ?? '';
  const status = (params.get('status') ?? 'all') as (typeof STATUSES)[number];
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const [search, setSearch] = useState(urlQ);
  const debounced = useDebouncedValue(search.trim(), 300);
  const canWrite = useCanWriteFlows();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  useFlowLiveUpdates();

  useEffect(() => {
    if (debounced === urlQ) return;
    const next = new URLSearchParams(params);
    if (debounced) next.set('q', debounced);
    else next.delete('q');
    next.delete('page');
    setParams(next, { replace: true });
  }, [debounced, urlQ, params, setParams]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  const flows = useFlows({
    q: urlQ || undefined,
    status: status === 'all' ? undefined : status,
    page,
    limit: LIMIT,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: flowKeys.all });
  const onError = (err: unknown) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' });

  const duplicate = useMutation({
    mutationFn: (row: FlowListItem) => flowsApi.duplicate(row.id),
    onSuccess: (flow) => {
      enqueueSnackbar(`Created "${flow.name}"`, { variant: 'success' });
      void refresh();
    },
    onError,
  });
  const archive = useMutation({
    mutationFn: (row: FlowListItem) =>
      row.status === 'archived' ? flowsApi.unarchive(row.id) : flowsApi.archive(row.id),
    onSuccess: (flow) => {
      enqueueSnackbar(
        flow.status === 'archived' ? `"${flow.name}" archived` : `"${flow.name}" restored`,
        {
          variant: 'success',
        },
      );
      void refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (row: FlowListItem) => flowsApi.remove(row.id),
    onSuccess: () => {
      enqueueSnackbar('Flow deleted', { variant: 'success' });
      void refresh();
    },
    onError: (err) => {
      if (isApiError(err) && err.code === 'RESOURCE_IN_USE') {
        const users = err.details.map((d) => d.message).join(', ');
        enqueueSnackbar(`This flow is in use${users ? `: ${users}` : ''}.`, { variant: 'error' });
        return;
      }
      onError(err);
    },
  });
  const exportFlow = useMutation({
    mutationFn: (row: FlowListItem) => flowsApi.exportFile(row.id),
    onSuccess: (file) => downloadJson(file.fileName, file.data),
    onError,
  });
  const importFlow = useMutation({
    mutationFn: async (file: File) => {
      const json = await readJsonFile(file);
      if (json === null) throw new Error('This file is not a flow export (JSON).');
      return flowsApi.importFile(json);
    },
    onSuccess: (result) => {
      enqueueSnackbar(`Imported "${result.flow.name}"`, { variant: 'success' });
      for (const w of result.warnings)
        enqueueSnackbar(importWarningText(w), { variant: 'warning' });
      void refresh();
      void navigate(`/flows/${result.flow.id}`);
    },
    onError: (err) =>
      enqueueSnackbar(
        isApiError(err) || !(err instanceof Error) ? getErrorMessage(err) : err.message,
        {
          variant: 'error',
        },
      ),
  });

  const askDelete = async (r: FlowListItem) => {
    const ok = await confirm({
      title: `Delete "${r.name}"?`,
      message:
        'The flow and its versions are removed after 30 days. Campaigns already running keep their version.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (ok) remove.mutate(r);
  };

  const columns: Column<FlowListItem>[] = [
    {
      key: 'name',
      header: 'Flow',
      render: (r) => (
        <div>
          <Link component={RouterLink} to={`/flows/${r.id}`} underline="hover">
            {r.name}
          </Link>
          {r.description && (
            <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 320 }}>
              {r.description}
            </Typography>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
          <Chip size="small" label={statusLabel(r)} color={statusColor(r.status)} />
          {r.status !== 'draft' && r.hasUnpublishedChanges && (
            <Chip size="small" variant="outlined" label="Unpublished changes" />
          )}
        </Stack>
      ),
    },
    { key: 'nodes', header: 'Steps', align: 'right', render: (r) => r.nodesCount },
    {
      key: 'agents',
      header: 'AI agents',
      render: (r) => (r.agents.length ? r.agents.map((a) => a.name).join(', ') : '—'),
    },
    {
      key: 'updated',
      header: 'Updated',
      render: (r) => (
        <span>
          <RelativeTime value={r.updatedAt} />
          {r.updatedBy?.name ? ` · ${r.updatedBy.name}` : ''}
        </span>
      ),
    },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            render: (r: FlowListItem) => (
              <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
                <Tooltip title="Duplicate">
                  <IconButton
                    aria-label={`Duplicate ${r.name}`}
                    onClick={() => duplicate.mutate(r)}
                  >
                    <ContentCopyOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Export JSON">
                  <IconButton aria-label={`Export ${r.name}`} onClick={() => exportFlow.mutate(r)}>
                    <FileDownloadOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={r.status === 'archived' ? 'Unarchive' : 'Archive'}>
                  <IconButton
                    aria-label={`${r.status === 'archived' ? 'Unarchive' : 'Archive'} ${r.name}`}
                    onClick={() => archive.mutate(r)}
                  >
                    {r.status === 'archived' ? (
                      <UnarchiveOutlined fontSize="small" />
                    ) : (
                      <ArchiveOutlined fontSize="small" />
                    )}
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton aria-label={`Delete ${r.name}`} onClick={() => void askDelete(r)}>
                    <DeleteOutlineOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            ),
          },
        ]
      : []),
  ];

  const rows = flows.data?.data;
  const empty = rows?.length === 0 && !urlQ && status === 'all';

  return (
    <>
      <PageHeader
        title="Call flows"
        subtitle="What the bot says, which keys it listens for, when the AI agent talks and how each call ends"
        actions={
          canWrite && (
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                startIcon={<FileUploadOutlined />}
                onClick={() => fileInput.current?.click()}
                disabled={importFlow.isPending}
              >
                Import JSON
              </Button>
              <Button
                variant="contained"
                startIcon={<AddOutlined />}
                onClick={() => void navigate('/flows/new')}
              >
                New flow
              </Button>
            </Stack>
          )
        }
      />
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        aria-label="Flow JSON file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importFlow.mutate(file);
          e.target.value = '';
        }}
      />
      {empty ? (
        <EmptyState
          title="No call flows yet"
          description="Start from a template (loan recovery, payment reminder, survey, inbound support) and adjust it in the builder."
          action={
            canWrite && (
              <Button variant="contained" onClick={() => void navigate('/flows/new')}>
                Create from a template
              </Button>
            )
          }
        />
      ) : (
        <>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField
              placeholder="Search by name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              size="small"
              sx={{ width: { xs: '100%', sm: 320 } }}
              slotProps={{
                htmlInput: { 'aria-label': 'Search flows' },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchOutlined fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <TextField
              select
              size="small"
              label="Status"
              value={status}
              onChange={(e) => setParam('status', e.target.value === 'all' ? null : e.target.value)}
              sx={{ width: { xs: '100%', sm: 180 } }}
            >
              {STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <DataTable
            aria-label="Call flows"
            columns={columns}
            rows={rows}
            getRowId={(r) => r.id}
            loading={flows.isPending}
            error={flows.error}
            onRetry={() => void flows.refetch()}
            emptyTitle="No flows match"
            emptyDescription="Try another name or status."
            pagination={
              flows.data
                ? {
                    page,
                    limit: LIMIT,
                    total: flows.data.meta.total,
                    onPageChange: (p) => setParam('page', String(p)),
                  }
                : undefined
            }
          />
        </>
      )}
    </>
  );
}
