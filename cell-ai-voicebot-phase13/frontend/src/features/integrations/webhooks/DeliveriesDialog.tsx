import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { DataTable } from '@/components/DataTable';
import { RelativeTime } from '@/components/RelativeTime';
import { StatusChip } from '@/components/StatusChip';
import { getErrorMessage } from '@/services/api/errors';
import type { WebhookDelivery, WebhookEndpoint } from '@/services/api/types';
import {
  WEBHOOK_EVENTS,
  webhooksApi,
  type DeliveriesQuery,
  type WebhookEventType,
} from '@/services/api/webhooks';

import { integrationKeys } from '../keys';

import { canReplay, DELIVERY_LABELS } from './webhooks';

const STATUS_COLOR: Record<WebhookDelivery['status'], string> = {
  pending: 'pending',
  succeeded: 'completed',
  failed: 'failed',
  gave_up: 'failed',
};

/** Delivery log of one endpoint (30 days): filters, answer snippet as text, Replay. */
export function DeliveriesDialog({
  endpoint,
  canManage,
  onClose,
}: {
  endpoint: WebhookEndpoint;
  canManage: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Omit<DeliveriesQuery, 'cursor'>>({});
  const [open, setOpen] = useState<WebhookDelivery | null>(null);
  const log = useInfiniteQuery({
    queryKey: integrationKeys.deliveries(endpoint.id, filters),
    queryFn: ({ pageParam }) =>
      webhooksApi.deliveries(endpoint.id, {
        ...filters,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    meta: { silent: true },
  });
  const replay = useMutation({
    mutationFn: (id: string) => webhooksApi.replay(id),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Sending again — the log updates in a moment', { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: [...integrationKeys.webhooks, endpoint.id] });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: 'error' }),
  });
  const rows = log.data?.pages.flatMap((p) => p.items);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg" aria-labelledby="deliveries-title">
      <DialogTitle id="deliveries-title">
        Deliveries — {endpoint.description || endpoint.url}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              select
              size="small"
              label="Status"
              value={filters.status ?? ''}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  status: (e.target.value || undefined) as DeliveriesQuery['status'],
                })
              }
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">Any</MenuItem>
              {Object.entries(DELIVERY_LABELS).map(([k, label]) => (
                <MenuItem key={k} value={k}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Event"
              value={filters.type ?? ''}
              onChange={(e) =>
                setFilters({ ...filters, type: (e.target.value || undefined) as WebhookEventType })
              }
              sx={{ minWidth: 240 }}
            >
              <MenuItem value="">Any</MenuItem>
              {WEBHOOK_EVENTS.map((ev) => (
                <MenuItem key={ev.key} value={ev.key}>
                  {ev.key}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <DataTable<WebhookDelivery>
            aria-label="Deliveries"
            columns={[
              {
                key: 'at',
                header: 'When',
                render: (d) => <RelativeTime value={d.lastAttemptAt ?? d.createdAt} />,
              },
              {
                key: 'type',
                header: 'Event',
                render: (d) => (
                  <span>
                    <code>{d.type}</code>
                    {d.test ? ' (test)' : ''}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (d) => (
                  <StatusChip status={STATUS_COLOR[d.status]} label={DELIVERY_LABELS[d.status]} />
                ),
              },
              { key: 'attempt', header: 'Attempts', render: (d) => String(d.attempt) },
              {
                key: 'answer',
                header: 'Answer',
                render: (d) =>
                  d.responseStatus
                    ? `HTTP ${String(d.responseStatus)} · ${String(d.responseMs ?? 0)} ms`
                    : (d.error ?? '—'),
              },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (d) => (
                  <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                    <Button size="small" onClick={() => setOpen(d)}>
                      Details
                    </Button>
                    {canManage && canReplay(d) && (
                      <Button
                        size="small"
                        disabled={replay.isPending}
                        onClick={() => replay.mutate(d.id)}
                      >
                        Replay
                      </Button>
                    )}
                  </Stack>
                ),
              },
            ]}
            rows={rows}
            getRowId={(d) => d.id}
            loading={log.isPending}
            error={log.error}
            onRetry={() => void log.refetch()}
            emptyTitle="No deliveries yet"
            emptyDescription="Send a test event or wait for the next call."
          />
          {log.hasNextPage && (
            <Button
              sx={{ alignSelf: 'center' }}
              disabled={log.isFetchingNextPage}
              onClick={() => void log.fetchNextPage()}
            >
              Show older
            </Button>
          )}
          {open && (
            <Stack spacing={1} aria-label="Delivery details">
              <Typography variant="subtitle2">
                Event <code>{open.eventId}</code> — {open.attempts.length} attempt(s)
              </Typography>
              {open.attempts.map((a) => (
                <Typography key={a.attempt} variant="body2">
                  #{a.attempt} · {new Date(a.at).toLocaleString()} ·{' '}
                  {a.ok ? 'delivered' : (a.error ?? 'failed')}
                  {a.responseStatus ? ` · HTTP ${String(a.responseStatus)}` : ''} · {a.responseMs}{' '}
                  ms
                </Typography>
              ))}
              {open.nextAttemptAt && (
                <Typography variant="body2">
                  Next try <RelativeTime value={open.nextAttemptAt} />
                </Typography>
              )}
              {open.responseSnippet && (
                <Typography
                  component="pre"
                  variant="body2"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    bgcolor: 'action.hover',
                    p: 1,
                  }}
                >
                  {open.responseSnippet}
                </Typography>
              )}
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
