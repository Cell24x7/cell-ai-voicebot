import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { useConfirm } from '@/components/confirm-context';
import { CopyButton } from '@/components/CopyButton';
import { DataTable } from '@/components/DataTable';
import { RelativeTime } from '@/components/RelativeTime';
import { StatusChip } from '@/components/StatusChip';
import { usePermission, useSession } from '@/features/auth/hooks';
import { apiKeysApi, type ApiKeyScope } from '@/services/api/api-keys';
import { getErrorMessage } from '@/services/api/errors';
import type { ApiKey, ApiRequestLog } from '@/services/api/types';

import { expiryIso, keyProblem, parseAllowlist, scopesByGroup, type KeyDraft } from './api-keys';
import { settingsKeys } from './keys';

const draftOf = (k: ApiKey | null): KeyDraft => ({
  name: k?.name ?? '',
  scopes: (k?.scopes ?? []) as ApiKeyScope[],
  allowlist: (k?.ipAllowlist ?? []).join('\n'),
  expires: k?.expiresAt ? k.expiresAt.slice(0, 10) : '',
});

/** Create (the key shown once) or change a key: name, grouped scopes, IP allowlist, expiry. */
function KeyDialog({ apiKey, onClose }: { apiKey: ApiKey | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<KeyDraft>(draftOf(apiKey));
  const [touched, setTouched] = useState(false);
  const problem = keyProblem(draft);
  // The full key lives only in this mutation's state — never in the query cache.
  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: draft.name.trim(),
        scopes: draft.scopes,
        ipAllowlist: parseAllowlist(draft.allowlist).entries,
        expiresAt: expiryIso(draft.expires),
      };
      if (apiKey) {
        await apiKeysApi.update(apiKey.id, body);
        return null;
      }
      return apiKeysApi.create(body);
    },
    meta: { silent: true },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.apiKeys });
      if (!created) {
        enqueueSnackbar('API key saved — changes apply within 30 seconds', { variant: 'success' });
        onClose();
      }
    },
  });
  const toggle = (scope: ApiKeyScope) => {
    setTouched(true);
    setDraft((d) => ({
      ...d,
      scopes: d.scopes.includes(scope) ? d.scopes.filter((x) => x !== scope) : [...d.scopes, scope],
    }));
  };
  const created = save.data;
  return (
    <Dialog
      open
      onClose={created ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="key-title"
    >
      <DialogTitle id="key-title">
        {created ? 'Copy your API key now' : apiKey ? 'Change API key' : 'Create API key'}
      </DialogTitle>
      <DialogContent>
        {created ? (
          <Stack spacing={2}>
            <Alert severity="warning">
              This is the only time the full key is shown. Store it in a password manager or your
              server&apos;s secrets.
            </Alert>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <TextField
                fullWidth
                value={created.key}
                slotProps={{ htmlInput: { readOnly: true, 'aria-label': 'New API key' } }}
              />
              <CopyButton value={created.key} label="Copy key" />
            </Stack>
          </Stack>
        ) : (
          <Stack spacing={2} sx={{ mt: 1 }}>
            {save.error && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
            <TextField
              label="Name"
              placeholder="e.g. CRM sync"
              value={draft.name}
              onChange={(e) => {
                setTouched(true);
                setDraft({ ...draft, name: e.target.value });
              }}
              autoFocus
            />
            {scopesByGroup().map(({ group, scopes }) => (
              <div key={group}>
                <FormLabel component="legend">{group}</FormLabel>
                <FormGroup>
                  {scopes.map((s) => (
                    <FormControlLabel
                      key={s.key}
                      control={
                        <Checkbox
                          checked={draft.scopes.includes(s.key)}
                          onChange={() => toggle(s.key)}
                        />
                      }
                      label={
                        <span>
                          <code>{s.key}</code> — {s.description}
                        </span>
                      }
                    />
                  ))}
                </FormGroup>
              </div>
            ))}
            <TextField
              label="Allowed IPs (optional)"
              placeholder={'203.0.113.10\n203.0.113.0/24'}
              multiline
              minRows={2}
              value={draft.allowlist}
              onChange={(e) => {
                setTouched(true);
                setDraft({ ...draft, allowlist: e.target.value });
              }}
              helperText="One IP or range per line (IPv4 / IPv6, up to 20). Empty = any address."
            />
            <TextField
              type="date"
              label="Expires (optional)"
              value={draft.expires}
              onChange={(e) => {
                setTouched(true);
                setDraft({ ...draft, expires: e.target.value });
              }}
              slotProps={{ inputLabel: { shrink: true } }}
              helperText="The key stops working at the end of this day. Empty = never."
            />
            {touched && problem && <FormHelperText error>{problem}</FormHelperText>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {created ? (
          <Button variant="contained" onClick={onClose}>
            I&apos;ve copied it
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="contained"
              disabled={Boolean(problem) || save.isPending}
              onClick={() => save.mutate()}
            >
              {apiKey ? 'Save' : 'Create key'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

/** Requests made with a key (7 days): route templates, status, time — never data. */
function RequestsDialog({ apiKey, onClose }: { apiKey: ApiKey; onClose: () => void }) {
  const log = useInfiniteQuery({
    queryKey: [...settingsKeys.apiKeys, apiKey.id, 'requests'],
    queryFn: ({ pageParam }) => apiKeysApi.requests(apiKey.id, pageParam || undefined),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    meta: { silent: true },
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="requests-title">
      <DialogTitle id="requests-title">Requests — {apiKey.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <DataTable<ApiRequestLog>
            aria-label="Key requests"
            columns={[
              { key: 'at', header: 'When', render: (r) => <RelativeTime value={r.at} /> },
              {
                key: 'route',
                header: 'Request',
                render: (r) => (
                  <code>
                    {r.method} {r.route}
                  </code>
                ),
              },
              { key: 'status', header: 'Status', render: (r) => String(r.status) },
              { key: 'ms', header: 'Time', render: (r) => `${String(r.ms)} ms` },
            ]}
            rows={log.data?.pages.flatMap((p) => p.items)}
            getRowId={(r) => r.id}
            loading={log.isPending}
            error={log.error}
            onRetry={() => void log.refetch()}
            emptyTitle="No requests in the last 7 days"
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
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

/** "Test a key": `whoami` with a pasted key (sent once, never stored or logged). */
function TestKeyDialog({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState('');
  const check = useMutation({
    mutationFn: () => apiKeysApi.whoami(key.trim()),
    meta: { silent: true },
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="test-key-title">
      <DialogTitle id="test-key-title">Test a key</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="API key"
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              check.reset();
            }}
            helperText="Checked once with GET /api/v1/api-keys/whoami — not stored."
          />
          {check.error && <Alert severity="error">{getErrorMessage(check.error)}</Alert>}
          {check.data && (
            <Alert severity="success">The key works. Scopes: {check.data.scopes.join(', ')}</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="contained"
          disabled={!key.trim() || check.isPending}
          onClick={() => check.mutate()}
        >
          Check key
        </Button>
      </DialogActions>
    </Dialog>
  );
}

type Open =
  | { kind: 'edit'; key: ApiKey | null }
  | { kind: 'requests'; key: ApiKey }
  | { kind: 'test' }
  | null;

export function ApiKeysTab() {
  const session = useSession();
  const canManageKeys = usePermission('apikeys.manage');
  const canManage = canManageKeys && !session?.impersonation;
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [open, setOpen] = useState<Open>(null);
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
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
      >
        <Typography variant="body2" color="text.secondary">
          Keys let your systems use the public API (header <code>X-API-Key</code>).{' '}
          <Link href="/api/docs" target="_blank" rel="noopener">
            Try it in the API docs
          </Link>
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          <Button onClick={() => setOpen({ kind: 'test' })}>Test a key</Button>
          {canManage && (
            <Button variant="contained" onClick={() => setOpen({ kind: 'edit', key: null })}>
              Create API key
            </Button>
          )}
        </Stack>
      </Stack>
      <DataTable<ApiKey>
        aria-label="API keys"
        columns={[
          { key: 'name', header: 'Name', render: (k) => k.name },
          { key: 'prefix', header: 'Key', render: (k) => <code>{k.prefix}…</code> },
          {
            key: 'scopes',
            header: 'Scopes',
            render: (k) => (
              <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                {k.scopes.map((s) => (
                  <Chip key={s} size="small" label={s} />
                ))}
              </Stack>
            ),
          },
          {
            key: 'used',
            header: 'Last used',
            render: (k) => <RelativeTime value={k.lastUsedAt} />,
          },
          {
            key: 'requests',
            header: 'Requests 24 h / 7 d',
            render: (k) => `${String(k.requests24h)} / ${String(k.requests7d)}`,
          },
          {
            key: 'limits',
            header: 'IPs · expiry',
            render: (k) =>
              `${k.ipAllowlist.length ? `${String(k.ipAllowlist.length)} allowed` : 'Any IP'} · ${
                k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : 'no expiry'
              }`,
          },
          {
            key: 'status',
            header: 'Status',
            render: (k) => (
              <StatusChip
                status={
                  k.revokedAt
                    ? 'revoked'
                    : k.expiresAt && new Date(k.expiresAt) < new Date()
                      ? 'expired'
                      : 'active'
                }
              />
            ),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (k) => (
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                <Button size="small" onClick={() => setOpen({ kind: 'requests', key: k })}>
                  Requests
                </Button>
                {canManage && !k.revokedAt && (
                  <>
                    <Button size="small" onClick={() => setOpen({ kind: 'edit', key: k })}>
                      Change
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      onClick={() =>
                        void confirm({
                          title: `Revoke "${k.name}"?`,
                          message: 'Systems using this key stop working within 30 seconds.',
                          confirmText: 'Revoke',
                          destructive: true,
                        }).then((ok) => {
                          if (ok) revoke.mutate(k.id);
                        })
                      }
                    >
                      Revoke
                    </Button>
                  </>
                )}
              </Stack>
            ),
          },
        ]}
        rows={keys.data}
        getRowId={(k) => k.id}
        loading={keys.isPending}
        error={keys.error}
        onRetry={() => void keys.refetch()}
        emptyTitle="No API keys yet"
      />
      {open?.kind === 'edit' && <KeyDialog apiKey={open.key} onClose={() => setOpen(null)} />}
      {open?.kind === 'requests' && (
        <RequestsDialog apiKey={open.key} onClose={() => setOpen(null)} />
      )}
      {open?.kind === 'test' && <TestKeyDialog onClose={() => setOpen(null)} />}
    </Stack>
  );
}
