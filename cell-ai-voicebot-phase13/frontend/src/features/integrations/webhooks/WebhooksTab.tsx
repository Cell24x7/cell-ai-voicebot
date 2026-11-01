import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { useConfirm } from '@/components/confirm-context';
import { DataTable } from '@/components/DataTable';
import { RelativeTime } from '@/components/RelativeTime';
import { StatusChip } from '@/components/StatusChip';
import { usePermission, useSession } from '@/features/auth/hooks';
import { getErrorMessage } from '@/services/api/errors';
import type { WebhookEndpoint } from '@/services/api/types';
import { webhooksApi } from '@/services/api/webhooks';

import { integrationKeys } from '../keys';

import { DeliveriesDialog } from './DeliveriesDialog';
import { EndpointDialog, SecretDialog, TestDialog } from './WebhookDialogs';
import { endpointState, eventsLabel, STATE_LABELS } from './webhooks';

const STATE_CHIP = { active: 'active', paused: 'disabled', failing: 'failed' } as const;

type Open =
  | { kind: 'edit'; endpoint: WebhookEndpoint | null }
  | { kind: 'test' | 'deliveries'; endpoint: WebhookEndpoint }
  | { kind: 'secret'; secret: string }
  | null;

/** Integrations → Webhooks (`integrations.manage`). */
export function WebhooksTab() {
  const session = useSession();
  const canManage = usePermission('integrations.manage') && !session?.impersonation;
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [open, setOpen] = useState<Open>(null);
  const list = useQuery({
    queryKey: integrationKeys.webhooks,
    queryFn: webhooksApi.list,
    meta: { silent: true },
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: integrationKeys.webhooks });
  const act = useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string;
      action: 'enable' | 'pause' | 'remove' | 'rotate';
    }) => {
      if (action === 'enable') await webhooksApi.enable(id);
      else if (action === 'pause') await webhooksApi.update(id, { active: false });
      else if (action === 'remove') await webhooksApi.remove(id);
      else return (await webhooksApi.rotateSecret(id)).secret;
      return null;
    },
    meta: { silent: true },
    onSuccess: (secret) => {
      refresh();
      if (secret) setOpen({ kind: 'secret', secret });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: 'error' }),
  });
  const failing = (list.data ?? []).filter((e) => endpointState(e) === 'failing');

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ justifyContent: 'space-between' }}
      >
        <Typography variant="body2" color="text.secondary">
          NotifyNow sends events (calls, WhatsApp, campaigns, opt-outs) to your server, signed with
          a secret. Failed deliveries are retried for 15 hours.{' '}
          <Link href="/api/docs" target="_blank" rel="noopener">
            How to verify them
          </Link>
        </Typography>
        {canManage && (
          <Button
            variant="contained"
            onClick={() => setOpen({ kind: 'edit', endpoint: null })}
            sx={{ flexShrink: 0 }}
          >
            Add webhook
          </Button>
        )}
      </Stack>
      {failing.map((e) => (
        <Alert
          key={e.id}
          severity="error"
          action={
            canManage ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => act.mutate({ id: e.id, action: 'enable' })}
              >
                Turn on
              </Button>
            ) : undefined
          }
        >
          {e.description || e.url} was turned off because deliveries kept failing. Fix the receiver,
          then turn it on and replay the failed deliveries.
        </Alert>
      ))}
      <DataTable<WebhookEndpoint>
        aria-label="Webhooks"
        columns={[
          {
            key: 'url',
            header: 'Endpoint',
            render: (e) => (
              <Stack>
                <span>{e.description || e.url}</span>
                {e.description && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ wordBreak: 'break-all' }}
                  >
                    {e.url}
                  </Typography>
                )}
              </Stack>
            ),
          },
          { key: 'events', header: 'Events', render: (e) => eventsLabel(e.events) },
          {
            key: 'state',
            header: 'Status',
            render: (e) => (
              <StatusChip
                status={STATE_CHIP[endpointState(e)]}
                label={STATE_LABELS[endpointState(e)]}
              />
            ),
          },
          {
            key: 'last',
            header: 'Last delivery',
            render: (e) =>
              e.lastDeliveryAt ? (
                <span>
                  {e.lastDeliveryStatus === 'succeeded' ? 'Delivered' : 'Failed'}{' '}
                  <RelativeTime value={e.lastDeliveryAt} />
                </span>
              ) : (
                '—'
              ),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (e) => (
              <Stack
                direction="row"
                spacing={1}
                sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}
              >
                <Button size="small" onClick={() => setOpen({ kind: 'deliveries', endpoint: e })}>
                  Deliveries
                </Button>
                {canManage && (
                  <>
                    <Button size="small" onClick={() => setOpen({ kind: 'test', endpoint: e })}>
                      Send test
                    </Button>
                    <Button size="small" onClick={() => setOpen({ kind: 'edit', endpoint: e })}>
                      Change
                    </Button>
                    {e.active ? (
                      <Button
                        size="small"
                        onClick={() => act.mutate({ id: e.id, action: 'pause' })}
                      >
                        Pause
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        onClick={() => act.mutate({ id: e.id, action: 'enable' })}
                      >
                        Turn on
                      </Button>
                    )}
                    <Button
                      size="small"
                      onClick={() =>
                        void confirm({
                          title: 'Make a new signing secret?',
                          message:
                            'The old secret keeps working for 24 hours, so you can update your server.',
                          confirmText: 'New secret',
                        }).then((ok) => {
                          if (ok) act.mutate({ id: e.id, action: 'rotate' });
                        })
                      }
                    >
                      New secret
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      onClick={() =>
                        void confirm({
                          title: 'Remove this webhook?',
                          message: 'Events stop at once; pending retries are dropped.',
                          confirmText: 'Remove',
                          destructive: true,
                        }).then((ok) => {
                          if (ok) act.mutate({ id: e.id, action: 'remove' });
                        })
                      }
                    >
                      Remove
                    </Button>
                  </>
                )}
              </Stack>
            ),
          },
        ]}
        rows={list.data}
        getRowId={(e) => e.id}
        loading={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        emptyTitle="No webhooks yet"
        emptyDescription="Add your server's address to get call results and WhatsApp events as they happen."
      />
      {open?.kind === 'edit' && (
        <EndpointDialog endpoint={open.endpoint} onClose={() => setOpen(null)} />
      )}
      {open?.kind === 'test' && (
        <TestDialog endpoint={open.endpoint} onClose={() => setOpen(null)} />
      )}
      {open?.kind === 'deliveries' && (
        <DeliveriesDialog
          endpoint={open.endpoint}
          canManage={canManage}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === 'secret' && (
        <SecretDialog secret={open.secret} onClose={() => setOpen(null)} />
      )}
    </Stack>
  );
}
