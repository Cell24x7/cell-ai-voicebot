import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';

import { useConfirm } from '@/components/confirm-context';
import { DataTable, type Column } from '@/components/DataTable';
import { RelativeTime } from '@/components/RelativeTime';
import { useCan } from '@/features/auth/hooks';
import { useCanWriteCampaigns } from '@/features/campaigns/permissions';
import { ExportDialog } from '@/features/contact-exports/ExportDialog';
import { useCanExport } from '@/features/contact-exports/useExportJob';
import { segmentKeys } from '@/features/contacts/keys';
import { useCustomFields, useSegments } from '@/features/contacts/queries';
import { getErrorMessage } from '@/services/api/errors';
import { segmentsApi } from '@/services/api/segments';
import type { Segment } from '@/services/api/types';
import { formatNumber } from '@/utils/format';

import { describeFilter } from './segment-filter';
import { SegmentDialog } from './SegmentDialog';

/** `/contacts/segments` — saved filters with live counts. */
export function SegmentsTab() {
  const can = useCan();
  const canExport = useCanExport();
  const canCampaign = useCanWriteCampaigns();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const segments = useSegments(true);
  const fields = useCustomFields();
  const [editing, setEditing] = useState<Segment | 'new' | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => segmentsApi.remove(id),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Segment deleted', { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: segmentKeys.all });
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  const write = can('contacts.write');

  const columns: Column<Segment>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (s) => (
        <Link component={RouterLink} to={`/contacts/all?segmentId=${s.id}`}>
          {s.name}
        </Link>
      ),
    },
    {
      key: 'count',
      header: 'Contacts',
      align: 'right',
      render: (s) => (s.contactCount === undefined ? '—' : formatNumber(s.contactCount)),
    },
    {
      key: 'filter',
      header: 'Filter',
      render: (s) => (
        <>
          {describeFilter(s.filter, fields.data ?? [])}
          {s.invalidConditions.length > 0 && (
            <Tooltip title="A field it uses was deleted — it matches nothing until you edit it.">
              <Chip size="small" color="warning" label="Needs fixing" sx={{ ml: 1 }} />
            </Tooltip>
          )}
        </>
      ),
    },
    { key: 'updated', header: 'Updated', render: (s) => <RelativeTime value={s.updatedAt} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (s) => (
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
          {canCampaign && (
            <Button size="small" component={RouterLink} to={`/campaigns/new?segmentId=${s.id}`}>
              Create campaign
            </Button>
          )}
          {canExport && (
            <Button size="small" onClick={() => setExporting(s.id)}>
              Export
            </Button>
          )}
          {write && (
            <Button size="small" onClick={() => setEditing(s)}>
              Edit
            </Button>
          )}
          {write && (
            <Button
              size="small"
              color="error"
              onClick={() =>
                void confirm({
                  title: `Delete segment "${s.name}"?`,
                  message: 'Contacts are not deleted — only the saved filter.',
                  confirmText: 'Delete',
                  destructive: true,
                }).then((ok) => ok && remove.mutate(s.id))
              }
            >
              Delete
            </Button>
          )}
        </Stack>
      ),
    },
  ];

  return (
    <>
      {write && (
        <Stack direction="row" sx={{ mb: 2, justifyContent: 'flex-end' }}>
          <Button variant="outlined" onClick={() => setEditing('new')}>
            New segment
          </Button>
        </Stack>
      )}
      <DataTable
        aria-label="Segments"
        columns={columns}
        rows={segments.data}
        getRowId={(s) => s.id}
        loading={segments.isPending}
        error={segments.error}
        onRetry={() => void segments.refetch()}
        emptyTitle="No segments yet"
        emptyDescription="A segment is a saved filter, e.g. “overdue by more than 30 days”. Campaigns can call a segment."
      />
      {editing && (
        <SegmentDialog
          open
          onClose={() => setEditing(null)}
          fields={fields.data ?? []}
          segment={editing === 'new' ? undefined : editing}
        />
      )}
      {exporting && <ExportDialog open onClose={() => setExporting(null)} segmentId={exporting} />}
    </>
  );
}
