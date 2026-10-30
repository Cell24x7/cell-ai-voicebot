import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import RestoreOutlined from '@mui/icons-material/RestoreOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { Link as RouterLink, useNavigate, useParams } from 'react-router';

import { useConfirm } from '@/components/confirm-context';
import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { RelativeTime } from '@/components/RelativeTime';
import { downloadJson } from '@/features/flows/download';
import { flowKeys } from '@/features/flows/keys';
import {
  useCanPublishFlows,
  useCanWriteFlows,
  useFlow,
  useFlowVersions,
} from '@/features/flows/queries';
import { getErrorMessage } from '@/services/api/errors';
import { flowsApi } from '@/services/api/flows';
import type { FlowVersionSummary } from '@/services/api/types';

/** `/flows/:id/versions` — published versions: view, restore into the draft, export. */
export function FlowVersionsPage() {
  const { id = '' } = useParams();
  const flow = useFlow(id);
  const versions = useFlowVersions(id);
  const canPublish = useCanPublishFlows();
  const canWrite = useCanWriteFlows();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const onError = (err: unknown) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' });

  const restore = useMutation({
    mutationFn: (v: FlowVersionSummary) =>
      flowsApi.restore(id, v.version, flow.data?.revision ?? 0),
    onSuccess: (restored, v) => {
      // the builder reads this on mount — never let it open the old draft
      queryClient.setQueryData(flowKeys.detail(id), restored);
      void queryClient.invalidateQueries({ queryKey: flowKeys.all });
      enqueueSnackbar(`v${String(v.version)} copied into the draft — publish it to go live`, {
        variant: 'success',
      });
      void navigate(`/flows/${id}`);
    },
    onError,
  });
  const exportVersion = useMutation({
    mutationFn: (v: FlowVersionSummary) => flowsApi.exportFile(id, v.version),
    onSuccess: (file) => downloadJson(file.fileName, file.data),
    onError,
  });

  const askRestore = async (v: FlowVersionSummary) => {
    const ok = await confirm({
      title: `Restore v${String(v.version)}?`,
      message: 'The draft is replaced by this version. Unpublished changes in the draft are lost.',
      confirmText: 'Restore',
    });
    if (ok) restore.mutate(v);
  };

  const columns: Column<FlowVersionSummary>[] = [
    {
      key: 'version',
      header: 'Version',
      render: (v) => (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <span>v{v.version}</span>
          {v.current && <Chip size="small" color="success" label="Live" />}
        </Stack>
      ),
    },
    { key: 'notes', header: 'Notes', render: (v) => v.notes ?? '—' },
    { key: 'nodes', header: 'Steps', align: 'right', render: (v) => v.nodesCount },
    {
      key: 'by',
      header: 'Published',
      render: (v) => (
        <span>
          <RelativeTime value={v.publishedAt} />
          {v.publishedBy?.name ? ` · ${v.publishedBy.name}` : ''}
        </span>
      ),
    },
    {
      key: 'checksum',
      header: 'Checksum',
      render: (v) => <code>{v.checksum.slice(0, 8)}</code>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (v) => (
        <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
          <Tooltip title="View">
            <IconButton
              aria-label={`View v${String(v.version)}`}
              component={RouterLink}
              to={`/flows/${id}?v=${String(v.version)}`}
            >
              <VisibilityOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
          {canWrite && (
            <Tooltip title="Export JSON">
              <IconButton
                aria-label={`Export v${String(v.version)}`}
                onClick={() => exportVersion.mutate(v)}
              >
                <FileDownloadOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {canPublish && (
            <Tooltip title="Restore into the draft">
              <IconButton
                aria-label={`Restore v${String(v.version)}`}
                onClick={() => void askRestore(v)}
                disabled={!flow.data || restore.isPending}
              >
                <RestoreOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={flow.data ? `${flow.data.name} — versions` : 'Versions'}
        subtitle="Every publish is kept unchanged. Restore one into the draft, then publish to roll back."
        actions={
          <Button component={RouterLink} to={`/flows/${id}`} startIcon={<ArrowBackOutlined />}>
            Back to the builder
          </Button>
        }
      />
      <DataTable
        aria-label="Versions"
        columns={columns}
        rows={versions.data}
        getRowId={(v) => v.id}
        loading={versions.isPending}
        error={versions.error}
        onRetry={() => void versions.refetch()}
        emptyTitle="Not published yet"
        emptyDescription="Publish the flow from the builder to create v1."
      />
    </>
  );
}
