import CloseOutlined from '@mui/icons-material/CloseOutlined';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';

import { RelativeTime } from '@/components/RelativeTime';
import { useAgentCatalog } from '@/features/agents/queries';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { contactsApi } from '@/services/api/contacts';
import { getErrorMessage, isApiError } from '@/services/api/errors';
import {
  flowSimulatorApi,
  type SimulationInput,
  type StartSimulationInput,
} from '@/services/api/flow-simulator';
import type {
  Contact,
  Flow,
  FlowRun,
  FlowTranscriptEntry,
  FlowVariable,
  FlowVariableInfo,
} from '@/services/api/types';
import { formatCurrencyMicros } from '@/utils/format';

import { simulationKeys } from '../keys';
import { useSimulation, useSimulations } from '../queries';

import { aiFallbacks, END_REASON_LABELS, STATUS_LABELS, versionLabel } from './labels';
import { RunDetails } from './RunDetails';
import { Transcript } from './Transcript';

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

type Pending = Omit<SimulationInput, 'clientInputId'> & { clientInputId: string };

const merge = (a: FlowTranscriptEntry[], b: FlowTranscriptEntry[]) => {
  const seen = new Set(a.map((e) => e.seq));
  return [...a, ...b.filter((e) => !seen.has(e.seq))];
};

/** What the customer can do while the run waits. */
function Controls({
  run,
  busy,
  onSend,
}: {
  run: FlowRun;
  busy: boolean;
  onSend: (input: Omit<SimulationInput, 'clientInputId'>) => void;
}) {
  const [text, setText] = useState('');
  const [digits, setDigits] = useState('');
  const w = run.waiting;
  if (!w) return null;
  const labels = new Map((w.keys ?? []).map((k) => [k.key, k.label]));
  const silence = (
    <Button size="small" onClick={() => onSend({ kind: 'no_input' })} disabled={busy}>
      Stay silent
    </Button>
  );
  if (w.kind === 'dtmf') {
    const collect = w.mode === 'digits';
    return (
      <Stack spacing={1}>
        {collect && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <TextField
              size="small"
              label="Digits"
              value={digits}
              slotProps={{ input: { readOnly: true } }}
              sx={{ flex: 1 }}
            />
            <Button size="small" onClick={() => setDigits('')} disabled={!digits}>
              Clear
            </Button>
            <Button
              variant="contained"
              size="small"
              disabled={busy || !digits}
              onClick={() => {
                onSend({ kind: 'dtmf', value: digits });
                setDigits('');
              }}
            >
              Send
            </Button>
          </Stack>
        )}
        <Box
          role="group"
          aria-label="Keypad"
          sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.5 }}
        >
          {KEYPAD.map((k) => (
            <Button
              key={k}
              variant="outlined"
              size="small"
              disabled={busy || (collect && digits.length >= (w.maxDigits ?? 20))}
              aria-label={labels.has(k) ? `Press ${k}: ${labels.get(k) ?? ''}` : `Press ${k}`}
              onClick={() =>
                collect ? setDigits((d) => d + k) : onSend({ kind: 'dtmf', value: k })
              }
              sx={{ flexDirection: 'column', py: 0.5 }}
            >
              {k}
              {labels.has(k) && (
                <Typography
                  variant="caption"
                  noWrap
                  sx={{ maxWidth: '100%', textTransform: 'none' }}
                >
                  {labels.get(k)}
                </Typography>
              )}
            </Button>
          ))}
        </Box>
        {silence}
      </Stack>
    );
  }
  if (w.kind === 'transfer') {
    return (
      <Stack spacing={1}>
        <Typography variant="body2">
          Transfer to ••••{w.transferPhoneLast4 ?? ''} — what happened?
        </Typography>
        <Stack direction="row" spacing={1}>
          {(
            [
              ['connected', 'Answered'],
              ['no_answer', 'No answer'],
              ['failed', 'Failed'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="small"
              variant="outlined"
              disabled={busy}
              onClick={() => onSend({ kind: 'transfer_result', value })}
            >
              {label}
            </Button>
          ))}
        </Stack>
      </Stack>
    );
  }
  // speech, ai (and a timer, which the simulator never waits on)
  const send = () => {
    const value = text.trim();
    if (!value) return;
    onSend({ kind: 'speech', value });
    setText('');
  };
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1}>
        <TextField
          size="small"
          label={w.kind === 'ai' ? 'Reply to the AI agent' : 'Customer says'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              send();
            }
          }}
          slotProps={{ htmlInput: { maxLength: 500 } }}
          sx={{ flex: 1 }}
        />
        <Button variant="contained" size="small" onClick={send} disabled={busy || !text.trim()}>
          Send
        </Button>
      </Stack>
      {silence}
    </Stack>
  );
}

