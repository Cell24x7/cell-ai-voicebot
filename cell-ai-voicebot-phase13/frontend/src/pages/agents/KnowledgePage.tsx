import AddOutlined from '@mui/icons-material/AddOutlined';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';

import { useConfirm } from '@/components/confirm-context';
import { DataTable, type Column } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { RelativeTime } from '@/components/RelativeTime';
import { StatusChip } from '@/components/StatusChip';
import { knowledgeKeys } from '@/features/agents/keys';
import { useCanWriteAgents } from '@/features/agents/queries';
import { useKnowledgeBases } from '@/features/knowledge/queries';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import { knowledgeApi } from '@/services/api/knowledge';
import type { KnowledgeBase } from '@/services/api/types';

/** Create / rename dialog. */
export function KnowledgeBaseDialog({
  base,
  open,
  onClose,
  onSaved,
}: {
  base: KnowledgeBase | null;
  open: boolean;
  onClose: () => void;
  onSaved: (kb: KnowledgeBase) => void;
}) {
  const [name, setName] = useState(base?.name ?? '');
  const [description, setDescription] = useState(base?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim() || null };
      return base ? knowledgeApi.update(base.id, body) : knowledgeApi.create(body);
    },
    onSuccess: onSaved,
    onError: (err) => setError(toApiError(err).details[0]?.message ?? getErrorMessage(err)),
  });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) setError('Enter a name');
          else save.mutate();
        }}
      >
        <DialogTitle>{base ? 'Rename knowledge base' : 'New knowledge base'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              error={Boolean(error)}
              helperText={error ?? undefined}
              autoFocus
              slotProps={{ htmlInput: { maxLength: 80 } }}
            />
            <TextField
              label="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              multiline
              slotProps={{ htmlInput: { maxLength: 300 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={save.isPending}>
            {base ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** `/knowledge` — knowledge bases of the account. */
export function KnowledgePage() {
  const bases = useKnowledgeBases();
  const canWrite = useCanWriteAgents();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<KnowledgeBase | 'new' | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: knowledgeKeys.all });

  const remove = useMutation({
    mutationFn: ({ kb, force }: { kb: KnowledgeBase; force: boolean }) =>
      knowledgeApi.remove(kb.id, force),
    onSuccess: () => {
      enqueueSnackbar('Knowledge base deleted', { variant: 'success' });
      void refresh();
    },
  });

  const askDelete = async (kb: KnowledgeBase) => {
    const ok = await confirm({
      title: `Delete "${kb.name}"?`,
      message: 'All its files and pages are deleted too.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync({ kb, force: false });
    } catch (err) {
      const e = toApiError(err);
      if (e.status !== 409) {
        enqueueSnackbar(getErrorMessage(err), { variant: 'error' });
        return;
      }
      const unlink = await confirm({
        title: 'Used by agents',
        message: `${e.message} Unlink it from these agents and delete it?`,
        confirmText: 'Unlink and delete',
        destructive: true,
      });
      if (unlink) {
        await remove.mutateAsync({ kb, force: true }).catch((e2: unknown) => {
          enqueueSnackbar(getErrorMessage(e2), { variant: 'error' });
        });
      }
    }
  };

  const columns: Column<KnowledgeBase>[] = [
    {
      key: 'name',
      header: 'Knowledge base',
      render: (kb) => (
        <div>
          <Link component={RouterLink} to={`/knowledge/${kb.id}`} underline="hover">
            {kb.name}
          </Link>
          {kb.description && (
            <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 320 }}>
              {kb.description}
            </Typography>
          )}
        </div>
      ),
    },
    { key: 'sources', header: 'Sources', align: 'right', render: (kb) => kb.sourcesCount },
    { key: 'chunks', header: 'Pieces', align: 'right', render: (kb) => kb.chunksCount },
    {
      key: 'status',
      header: 'Status',
      render: (kb) => (
        <StatusChip
          status={kb.status === 'ok' ? 'ready' : 'expired'}
          label={kb.status === 'ok' ? 'Ready' : 'Needs re-index'}
        />
      ),
    },
    {
      key: 'agents',
      header: 'Used by',
      render: (kb) =>
        kb.linkedAgents.length ? kb.linkedAgents.map((a) => a.name).join(', ') : '—',
    },
    { key: 'updated', header: 'Updated', render: (kb) => <RelativeTime value={kb.updatedAt} /> },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            render: (kb: KnowledgeBase) => (
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                <Button
                  size="small"
                  onClick={() => setEditing(kb)}
                  aria-label={`Rename ${kb.name}`}
                >
                  Rename
                </Button>
                <Button
                  size="small"
                  color="error"
                  onClick={() => void askDelete(kb)}
                  aria-label={`Delete ${kb.name}`}
                >
                  Delete
                </Button>
              </Stack>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Knowledge"
        subtitle="Documents and web pages your agents answer from"
        actions={
          canWrite && (
            <Button
              variant="contained"
              startIcon={<AddOutlined />}
              onClick={() => setEditing('new')}
            >
              New knowledge base
            </Button>
          )
        }
      />
      {bases.data?.length === 0 ? (
        <EmptyState
          title="No knowledge bases yet"
          description="Upload FAQs, policies or terms (PDF, Word, text) and link them to an agent."
          action={
            canWrite && (
              <Button variant="contained" onClick={() => setEditing('new')}>
                Create a knowledge base
              </Button>
            )
          }
        />
      ) : (
        <DataTable
          aria-label="Knowledge bases"
          columns={columns}
          rows={bases.data}
          getRowId={(kb) => kb.id}
          loading={bases.isPending}
          error={bases.error}
          onRetry={() => void bases.refetch()}
        />
      )}
      {editing && (
        <KnowledgeBaseDialog
          base={editing === 'new' ? null : editing}
          open
          onClose={() => setEditing(null)}
          onSaved={() => {
            enqueueSnackbar(
              editing === 'new' ? 'Knowledge base created' : 'Knowledge base renamed',
              { variant: 'success' },
            );
            setEditing(null);
            void refresh();
          }}
        />
      )}
    </>
  );
}
