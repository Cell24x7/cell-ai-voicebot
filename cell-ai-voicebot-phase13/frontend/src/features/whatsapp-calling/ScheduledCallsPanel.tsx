import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { enqueueSnackbar } from 'notistack';
import { Link as RouterLink, useSearchParams } from 'react-router';

import { useConfirm } from '@/components/confirm-context';
import { DataTable } from '@/components/DataTable';
import { useAuthStore } from '@/features/auth/store';
import { getErrorMessage } from '@/services/api/errors';
import type { ScheduledCallsFilter, WhatsAppScheduledCall } from '@/services/api/types';

import { SCHEDULED_SKIP_LABELS, SCHEDULED_STATUS_LABELS } from './labels';
import { dueText } from './live/schedule-time';
import { useCanCall } from './permissions';
import { useCancelScheduledCall, useScheduledCalls } from './queries';

const STATUS_FILTERS = ['open', 'done', 'skipped', 'failed', 'cancelled'] as const;

/** SAC-T10: Calls → Scheduled — every scheduled AI WhatsApp call, filters in the URL. */
export function ScheduledCallsPanel() {
  const timeZone = useAuthStore((s) => s.session?.account.timezone ?? 'Asia/Kolkata');
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'open') as ScheduledCallsFilter['status'];
  const canCall = useCanCall();
  const confirm = useConfirm();
  const list = useScheduledCalls({ status, limit: 100 });
  const cancel = useCancelScheduledCall();
  const onCancel = async (row: WhatsAppScheduledCall) => {
    const ok = await confirm({
      title: 'Cancel this AI call?',
      message: `The AI will not call at ${dueText(row.dueAt, timeZone)}.`,
      confirmText: 'Cancel AI call',
      destructive: true,
    });
    if (ok)
      cancel.mutate(row.id, {
        onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: 'error' }),
      });
  };
  return (
    <Stack spacing={2}>
      <TextField
        select
        size="small"
        label="Status"
        value={status}
        sx={{ maxWidth: 240 }}
        onChange={(e) => {
          const next = new URLSearchParams(params);
          next.set('status', e.target.value);
          setParams(next, { replace: true });
        }}
      >
        {STATUS_FILTERS.map((s) => (
          <MenuItem key={s} value={s}>
            {s === 'open' ? 'Upcoming / in progress' : SCHEDULED_STATUS_LABELS[s]}
          </MenuItem>
        ))}
      </TextField>
      <DataTable
        aria-label="Scheduled AI calls"
        columns={[
          { key: 'due', header: 'When', render: (r) => dueText(r.dueAt, timeZone) },
          {
            key: 'contact',
            header: 'Customer',
            render: (r) => (
              <Link component={RouterLink} to={`/contacts/c/${r.contactId}`}>
                Open contact
              </Link>
            ),
          },
          {
            key: 'program',
            header: 'AI',
            render: (r) => (r.program.kind === 'agent' ? 'AI agent' : 'Flow'),
          },
          {
            key: 'status',
            header: 'Status',
            render: (r) => (
              <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
                <Chip size="small" label={SCHEDULED_STATUS_LABELS[r.status] ?? r.status} />
                {r.origin === 'ai_callback' && (
                  <Chip size="small" variant="outlined" label="AI callback" />
                )}
              </Stack>
            ),
          },
          {
            key: 'why',
            header: 'Why',
            render: (r) =>
              r.skipReason ? (SCHEDULED_SKIP_LABELS[r.skipReason] ?? r.skipReason) : '—',
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) => (
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                {r.callIds.at(-1) && (
                  <Button
                    size="small"
                    component={RouterLink}
                    to={`/calls/${r.callIds.at(-1) ?? ''}`}
                  >
                    Open call
                  </Button>
                )}
                {canCall && r.status === 'scheduled' && (
                  <Button size="small" color="error" onClick={() => void onCancel(r)}>
                    Cancel
                  </Button>
                )}
              </Stack>
            ),
          },
        ]}
        rows={list.data?.data}
        getRowId={(r) => r.id}
        loading={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        emptyTitle="No scheduled AI calls"
      />
    </Stack>
  );
}
