import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined';
import LinkOutlined from '@mui/icons-material/LinkOutlined';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useRef, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router';

import { useConfirm } from '@/components/confirm-context';
import { DataTable, type Column } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { StatusChip } from '@/components/StatusChip';
import { knowledgeKeys } from '@/features/agents/keys';
import { useCanWriteAgents } from '@/features/agents/queries';
import {
  formatBytes,
  KNOWLEDGE_UPLOAD,
  uploadProblem,
  useKnowledgeBase,
  useKnowledgeSources,
} from '@/features/knowledge/queries';
import { useKnowledgeLiveUpdates } from '@/features/knowledge/useKnowledgeLiveUpdates';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import { knowledgeApi } from '@/services/api/knowledge';
import type { KnowledgeSearchResult, KnowledgeSource } from '@/services/api/types';

const STATUS_LABELS: Record<KnowledgeSource['status'], string> = {
  queued: 'Waiting',
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
  stale: 'Needs re-index',
};

/** `/knowledge/:id` — sources of one knowledge base, uploads and a test search. */
export function KnowledgeDetailPage() {
  const { id = '' } = useParams();
  useKnowledgeLiveUpdates();
  const kb = useKnowledgeBase(id);
  const sources = useKnowledgeSources(id);
  const canWrite = useCanWriteAgents();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: knowledgeKeys.sources(id) });
    void queryClient.invalidateQueries({ queryKey: knowledgeKeys.detail(id) });
    void queryClient.invalidateQueries({ queryKey: knowledgeKeys.list });
  };
  const onError = (err: unknown) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' });

  const upload = useMutation({
    mutationFn: (files: File[]) => knowledgeApi.upload(id, files, setProgress),
    onSuccess: (added) => {
      setProgress(null);
      enqueueSnackbar(`${added.length} file${added.length === 1 ? '' : 's'} added — processing`, {
        variant: 'success',
      });
      refresh();
    },
    onError: (err) => {
      setProgress(null);
      setUploadError(getErrorMessage(err));
    },
  });
  const pick = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    const problem = uploadProblem(files);
    setUploadError(problem);
    if (!problem) upload.mutate(files);
  };
  const reindexAll = useMutation({
    mutationFn: () => knowledgeApi.reindex(id),
    onSuccess: () => {
      enqueueSnackbar('Re-indexing all sources', { variant: 'success' });
      refresh();
    },
    onError,
  });
  const reindexOne = useMutation({
    mutationFn: (s: KnowledgeSource) => knowledgeApi.reindexSource(id, s.id),
    onSuccess: refresh,
    onError,
  });
  const removeOne = useMutation({
    mutationFn: (s: KnowledgeSource) => knowledgeApi.removeSource(id, s.id),
    onSuccess: () => {
      enqueueSnackbar('Source removed', { variant: 'success' });
      refresh();
    },
    onError,
  });
  const askRemove = async (s: KnowledgeSource) => {
    if (
      await confirm({
        title: `Remove "${s.title}"?`,
        message: 'Its pieces are deleted and agents stop using it.',
        confirmText: 'Remove',
        destructive: true,
      })
    ) {
      removeOne.mutate(s);
    }
  };

  const columns: Column<KnowledgeSource>[] = [
    {
      key: 'title',
      header: 'Source',
      render: (s) => (
        <div>
          <Typography variant="body2">{s.title}</Typography>
          <Typography variant="caption" color="text.secondary">
            {s.kind === 'url' ? s.url : (s.fileType ?? '').toUpperCase()}
          </Typography>
        </div>
      ),
    },
    {
      key: 'size',
      header: 'Size',
      render: (s) =>
        s.chars ? `${s.chars.toLocaleString('en-IN')} chars` : s.bytes ? formatBytes(s.bytes) : '—',
    },
    { key: 'chunks', header: 'Pieces', align: 'right', render: (s) => s.chunks },
    {
      key: 'status',
      header: 'Status',
      render: (s) => (
        <Stack spacing={0.5} sx={{ minWidth: 140 }}>
          <StatusChip
            status={s.status === 'stale' ? 'expired' : s.status === 'queued' ? 'pending' : s.status}
            label={STATUS_LABELS[s.status]}
          />
          {(s.status === 'processing' || s.status === 'queued') && (
            <LinearProgress
              variant="determinate"
              value={s.progress}
              aria-label={`${s.title} progress`}
            />
          )}
          {s.error && (
            <Typography variant="caption" color="error">
              {s.error}
            </Typography>
          )}
        </Stack>
      ),
    },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            render: (s: KnowledgeSource) => (
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                <Button
                  size="small"
                  onClick={() => reindexOne.mutate(s)}
                  aria-label={`Re-index ${s.title}`}
                >
                  Re-index
                </Button>
                <Button
                  size="small"
                  color="error"
                  onClick={() => void askRemove(s)}
                  aria-label={`Remove ${s.title}`}
                >
                  Remove
                </Button>
              </Stack>
            ),
          },
        ]
      : []),
  ];

  if (kb.isError) {
    return (
      <>
        <PageHeader title="Knowledge base" />
        <Alert severity="error" action={<Button onClick={() => void kb.refetch()}>Retry</Button>}>
          {getErrorMessage(kb.error)}
        </Alert>
      </>
    );
  }
  if (!kb.data) return <Skeleton variant="rounded" height={240} />;

  return (
    <>
      <PageHeader
        title={kb.data.name}
        subtitle={`${kb.data.sourcesCount} sources · ${kb.data.chunksCount} pieces${kb.data.linkedAgents.length ? ` · used by ${kb.data.linkedAgents.map((a) => a.name).join(', ')}` : ''}`}
        actions={
          <>
            <Button component={RouterLink} to="/knowledge" startIcon={<ArrowBackOutlined />}>
              All knowledge
            </Button>
            {canWrite && (
              <Button
                startIcon={<RefreshOutlined />}
                onClick={() => reindexAll.mutate()}
                disabled={reindexAll.isPending}
              >
                Re-index all
              </Button>
            )}
          </>
        }
      />
      {kb.data.status === 'stale' && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          The AI embedding model changed — re-index so agents can search this knowledge base again.
        </Alert>
      )}
      <Stack spacing={3}>
        {canWrite && (
          <Paper
            variant="outlined"
            sx={{
              p: 3,
              textAlign: 'center',
              borderStyle: 'dashed',
              bgcolor: dragging ? 'action.hover' : undefined,
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files);
            }}
          >
            <Stack spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Drop PDF, Word, text or Markdown files here (up to {KNOWLEDGE_UPLOAD.maxFiles} at a
                time, 10 MB each)
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  startIcon={<CloudUploadOutlined />}
                  onClick={() => fileInput.current?.click()}
                  disabled={upload.isPending}
                >
                  Upload files
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<LinkOutlined />}
                  onClick={() => setUrlOpen(true)}
                >
                  Add web page
                </Button>
              </Stack>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept={KNOWLEDGE_UPLOAD.accept}
                hidden
                aria-label="Choose files"
                onChange={(e) => {
                  pick(e.target.files);
                  e.target.value = '';
                }}
              />
              {progress !== null && (
                <Box sx={{ width: '100%', maxWidth: 360 }}>
                  <LinearProgress
                    variant="determinate"
                    value={progress}
                    aria-label="Upload progress"
                  />
                </Box>
              )}
              {uploadError && <Alert severity="error">{uploadError}</Alert>}
            </Stack>
          </Paper>
        )}
        <DataTable
          aria-label="Sources"
          columns={columns}
          rows={sources.data}
          getRowId={(s) => s.id}
          loading={sources.isPending}
          error={sources.error}
          onRetry={() => void sources.refetch()}
          emptyTitle="No sources yet"
          emptyDescription="Upload a file or add a web page."
        />
        <TryQuestion kbId={id} />
      </Stack>
      {urlOpen && (
        <AddUrlDialog
          kbId={id}
          onClose={() => setUrlOpen(false)}
          onAdded={() => {
            setUrlOpen(false);
            enqueueSnackbar('Web page added — processing', { variant: 'success' });
            refresh();
          }}
        />
      )}
    </>
  );
}

