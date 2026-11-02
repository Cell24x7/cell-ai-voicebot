import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { useConfirm } from '@/components/confirm-context';
import { adminApi } from '@/services/api/admin';
import { getErrorMessage } from '@/services/api/errors';
import { formatCurrencyMicros } from '@/utils/format';

const KEY = ['admin', 'account-deletions'];

/** Accounts waiting to be deleted. Any wallet balance left is handled by hand. */
export function AccountDeletionsCard() {
  const confirm = useConfirm();
  const [now] = useState(() => Date.now());
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: KEY,
    queryFn: () => adminApi.accountDeletions(),
    meta: { silent: true },
  });
  const after = {
    meta: { silent: true },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin'] }),
    onError: (err: unknown) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  };
  const cancel = useMutation({ mutationFn: (id: string) => adminApi.cancelDeletion(id), ...after });
  const run = useMutation({ mutationFn: (id: string) => adminApi.runDeletion(id), ...after });
  const rows = list.data ?? [];
  if (!rows.length) return null;
  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Accounts waiting to be deleted
        </Typography>
        <Stack spacing={1}>
          {rows.map((a) => {
            const due = a.scheduledFor !== null && new Date(a.scheduledFor).getTime() <= now;
            return (
              <Stack
                key={a.id}
                direction="row"
                spacing={1}
                sx={{ alignItems: 'center', flexWrap: 'wrap' }}
              >
                <Typography variant="body2" sx={{ flexGrow: 1 }}>
                  {a.name} · {a.scheduledFor?.slice(0, 10) ?? '—'} · wallet{' '}
                  {formatCurrencyMicros(a.balanceMicros)}
                </Typography>
                <Button
                  size="small"
                  disabled={a.status !== 'scheduled' || cancel.isPending}
                  onClick={() => cancel.mutate(a.id)}
                >
                  Cancel
                </Button>
                <Button
                  size="small"
                  color="error"
                  disabled={!due || run.isPending}
                  onClick={() =>
                    void confirm({
                      title: `Delete ${a.name} now?`,
                      message: "All its data is removed permanently. This can't be undone.",
                      confirmText: 'Delete now',
                      destructive: true,
                    }).then((ok) => ok && run.mutate(a.id))
                  }
                >
                  Delete now
                </Button>
              </Stack>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
}