/** Start form: version, customer values (typed or a contact), test phone. */
function Setup({
  flow,
  dirty,
  known,
  flowVariables,
  busy,
  error,
  onStart,
}: {
  flow: Flow;
  dirty: boolean;
  known: FlowVariableInfo[] | undefined;
  flowVariables: FlowVariable[];
  busy: boolean;
  error: unknown;
  onStart: (body: StartSimulationInput) => void;
}) {
  const [version, setVersion] = useState<'draft' | 'published'>('draft');
  const [source, setSource] = useState<'manual' | 'contact'>('manual');
  const [values, setValues] = useState<Record<string, string>>({});
  const [testPhone, setTestPhone] = useState('');
  const [contact, setContact] = useState<Contact | null>(null);
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const contacts = useQuery({
    queryKey: ['contacts', 'picker', q],
    queryFn: () => contactsApi.list({ q: q || undefined, limit: 10 }),
    enabled: source === 'contact',
  });
  const fields = [
    ...(known ?? [])
      .filter((v) => v.source === 'contact' && v.name !== 'phone_last4')
      .map((v) => ({ name: v.name, label: v.label })),
    ...flowVariables.map((v) => ({ name: v.name, label: v.label ?? v.name })),
  ];
  const draftBlocked = version === 'draft' && dirty;
  const fieldErrors = new Map(
    isApiError(error)
      ? (error.details ?? []).map((d) => [d.path?.replace(/^variables\./, '') ?? '', d.message])
      : [],
  );
  const start = () =>
    onStart(
      source === 'contact' && contact
        ? { version, contactId: contact.id }
        : {
            version,
            variables: Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim())),
            ...(testPhone ? { testPhone } : {}),
          },
    );
  return (
    <Stack spacing={1.5} sx={{ p: 1.5, overflowY: 'auto' }}>
      <TextField
        select
        size="small"
        label="Version"
        value={version}
        onChange={(e) => setVersion(e.target.value as 'draft' | 'published')}
      >
        <MenuItem value="draft">Saved draft</MenuItem>
        {flow.publishedVersion !== null && (
          <MenuItem value="published">Published (v{flow.publishedVersion})</MenuItem>
        )}
      </TextField>
      <RadioGroup
        row
        value={source}
        onChange={(e) => setSource(e.target.value as 'manual' | 'contact')}
        aria-label="Customer data from"
      >
        <FormControlLabel value="manual" control={<Radio size="small" />} label="Type values" />
        <FormControlLabel value="contact" control={<Radio size="small" />} label="A contact" />
      </RadioGroup>
      {source === 'contact' ? (
        <Autocomplete
          options={contacts.data?.data ?? []}
          value={contact}
          onChange={(_e, v) => setContact(v)}
          onInputChange={(_e, v) => setSearch(v)}
          filterOptions={(x) => x}
          loading={contacts.isFetching}
          getOptionLabel={(c) => `${c.name ?? 'No name'} · ••••${c.phoneE164.slice(-4)}`}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(params) => <TextField {...params} label="Contact" size="small" />}
        />
      ) : (
        <>
          {fields.map((f) => (
            <TextField
              key={f.name}
              size="small"
              label={`{{${f.name}}}`}
              placeholder={f.label}
              value={values[f.name] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              error={fieldErrors.has(f.name)}
              helperText={fieldErrors.get(f.name)}
              slotProps={{ htmlInput: { maxLength: 300 } }}
            />
          ))}
          <TextField
            size="small"
            label="Test phone (optional)"
            placeholder="+919876543210"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value.replace(/[^\d+]/g, ''))}
            error={fieldErrors.has('testPhone')}
            helperText={fieldErrors.get('testPhone') ?? 'Only API requests see it'}
          />
        </>
      )}
      {draftBlocked && (
        <Alert severity="info">Save first — the simulator runs the saved draft.</Alert>
      )}
      {error !== null && error !== undefined && fieldErrors.size === 0 && (
        <Alert severity="error">{getErrorMessage(error)}</Alert>
      )}
      <Button
        variant="contained"
        onClick={start}
        disabled={busy || draftBlocked || (source === 'contact' && !contact)}
      >
        Start test call
      </Button>
    </Stack>
  );
}

