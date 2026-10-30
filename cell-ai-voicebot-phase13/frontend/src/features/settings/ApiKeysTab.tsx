import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { useConfirm } from '@/components/confirm-context';
import { CopyButton } from '@/components/CopyButton';
import { DataTable } from '@/components/DataTable';
import { RelativeTime } from '@/components/RelativeTime';
import { StatusChip } from '@/components/StatusChip';
import { usePermission, useSession } from '@/features/auth/hooks';
import { API_KEY_SCOPES, apiKeysApi, type ApiKeyScope } from '@/services/api/api-keys';
import { getErrorMessage } from '@/services/api/errors';

import { settingsKeys } from './keys';

function CreateKeyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiKeyScope[]>([]);
  // The full key lives only in this mutation's state — never in the query cache.
  const create = useMutation({
    mutationFn: () => apiKeysApi.create({ name: name.trim(), scopes }),
    meta: { silent: true },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: settingsKeys.apiKeys }),
  });
  const close = () => {
    create.reset();
    setName('');
    setScopes([]);
    onClose();
  };
  const toggle = (scope: ApiKeyScope) =>
    setScopes((s) => (s.includes(scope) ? s.filter((x) => x !== scope) : [...s, scope]));

  return (
    <Dialog
      open={open}
      onClose={create.data ? undefined : close}
      fullWidth
      maxWidth="sm"
      aria-labelledby="key-title"
    >
      <DialogTitle id="key-title">
        {create.data ? 'Copy your API key now' : 'Create API key'}
      </DialogTitle>
      <DialogContent>
        {create.data ? (
          <Stack spacing={2}>
            <Alert severity="warning">
              This is the only time the full key is shown. Store it in a password manager or your
              server's secrets.
            </Alert>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <TextField
                fullWidth
                value={create.data.key}
                slotProps={{ htmlInput: { readOnly: true, 'aria-label': 'New API key' } }}
              />
              <CopyButton value={create.data.key} label="Copy key" />
            </Stack>
          </Stack>
        ) : (
          <Stack spacing={2} sx={{ mt: 1 }}>
            {create.error && <Alert severity="error">{getErrorMessage(create.error)}</Alert>}
            <TextField
              label="Name"
              placeholder="e.g. CRM sync"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <FormGroup>
              {API_KEY_SCOPES.map((s) => (
                <FormControlLabel
                  key={s.key}
                  control={
                    <Checkbox checked={scopes.includes(s.key)} onChange={() => toggle(s.key)} />
                  }
                  label={
                    <span>
                      <code>{s.key}</code> — {s.description}
                    </span>
                  }
                />
              ))}
            </FormGroup>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {create.data ? (
          <Button variant="contained" onClick={close}>
            I've copied it
          </Button>
        ) : (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button
              variant="contained"
              disabled={!name.trim() || scopes.length === 0 || create.isPending}
              onClick={() => create.mutate()}
            >
              Create key
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

export function ApiKeysTab() {
  const session = useSession();
  const canManageKeys = usePermission('apikeys.manage');
  const canManage = canManageKeys && !session?.impersonation;
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const keys = useQuery({
    queryKey: settingsKeys.apiKeys,
    queryFn: apiKeysApi.list,
    meta: { silent: true },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiKeysApi.revoke(id),
    meta: { silent: true },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.apiKeys });
      enqueueSnackbar('API key revoked', { variant: 'success' });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: 'error' }),
  });
  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Keys let your systems use the public API (header <code>X-API-Key</code>).
        </Typography>
        {canManage && (
          <Button variant="contained" onClick={() => setOpen(true)}>
            Create API key
          </Button>
        )}
      </Stack>
      <DataTable
        aria-label="API keys"
        columns={[
          { key: 'name', header: 'Name', render: (k) => k.name },
          { key: 'prefix', header: 'Key', render: (k) => <code>{k.prefix}…</code> },
          { key: 'scopes', header: 'Scopes', render: (k) => k.scopes.join(', ') },
          {
            key: 'used',
            header: 'Last used',
            render: (k) => <RelativeTime value={k.lastUsedAt} />,
          },
          {
            key: 'status',
            header: 'Status',
            render: (k) => <StatusChip status={k.revokedAt ? 'revoked' : 'active'} />,
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (k) =>
              canManage && !k.revokedAt ? (
                <Button
                  size="small"
                  color="error"
                  onClick={() =>
                    void confirm({
                      title: `Revoke "${k.name}"?`,
                      message: 'Systems using this key stop working immediately.',
                      confirmText: 'Revoke',
                      destructive: true,
                    }).then((ok) => {
                      if (ok) revoke.mutate(k.id);
                    })
                  }
                >
                  Revoke
                </Button>
              ) : null,
          },
        ]}
        rows={keys.data}
        getRowId={(k) => k.id}
        loading={keys.isPending}
        error={keys.error}
        onRetry={() => void keys.refetch()}
        emptyTitle="No API keys yet"
      />
      <CreateKeyDialog open={open} onClose={() => setOpen(false)} />
    </Stack>
  );
}
