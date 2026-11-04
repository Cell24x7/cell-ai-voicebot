import AddOutlined from '@mui/icons-material/AddOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { PageHeader } from '@/components/PageHeader';
import { adminApi } from '@/services/api/admin';
import { getErrorMessage } from '@/services/api/errors';
import {
  PHONE_KIND_LABELS,
  phoneNumberKeys,
  phoneNumbersApi,
  type PhoneNumberKind,
} from '@/services/api/phone-numbers';
import type { PhoneNumber } from '@/services/api/types';

const E164 = /^\+[1-9]\d{7,14}$/;

function AddDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [number, setNumber] = useState('');
  const [kind, setKind] = useState<PhoneNumberKind>('1600');
  const [label, setLabel] = useState('');
  const create = useMutation({
    mutationFn: () => phoneNumbersApi.create({ number: number.trim(), kind, label: label.trim() }),
    onSuccess: (created) => {
      enqueueSnackbar(
        created.warnings.includes('not_1600_series')
          ? 'Number added. It does not look like a 1600-series number.'
          : 'Number added',
        { variant: created.warnings.length ? 'warning' : 'success' },
      );
      void queryClient.invalidateQueries({ queryKey: phoneNumberKeys.all });
      setNumber('');
      setLabel('');
      onClose();
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  const valid = E164.test(number.trim());
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Add a number</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Number"
            placeholder="+911600000000"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            error={number !== '' && !valid}
            helperText="With country code, e.g. +911600000000"
            autoFocus
          />
          <TextField
            select
            label="Kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as PhoneNumberKind)}
          >
            {Object.entries(PHONE_KIND_LABELS).map(([value, text]) => (
              <MenuItem key={value} value={value}>
                {text}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 60 } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!valid || create.isPending}
          onClick={() => create.mutate()}
        >
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AssignDialog({ target, onClose }: { target: PhoneNumber | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState('');
  const accounts = useQuery({
    queryKey: ['admin', 'accounts', 'phone-assign'],
    queryFn: () => adminApi.accounts({ page: 1, limit: 100, status: 'active' }),
    enabled: target !== null,
  });
  const assign = useMutation({
    mutationFn: () => phoneNumbersApi.assign((target as PhoneNumber).id, accountId),
    onSuccess: () => {
      enqueueSnackbar('Number given to the account', { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: phoneNumberKeys.all });
      setAccountId('');
      onClose();
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  return (
    <Dialog open={target !== null} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Give {target?.number} to an account</DialogTitle>
      <DialogContent>
        <TextField
          select
          fullWidth
          label="Account"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          sx={{ mt: 1 }}
        >
          {(accounts.data?.data ?? []).map((a) => (
            <MenuItem key={a.id} value={a.id}>
              {a.name}
            </MenuItem>
          ))}
        </TextField>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!accountId || assign.isPending}
          onClick={() => assign.mutate()}
        >
          Give
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Superadmin → Phone numbers: the trunk's caller IDs and which account uses each (Phase 18). */
export function AdminPhoneNumbersPage() {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [assigning, setAssigning] = useState<PhoneNumber | null>(null);
  const numbers = useQuery({
    queryKey: phoneNumberKeys.admin(),
    queryFn: () => phoneNumbersApi.list(),
  });
  const done = (message: string) => {
    enqueueSnackbar(message, { variant: 'success' });
    void queryClient.invalidateQueries({ queryKey: phoneNumberKeys.all });
  };
  const fail = (err: unknown) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' });
  const release = useMutation({
    mutationFn: (n: PhoneNumber) => phoneNumbersApi.release(n.id),
    onSuccess: () => done('Number back in the pool'),
    onError: fail,
  });
  const toggle = useMutation({
    mutationFn: (n: PhoneNumber) =>
      phoneNumbersApi.update(n.id, { status: n.status === 'active' ? 'disabled' : 'active' }),
    onSuccess: (n) => done(n.status === 'active' ? 'Number turned on' : 'Number turned off'),
    onError: fail,
  });

  return (
    <>
      <PageHeader
        title="Phone numbers"
        subtitle="Caller IDs on the SIP trunk. An account's calls show its first active number unless a campaign picks another."
        actions={
          <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setAdding(true)}>
            Add number
          </Button>
        }
      />
      {numbers.isError ? <Alert severity="error">{getErrorMessage(numbers.error)}</Alert> : null}
      <Card variant="outlined">
        {numbers.isPending ? (
          <Skeleton variant="rectangular" height={160} />
        ) : (numbers.data ?? []).length === 0 ? (
          <Typography sx={{ p: 3 }} color="text.secondary">
            No numbers yet. Add the 1600-series numbers the client registered for calling.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Number</TableCell>
                <TableCell>Kind</TableCell>
                <TableCell>Label</TableCell>
                <TableCell>Account</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(numbers.data ?? []).map((n) => (
                <TableRow key={n.id}>
                  <TableCell>
                    {n.number}
                    {n.warnings.includes('not_1600_series') ? (
                      <Chip
                        size="small"
                        color="warning"
                        variant="outlined"
                        label="Not 1600"
                        sx={{ ml: 1 }}
                      />
                    ) : null}
                  </TableCell>
                  <TableCell>{PHONE_KIND_LABELS[n.kind]}</TableCell>
                  <TableCell>{n.label || '—'}</TableCell>
                  <TableCell>{n.accountName ?? 'In the pool'}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      variant="outlined"
                      color={n.status === 'active' ? 'success' : 'default'}
                      label={n.status === 'active' ? 'On' : 'Off'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                      {n.status === 'active' ? (
                        <Button size="small" onClick={() => setAssigning(n)}>
                          {n.accountId ? 'Move' : 'Give'}
                        </Button>
                      ) : null}
                      {n.accountId ? (
                        <Button size="small" onClick={() => release.mutate(n)}>
                          Take back
                        </Button>
                      ) : null}
                      <Button size="small" onClick={() => toggle.mutate(n)}>
                        {n.status === 'active' ? 'Turn off' : 'Turn on'}
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <AddDialog open={adding} onClose={() => setAdding(false)} />
      <AssignDialog target={assigning} onClose={() => setAssigning(null)} />
    </>
  );
}