function History({ flowId }: { flowId: string }) {
  const runs = useSimulations(flowId);
  if (runs.isPending) return <Typography sx={{ p: 2 }}>Loading…</Typography>;
  if (runs.isError) return <Alert severity="error">{getErrorMessage(runs.error)}</Alert>;
  if (runs.data.length === 0)
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
        No test calls yet.
      </Typography>
    );
  return (
    <List dense sx={{ overflowY: 'auto' }} aria-label="Test call history">
      {runs.data.map((r) => (
        <ListItemButton
          key={r.id}
          component={RouterLink}
          to={`/flows/${flowId}/simulations/${r.id}`}
        >
          <ListItemText
            primary={`${versionLabel(r.versionRef)} · ${
              r.endReason ? END_REASON_LABELS[r.endReason] : STATUS_LABELS[r.status]
            }`}
            secondary={
              <>
                {r.contactName ?? 'Typed values'} · {r.createdBy?.name ?? '—'} ·{' '}
                <RelativeTime value={r.createdAt} /> · {formatCurrencyMicros(r.costMicros)}
              </>
            }
          />
        </ListItemButton>
      ))}
    </List>
  );
}

/** Text simulator of a flow, shown next to the canvas. */
export function SimulatorPanel({
  flow,
  dirty,
  canRun,
  known,
  flowVariables,
  onNode,
  onClose,
}: {
  flow: Flow;
  dirty: boolean;
  canRun: boolean;
  known: FlowVariableInfo[] | undefined;
  flowVariables: FlowVariable[];
  /** Highlights the step the run is on (`null` clears it). */
  onNode: (id: string | null) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'test' | 'history'>(canRun ? 'test' : 'history');
  const [run, setRun] = useState<FlowRun | null>(null);
  const [entries, setEntries] = useState<FlowTranscriptEntry[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const catalog = useAgentCatalog();
  const full = useSimulation(flow.id, run?.id ?? '', Boolean(run));

  const apply = (next: FlowRun, added: FlowTranscriptEntry[]) => {
    setRun(next);
    setEntries((prev) => merge(prev, added));
    onNode(next.status === 'ended' ? null : next.currentNodeId);
    void queryClient.invalidateQueries({ queryKey: simulationKeys.list(flow.id) });
    void queryClient.invalidateQueries({ queryKey: simulationKeys.run(flow.id, next.id) });
  };

  const start = useMutation({
    mutationFn: (body: StartSimulationInput) => flowSimulatorApi.start(flow.id, body),
    onSuccess: (step) => {
      setEntries([]);
      apply(step.run, step.added);
    },
  });
  const send = useMutation({
    mutationFn: (input: Pending) => flowSimulatorApi.send(flow.id, run?.id ?? '', input),
    onSuccess: (step) => {
      setPending(null);
      apply(step.run, step.added);
    },
    onError: (err) => {
      // a definite answer from the server — retrying the same input won't help
      if (isApiError(err) && err.status >= 400 && err.status < 500) {
        setPending(null);
        if (err.status === 409) void full.refetch();
      }
    },
  });
  const submit = (input: Omit<SimulationInput, 'clientInputId'>) => {
    const p: Pending = { ...input, clientInputId: crypto.randomUUID() };
    setPending(p);
    send.mutate(p);
  };
  const reset = () => {
    setRun(null);
    setEntries([]);
    setPending(null);
    start.reset();
    send.reset();
    onNode(null);
  };

  const view = full.data && run && full.data.id === run.id ? { ...full.data, ...run } : run;
  const fallbacks = aiFallbacks(entries);
  const busy = send.isPending || start.isPending;

  return (
    <Box
      component="aside"
      aria-label="Simulator"
      sx={{
        width: 380,
        borderLeft: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1.5, pt: 1 }}>
        <Typography variant="subtitle1" sx={{ flex: 1 }}>
          Simulator
        </Typography>
        {catalog.data?.provider === 'fake' && (
          <Chip size="small" color="warning" label="Test mode — fake AI" />
        )}
        <IconButton aria-label="Close simulator" size="small" onClick={onClose}>
          <CloseOutlined fontSize="small" />
        </IconButton>
      </Stack>
      <Tabs value={tab} onChange={(_e, t: 'test' | 'history') => setTab(t)} sx={{ px: 1 }}>
        {canRun && <Tab value="test" label="Test call" />}
        <Tab value="history" label="History" />
      </Tabs>
      {tab === 'history' ? (
        <History flowId={flow.id} />
      ) : !run ? (
        <Setup
          flow={flow}
          dirty={dirty}
          known={known}
          flowVariables={flowVariables}
          busy={start.isPending}
          error={start.error}
          onStart={(body) => start.mutate(body)}
        />
      ) : (
        <Stack sx={{ flex: 1, minHeight: 0 }}>
          <Stack direction="row" spacing={1} sx={{ px: 1.5, py: 1, flexWrap: 'wrap', gap: 0.5 }}>
            <Chip size="small" label={versionLabel(run.versionRef)} />
            <Chip
              size="small"
              color={run.status === 'ended' ? 'default' : 'success'}
              label={STATUS_LABELS[run.status]}
            />
            <Chip
              size="small"
              variant="outlined"
              label={`Cost ${formatCurrencyMicros(run.costMicros)}`}
            />
          </Stack>
          {fallbacks.walletEmpty && (
            <Alert severity="warning" sx={{ mx: 1 }}>
              Your wallet is empty, so the AI agent couldn’t reply.{' '}
              <Link component={RouterLink} to="/wallet">
                Add money
              </Link>
            </Alert>
          )}
          {fallbacks.capReached && (
            <Alert severity="warning" sx={{ mx: 1 }}>
              An AI agent reached its spending limit.{' '}
              <Link component={RouterLink} to="/agents">
                Review agents
              </Link>
            </Alert>
          )}
          <Transcript
            entries={entries}
            onNode={(id) => onNode(id)}
            footer={
              send.isPending ? (
                <Typography role="status" variant="caption" color="text.secondary">
                  Waiting for the flow…
                </Typography>
              ) : undefined
            }
          />
          <Box sx={{ px: 1.5, py: 1, borderTop: 1, borderColor: 'divider' }}>
            {send.isError && pending ? (
              <Alert
                severity="error"
                action={
                  <Button color="inherit" size="small" onClick={() => send.mutate(pending)}>
                    Retry
                  </Button>
                }
              >
                {getErrorMessage(send.error)}
              </Alert>
            ) : send.isError ? (
              <Alert severity="error" sx={{ mb: 1 }}>
                {getErrorMessage(send.error)}
              </Alert>
            ) : null}
            {run.status === 'ended' ? (
              <Stack spacing={1}>
                <Typography variant="body2">
                  {run.endReason ? END_REASON_LABELS[run.endReason] : 'Call ended'}
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button variant="contained" size="small" onClick={reset}>
                    New test
                  </Button>
                  <Button
                    size="small"
                    component={RouterLink}
                    to={`/flows/${flow.id}/simulations/${run.id}`}
                  >
                    Full details
                  </Button>
                </Stack>
              </Stack>
            ) : (
              !(send.isError && pending) && (
                <Stack spacing={1}>
                  <Controls
                    key={`${run.currentNodeId ?? ''}:${String(entries.length)}`}
                    run={run}
                    busy={busy}
                    onSend={submit}
                  />
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => submit({ kind: 'hangup' })}
                      disabled={busy}
                    >
                      Hang up
                    </Button>
                    <Button size="small" onClick={reset} disabled={busy}>
                      Restart
                    </Button>
                  </Stack>
                </Stack>
              )
            )}
          </Box>
          {view && (
            <Box sx={{ maxHeight: 260, overflowY: 'auto', px: 1, pb: 1 }}>
              <RunDetails run={view} onNode={(id) => onNode(id)} />
            </Box>
          )}
        </Stack>
      )}
    </Box>
  );
}
