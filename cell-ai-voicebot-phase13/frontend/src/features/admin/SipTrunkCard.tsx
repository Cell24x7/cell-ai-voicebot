import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { getErrorMessage } from '@/services/api/errors';
import { sipTrunkKeys, sipTrunksApi, type SipTrunkView } from '@/services/api/sip-trunks';

import { adminKeys } from './keys';
import { trunkProblems } from './sip-trunk-form';

const STATE_TEXT: Record<string, { label: string; color: 'success' | 'warning' | 'default' }> = {
  online: { label: 'Connected', color: 'success' },
  offline: { label: 'Not reachable', color: 'warning' },
  unknown: { label: 'Connecting…', color: 'default' },
  not_loaded: { label: 'Saved, connecting…', color: 'default' },
  line_down: { label: 'Phone server offline', color: 'warning' },
};

function TrunkForm({ accountId, view }: { accountId: string; view: SipTrunkView }) {
  const queryClient = useQueryClient();
  const t = view.trunk;
  const [host, setHost] = useState(t?.host ?? '');
  const [port, setPort] = useState(String(t?.port ?? 5060));
  const [transport, setTransport] = useState<'udp' | 'tcp'>(t?.transport ?? 'udp');
  const [auth, setAuth] = useState<'ip' | 'register'>(t?.auth ?? 'register');
  const [username, setUsername] = useState(t?.username ?? '');
  const [password, setPassword] = useState('');
  const [ipsText, setIpsText] = useState((t?.trunkIps ?? []).join(', '));
  const [callerId, setCallerId] = useState(t?.callerId ?? '');
  const [touched, setTouched] = useState(false);
  const draft = {
    host: host.trim(),
    port: Number(port),
    transport,
    auth,
    username: auth === 'register' ? username.trim() : null,
    ...(password ? { password } : {}),
    trunkIps: ipsText.split(/[\s,]+/).filter(Boolean),
    callerId: callerId.trim(),
    codecs: t?.codecs ?? (['ulaw', 'alaw'] as ('ulaw' | 'alaw')[]),
  };
  const problems = trunkProblems(
    { ...draft, ipsText },
    Boolean(t?.passwordSet && t.auth === 'register'),
  );
  const done = (text: string) => {
    enqueueSnackbar(text, { variant: 'success' });
    setPassword('');
    void queryClient.invalidateQueries({ queryKey: sipTrunkKeys.account(accountId) });
    void queryClient.invalidateQueries({ queryKey: adminKeys.account(accountId) });
  };
  const save = useMutation({
    mutationFn: () => sipTrunksApi.save(accountId, draft),
    meta: { silent: true },
    onSuccess: () => done('SIP trunk saved — connecting'),
  });
  const remove = useMutation({
    mutationFn: () => sipTrunksApi.remove(accountId),
    meta: { silent: true },
    onSuccess: () => done('SIP trunk removed'),
  });
  const show = (k: string) => (touched ? problems[k] : undefined);
  return (
    <Stack spacing={2}>
      <RadioGroup
        row
        value={auth}
        onChange={(e) => setAuth(e.target.value as 'ip' | 'register')}
        aria-label="How the carrier knows us"
      >
        <FormControlLabel
          value="register"
          control={<Radio size="small" />}
          label="Username + password"
        />
        <FormControlLabel
          value="ip"
          control={<Radio size="small" />}
          label="Our server IP (no login)"
        />
      </RadioGroup>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="SIP server (host)"
          size="small"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          error={Boolean(show('host'))}
          helperText={show('host') ?? 'From the carrier, e.g. sip.carrier.in or an IP'}
          sx={{ flex: 2 }}
        />
        <TextField
          label="Port"
          size="small"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          error={Boolean(show('port'))}
          helperText={show('port') ?? 'Usually 5060'}
          sx={{ flex: 1 }}
        />
        <TextField
          select
          label="Transport"
          size="small"
          value={transport}
          onChange={(e) => setTransport(e.target.value as 'udp' | 'tcp')}
          sx={{ flex: 1 }}
        >
          <MenuItem value="udp">UDP</MenuItem>
          <MenuItem value="tcp">TCP</MenuItem>
        </TextField>
      </Stack>
      {auth === 'register' && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Username"
            size="small"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={Boolean(show('username'))}
            helperText={show('username')}
            sx={{ flex: 1 }}
          />
          <TextField
            label={t?.passwordSet ? 'Password (empty = keep saved)' : 'Password'}
            size="small"
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={Boolean(show('password'))}
            helperText={show('password') ?? 'Stored encrypted'}
            sx={{ flex: 1 }}
          />
        </Stack>
      )}
      <TextField
        label="Caller ID (number customers see)"
        size="small"
        value={callerId}
        onChange={(e) => setCallerId(e.target.value)}
        error={Boolean(show('callerId'))}
        helperText={
          show('callerId') ??
          'With country code, e.g. +911600000000 — added to the account’s numbers'
        }
      />
      <TextField
        label="Carrier IPs for incoming calls (optional)"
        size="small"
        value={ipsText}
        onChange={(e) => setIpsText(e.target.value)}
        error={Boolean(show('ipsText'))}
        helperText={show('ipsText') ?? 'Comma separated; empty = the SIP server above'}
      />
      {save.error && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
      {remove.error && <Alert severity="error">{getErrorMessage(remove.error)}</Alert>}
      <Stack direction="row" spacing={1}>
        <Button
          variant="contained"
          disabled={save.isPending}
          onClick={() => {
            setTouched(true);
            if (Object.keys(problems).length === 0) save.mutate();
          }}
        >
          Save and connect
        </Button>
        {view.configured && (
          <Button color="error" disabled={remove.isPending} onClick={() => remove.mutate()}>
            Remove trunk
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

/**
 * Superadmin: the account's own SIP trunk (its carrier login). Saved here, connected at once
 * — no env change. Saving also puts the account on the phone line and adds the caller ID.
 */
export function SipTrunkCard({ accountId }: { accountId: string }) {
  const trunk = useQuery({
    queryKey: sipTrunkKeys.account(accountId),
    queryFn: () => sipTrunksApi.get(accountId),
    refetchInterval: (q) => (q.state.data?.state === 'online' ? false : 10_000),
  });
  const state = trunk.data?.state ? STATE_TEXT[trunk.data.state] : undefined;
  return (
    <Card variant="outlined" component="section" aria-label="SIP trunk">
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="subtitle1" component="h2" sx={{ flex: 1 }}>
              SIP trunk (normal calls)
            </Typography>
            {trunk.data?.configured && state && (
              <Chip size="small" color={state.color} label={state.label} />
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Enter the details from this account’s SIP carrier. Saving connects the trunk and moves
            the account to the phone line — no server change needed.
          </Typography>
          {trunk.isPending ? (
            <Skeleton variant="rounded" height={160} />
          ) : trunk.error ? (
            <Alert severity="error">{getErrorMessage(trunk.error)}</Alert>
          ) : (
            <TrunkForm
              key={JSON.stringify(trunk.data.trunk)}
              accountId={accountId}
              view={trunk.data}
            />
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
