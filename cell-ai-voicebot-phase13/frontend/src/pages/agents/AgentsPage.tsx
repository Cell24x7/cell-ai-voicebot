import AddOutlined from '@mui/icons-material/AddOutlined';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router';

import { useConfirm } from '@/components/confirm-context';
import { DataTable, type Column } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { RelativeTime } from '@/components/RelativeTime';
import { LANGUAGE_LABELS, VOICE_LABELS } from '@/features/agents/agent-form';
import { agentKeys } from '@/features/agents/keys';
import { useAgents, useCanWriteAgents } from '@/features/agents/queries';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { agentsApi } from '@/services/api/agents';
import { getErrorMessage, isApiError } from '@/services/api/errors';
import type { AgentRow } from '@/services/api/types';
import { formatCurrencyMicros } from '@/utils/format';

const LIMIT = 20;

/** `/agents?q=&page=` — AI agents of the account (agents.read; changes need agents.write). */
export function AgentsPage() {
  const [params, setParams] = useSearchParams();
  const urlQ = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const [search, setSearch] = useState(urlQ);
  const debounced = useDebouncedValue(search.trim(), 300);
  const canWrite = useCanWriteAgents();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const navigate = useNavigate();

  // the URL follows the (debounced) search box
  useEffect(() => {
    if (debounced === urlQ) return;
    const next = new URLSearchParams(params);
    if (debounced) next.set('q', debounced);
    else next.delete('q');
    next.delete('page');
    setParams(next, { replace: true });
  }, [debounced, urlQ, params, setParams]);

  const agents = useAgents({ q: urlQ || undefined, page, limit: LIMIT });
  const refresh = () => queryClient.invalidateQueries({ queryKey: agentKeys.all });
  const onError = (err: unknown) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' });

  const toggle = useMutation({
    mutationFn: (row: AgentRow) => agentsApi.setActive(row.id, !row.isActive),
    onSuccess: (agent) => {
      enqueueSnackbar(`${agent.name} is ${agent.isActive ? 'on' : 'off'}`, { variant: 'success' });
      void refresh();
    },
    onError,
  });
  const duplicate = useMutation({
    mutationFn: (row: AgentRow) => agentsApi.duplicate(row.id),
    onSuccess: (agent) => {
      enqueueSnackbar(`Created "${agent.name}"`, { variant: 'success' });
      void refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (row: AgentRow) => agentsApi.remove(row.id),
    onSuccess: () => {
      enqueueSnackbar('Agent deleted', { variant: 'success' });
      void refresh();
    },
    onError: (err) => {
      // an agent used by call flows can't be deleted — name them
      if (isApiError(err) && err.code === 'RESOURCE_IN_USE' && err.details.length) {
        enqueueSnackbar(`${err.message} Flows: ${err.details.map((d) => d.message).join(', ')}`, {
          variant: 'error',
        });
        return;
      }
      onError(err);
    },
  });

  const askDelete = async (r: AgentRow) => {
    const ok = await confirm({
      title: `Delete "${r.name}"?`,
      message: 'The agent stops working at once. Its test conversations are kept for 30 days.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (ok) remove.mutate(r);
  };

  const columns: Column<AgentRow>[] = [
    {
      key: 'name',
      header: 'Agent',
      render: (r) => (
        <div>
          <Link component={RouterLink} to={`/agents/${r.id}/basic`} underline="hover">
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
      key: 'language',
      header: 'Language',
      render: (r) => (
        <Chip
          size="small"
          label={`${LANGUAGE_LABELS[r.language]}${r.languageMode === 'auto' ? ' · auto' : ''}`}
        />
      ),
    },
    { key: 'voice', header: 'Voice', render: (r) => VOICE_LABELS[r.voice] },
    {
      key: 'active',
      header: 'On',
      render: (r) =>
        canWrite ? (
          <Switch
            checked={r.isActive}
            onChange={() => toggle.mutate(r)}
            disabled={toggle.isPending}
            slotProps={{ input: { 'aria-label': `${r.name} on` } }}
          />
        ) : (
          <Chip
            size="small"
            variant="outlined"
            label={r.isActive ? 'On' : 'Off'}
            color={r.isActive ? 'success' : 'default'}
          />
        ),
    },
    { key: 'kbs', header: 'Knowledge', align: 'right', render: (r) => r.knowledgeBases },
    { key: 'functions', header: 'Functions', align: 'right', render: (r) => r.functions },
    {
      key: 'spend',
      header: 'This month',
      align: 'right',
      render: (r) => formatCurrencyMicros(r.monthSpendMicros),
    },
    { key: 'updated', header: 'Updated', render: (r) => <RelativeTime value={r.updatedAt} /> },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            render: (r: AgentRow) => (
              <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
                <Tooltip title="Duplicate">
                  <IconButton
                    aria-label={`Duplicate ${r.name}`}
                    onClick={() => duplicate.mutate(r)}
                    disabled={duplicate.isPending}
                  >
                    <ContentCopyOutlined fontSize="small" />
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

  const rows = agents.data?.data;
  const empty = rows?.length === 0 && !urlQ;

  return (
    <>
      <PageHeader
        title="AI agents"
        subtitle="Agents talk to your customers, check your systems and answer from your documents"
        actions={
          canWrite && (
            <Button
              variant="contained"
              startIcon={<AddOutlined />}
              onClick={() => void navigate('/agents/new')}
            >
              New agent
            </Button>
          )
        }
      />
      {empty ? (
        <EmptyState
          title="No agents yet"
          description="Start from a ready-made template (loan recovery, payment reminder, survey, support) and adjust it."
          action={
            canWrite && (
              <Button variant="contained" onClick={() => void navigate('/agents/new')}>
                Create from a template
              </Button>
            )
          }
        />
      ) : (
        <>
          <TextField
            placeholder="Search by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            sx={{ mb: 2, width: { xs: '100%', sm: 320 } }}
            slotProps={{
              htmlInput: { 'aria-label': 'Search agents' },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
          <DataTable
            aria-label="AI agents"
            columns={columns}
            rows={rows}
            getRowId={(r) => r.id}
            loading={agents.isPending}
            error={agents.error}
            onRetry={() => void agents.refetch()}
            emptyTitle="No agents match"
            emptyDescription="Try another name."
            pagination={
              agents.data
                ? {
                    page,
                    limit: LIMIT,
                    total: agents.data.meta.total,
                    onPageChange: (p) => {
                      const next = new URLSearchParams(params);
                      next.set('page', String(p));
                      setParams(next);
                    },
                  }
                : undefined
            }
          />
        </>
      )}
    </>
  );
}
