import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';

import { useConfirm } from '@/components/confirm-context';
import { adminApi } from '@/services/api/admin';
import { getErrorMessage } from '@/services/api/errors';
import type { PublicAccount } from '@/services/api/types';

import { adminKeys } from './keys';

/**
 * Phase 19 on the account page: a reseller (approve, its customers, suspend them all) or a
 * business (direct or under a reseller; move it).
 */
export function ResellerCard({ account }: { account: PublicAccount }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [moving, setMoving] = useState(false);
  const [target, setTarget] = useState(account.parentAccountId ?? '');
  const refresh = () => void queryClient.invalidateQueries({ queryKey: adminKeys.all });
  const fail = (err: unknown) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' });
  const resellers = useQuery({
    queryKey: adminKeys.accounts({ kind: 'reseller', limit: 100, page: 1 }),
    queryFn: () => adminApi.accounts({ kind: 'reseller', limit: 100, page: 1 }),
    enabled: account.kind === 'business',
    meta: { silent: true },
  });
  const approve = useMutation({
    mutationFn: () => adminApi.approveReseller(account.id),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Reseller approved', { variant: 'success' });
      refresh();
    },
    onError: fail,
  });
  const suspendAll = useMutation({
    mutationFn: () => adminApi.suspendCustomers(account.id, 'Suspended with their reseller'),
    meta: { silent: true },
    onSuccess: (r) => {
      enqueueSnackbar(`${String(r.suspended)} customers suspended`, { variant: 'success' });
      refresh();
    },
    onError: fail,
  });
  const move = useMutation({
    mutationFn: (parent: string | null) => adminApi.setReseller(account.id, parent),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Reseller changed', { variant: 'success' });
      setMoving(false);
      refresh();
    },
    onError: fail,
  });
  const parentName =
    resellers.data?.data.find((r) => r.id === account.parentAccountId)?.name ?? 'a reseller';

  return (
    <Card variant="outlined" component="section" aria-label="Reseller">
      <CardContent>
        <Stack spacing={1.5}>
          <Typography variant="subtitle1" component="h2">
            {account.kind === 'reseller' ? 'Reseller' : 'Reseller link'}
          </Typography>
          {account.kind === 'reseller' ? (
            <>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Chip
                  size="small"
                  color={account.reseller?.status === 'active' ? 'success' : 'warning'}
                  label={
                    account.reseller?.status === 'active' ? 'Approved' : 'Waiting for approval'
                  }
                />
                <Link component={RouterLink} to={`/admin/accounts?reseller=${account.id}`}>
                  Customers
                </Link>
              </Stack>
              <Stack direction="row" spacing={1}>
                {account.reseller?.status !== 'active' && (
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => approve.mutate()}
                    disabled={approve.isPending}
                  >
                    Approve
                  </Button>
                )}
                <Button
                  size="small"
                  color="error"
                  disabled={suspendAll.isPending}
                  onClick={() =>
                    void confirm({
                      title: `Suspend every customer of ${account.name}?`,
                      message:
                        'Their accounts become read-only. The reseller itself is not suspended.',
                      confirmText: 'Suspend customers',
                      destructive: true,
                    }).then((ok) => ok && suspendAll.mutate())
                  }
                >
                  Suspend all customers
                </Button>
              </Stack>
            </>
          ) : (
            <>
              <Typography variant="body2">
                {account.parentAccountId ? `Customer of ${parentName}` : 'Direct customer'}
              </Typography>
              <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => setMoving(true)}>
                Move to reseller
              </Button>
            </>
          )}
        </Stack>
      </CardContent>
      <Dialog
        open={moving}
        onClose={() => setMoving(false)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="move-title"
      >
        <DialogTitle id="move-title">Move to reseller</DialogTitle>
        <DialogContent>
          <TextField
            select
            fullWidth
            label="Reseller"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            sx={{ mt: 1 }}
          >
            <MenuItem value="">None — direct customer</MenuItem>
            {(resellers.data?.data ?? []).map((r) => (
              <MenuItem key={r.id} value={r.id}>
                {r.name}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoving(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={move.isPending || target === (account.parentAccountId ?? '')}
            onClick={() => move.mutate(target || null)}
          >
            Move
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