function AddUrlDialog({
  kbId,
  onClose,
  onAdded,
}: {
  kbId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [url, setUrl] = useState('https://');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () =>
      knowledgeApi.addUrl(kbId, {
        url: url.trim(),
        ...(title.trim() ? { title: title.trim() } : {}),
      }),
    onSuccess: onAdded,
    onError: (err) => {
      const e = toApiError(err);
      setError(
        e.code === 'FUNCTION_URL_BLOCKED'
          ? `${e.message} ${e.details[0]?.message ?? ''}`.trim()
          : (e.details[0]?.message ?? getErrorMessage(err)),
      );
    },
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <DialogTitle>Add a web page</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Page address"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              error={Boolean(error)}
              helperText={
                error ?? 'One public page (HTML or text, up to 2 MB). Scripts are not run.'
              }
              autoFocus
            />
            <TextField
              label="Title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={add.isPending}>
            Add page
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function TryQuestion({ kbId }: { kbId: string }) {
  const [query, setQuery] = useState('');
  const search = useMutation({
    mutationFn: () => knowledgeApi.search(kbId, { query: query.trim(), topK: 4 }),
  });
  const results: KnowledgeSearchResult[] | undefined = search.data;
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="subtitle1" component="h2">
          Try a question
        </Typography>
        <Stack
          component="form"
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) search.mutate();
          }}
        >
          <TextField
            label="Question"
            placeholder="e.g. late fee kitni lagti hai?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            fullWidth
            size="small"
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
          <Button type="submit" variant="outlined" disabled={!query.trim() || search.isPending}>
            Search
          </Button>
        </Stack>
        {search.isError && <Alert severity="error">{getErrorMessage(search.error)}</Alert>}
        {results?.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Nothing matched. Add a document that answers this, or rephrase.
          </Typography>
        )}
        {results?.map((r, i) => (
          <Box key={r.chunkId} role="article" aria-label={`Result ${i + 1}: ${r.title}`}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="subtitle2">{r.title}</Typography>
              <Typography variant="caption" color="text.secondary">
                {r.sourceTitle}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', my: 0.5 }}>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, Math.max(0, r.score * 100))}
                sx={{ flex: 1, maxWidth: 200 }}
                aria-label={`Match ${r.score.toFixed(2)}`}
              />
              <Typography variant="caption">{r.score.toFixed(2)}</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
              {r.text.length > 400 ? `${r.text.slice(0, 400)}…` : r.text}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
