import ArrowBack from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';
import { Link as RouterLink, Navigate, useNavigate, useParams } from 'react-router';

import { useConfirm } from '@/components/confirm-context';
import { PageHeader } from '@/components/PageHeader';
import { RelativeTime } from '@/components/RelativeTime';
import { StatusChip } from '@/components/StatusChip';
import { PASSWORD_MIN } from '@/features/auth/schemas';
import { useAuthStore } from '@/features/auth/store';
import { CreditDialog } from '@/features/resellers/CreditDialog';
import { resellerKeys } from '@/features/resellers/keys';
import { useCanManageReseller, useIsReseller } from '@/features/resellers/permissions';
import { useResellerCustomer } from '@/features/resellers/queries';
import { generatePassword } from '@/features/resellers/rupees';
import { getErrorMessage } from '@/services/api/errors';
import { resellersApi } from '@/services/api/resellers';
import { formatCurrencyMicros } from '@/utils/format';

/** Phase 19: one customer of the reseller — credit, status, password, log in as. */
export function ResellerCustomerPage() {
  const { id = '' } = useParams();
  const isReseller = useIsReseller();
  const canManage = useCanManageReseller();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const detail = useResellerCustomer(id);
  const [credit, setCredit] = useState<'give' | 'take' | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [password, setPassword] = useState('');
  const refresh = () => void queryClient.invalidateQueries({ queryKey: resellerKeys.all });
  const fail = (err: unknown) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' });
  const status = useMutation({
    mutationFn: (next: 'active' | 'suspended') => resellersApi.updateCustomer(id, { status: next }),
    meta: { silent: true },
    onSuccess: refresh,
    onError: fail,
  });
  const setPw = useMutation({
    mutationFn: () => resellersApi.setOwnerPassword(id, password),
    meta: { silent: true },
    onSuccess: () => {
      enqueueSnackbar('Password changed. Share it with the owner.', { variant: 'success' });
      setPwOpen(false);
    },
  });
  const loginAs = useMutation({
    mutationFn: () => resellersApi.loginAs(id),
    meta: { silent: true },
    onSuccess: (session) => {
      queryClient.clear();
      useAuthStore.getState().startImpersonation(session);
      void navigate('/', { replace: true });
    },
    onError: fail,
  });
  if (!isReseller) return <Navigate to="/" replace />;
  const back = (
    <Button
      component={RouterLink}
      to="/reseller/customers"
      startIcon={<ArrowBack />}
      sx={{ mb: 2 }}
    >
      All customers
    </Button>
  );
  if (detail.isError) {
    return (
      <>
        {back}
        <Alert severity="error">{getErrorMessage(detail.error)}</Alert>
      </>
    );
  }
  const c = detail.data;
  if (!c) return back;
  const suspended = c.status === 'suspended';
  return (
    <>
      {back}
      <PageHeader
        title={c.name}
        subtitle={c.owner ? `${c.owner.name} · ${c.owner.email}` : undefined}
        actions={
          canManage ? (
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              <Button
                variant="contained"
                disabled={loginAs.isPending || suspended}
                onClick={() =>
                  void confirm({
                    title: `Log in as ${c.name}?`,
                    message:
                      'You can work in their account for up to an hour. Their password, sign-in, API keys and payments stay blocked. Everything you do is recorded in their activity log.',
                    confirmText: 'Log in',
                  }).then((ok) => ok && loginAs.mutate())
                }
              >
                Log in as
              </Button>
              <Button
                onClick={() => {
                  setPassword('');
                  setPwOpen(true);
                }}
              >
                Reset password
              </Button>
              <Button
                color={suspended ? 'primary' : 'error'}
                disabled={status.isPending}
                onClick={() =>
                  void confirm(
                    suspended
                      ? {
                          title: `Enable ${c.name}?`,
                          message: 'They can sign in and work again.',
                          confirmText: 'Enable',
                        }
                      : {
                          title: `Suspend ${c.name}?`,
                          message: 'Their account becomes read-only and campaigns pause.',
                          confirmText: 'Suspend',
                          destructive: true,
                        },
                  ).then((ok) => ok && status.mutate(suspended ? 'active' : 'suspended'))
                }
              >
                {suspended ? 'Enable' : 'Suspend'}
              </Button>
            </Stack>
          ) : undefined
        }
      />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" component="section" aria-label="Credit">
            <CardContent>
              <Stack spacing={1.5}>
                <Typography variant="subtitle1" component="h2">
                  Credit
                </Typography>
                <Typography variant="h5">
                  {formatCurrencyMicros(c.wallet.availableMicros)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Spent in the last 30 days: {formatCurrencyMicros(c.spend30dMicros)}
                </Typography>
                {canManage && (
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="outlined"
                      disabled={suspended}
                      onClick={() => setCredit('give')}
                    >
                      Add credit
                    </Button>
                    <Button disabled={suspended} onClick={() => setCredit('take')}>
                      Take back
                    </Button>
                  </Stack>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" component="section" aria-label="Account">
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="subtitle1" component="h2">
                  Account
                </Typography>
                <StatusChip status={c.status} />
                <Typography variant="body2">
                  Last sign-in: {c.lastActiveAt ? <RelativeTime value={c.lastActiveAt} /> : 'never'}
                </Typography>
                <Typography variant="body2">
                  Created <RelativeTime value={c.createdAt} />
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={12}>
          <Card variant="outlined" component="section" aria-label="Transfers">
            <CardContent>
              <Typography variant="subtitle1" component="h2" gutterBottom>
                Recent transfers
              </Typography>
              {c.transfers.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No credit moved yet.
                </Typography>
              ) : (
                <Stack spacing={0.5}>
                  {c.transfers.map((t) => (
                    <Typography key={`${t.id}-${t.direction}`} variant="body2">
                      {t.direction === 'given' ? 'Given' : 'Taken back'}{' '}
                      {formatCurrencyMicros(t.amountMicros)} · <RelativeTime value={t.at} />
                      {t.note ? ` · ${t.note}` : ''}
                    </Typography>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      {credit && (
        <CreditDialog
          customerId={c.id}
          customerName={c.name}
          way={credit}
          onClose={() => setCredit(null)}
        />
      )}
      <Dialog
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="pw-title"
      >
        <DialogTitle id="pw-title">Reset the owner&apos;s password</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {setPw.error && <Alert severity="error">{getErrorMessage(setPw.error)}</Alert>}
            <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              <TextField
                label="New password"
                fullWidth
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                helperText={`At least ${String(PASSWORD_MIN)} characters. Their sessions end.`}
              />
              <Button sx={{ mt: 1 }} onClick={() => setPassword(generatePassword())}>
                Generate
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPwOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={password.length < PASSWORD_MIN || setPw.isPending}
            onClick={() => setPw.mutate()}
          >
            Change password
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
