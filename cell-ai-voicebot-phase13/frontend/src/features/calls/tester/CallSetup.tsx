import MicOutlined from '@mui/icons-material/MicOutlined';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { agentKeys } from '@/features/agents/keys';
import { contactKeys } from '@/features/contacts/keys';
import { flowKeys } from '@/features/flows/keys';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { agentsApi } from '@/services/api/agents';
import type { StartWebCallInput } from '@/services/api/calls';
import { contactsApi } from '@/services/api/contacts';
import { flowsApi } from '@/services/api/flows';
import type { AgentRow, Contact, FlowListItem } from '@/services/api/types';

import {
  createAudioEngine,
  MIC_ERROR_TEXT,
  MicError,
  requestMicrophone,
  type AudioEngine,
} from '../audio/engine';

export interface SetupPrefill {
  flowId?: string | null;
  version?: 'draft' | 'published' | null;
  agentId?: string | null;
  /** `?contactId=` (contact page "Test in browser") → that contact is preselected. */
  contactId?: string | null;
}

/** Microphone check: a live level meter until the call starts. */
export function MicCheck({
  check = async () => {
    const stream = await requestMicrophone();
    return createAudioEngine(stream);
  },
}: {
  check?: () => Promise<AudioEngine>;
}) {
  const [state, setState] = useState<'off' | 'on' | 'error'>('off');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const engine = useRef<AudioEngine | null>(null);
  useEffect(
    () => () => {
      void engine.current?.close();
    },
    [],
  );
  const toggle = async () => {
    if (engine.current) {
      await engine.current.close();
      engine.current = null;
      setState('off');
      setLevel(0);
      return;
    }
    try {
      const e = await check();
      engine.current = e;
      e.onLevel((l) => setLevel(l));
      setState('on');
    } catch (err) {
      setError(MIC_ERROR_TEXT[err instanceof MicError ? err.code : 'mic_failed']);
      setState('error');
    }
  };
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Button size="small" startIcon={<MicOutlined />} onClick={() => void toggle()}>
          {state === 'on' ? 'Stop mic check' : 'Check microphone'}
        </Button>
        {state === 'on' && (
          <Box sx={{ flex: 1 }}>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, level * 300)}
              aria-label="Microphone level"
            />
          </Box>
        )}
      </Stack>
      {state === 'on' && (
        <Typography variant="caption" color="text.secondary">
          Speak — the bar should move. Use headphones so the bot does not hear itself.
        </Typography>
      )}
      {state === 'error' && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

/**
 * What to call and with which customer: a flow (published, saved draft) or an
 * agent; a contact or typed values + an optional test phone.
 */
export function CallSetup({
  prefill,
  busy,
  fieldErrors,
  onStart,
}: {
  prefill: SetupPrefill;
  busy: boolean;
  fieldErrors: Map<string, string>;
  onStart: (body: StartWebCallInput) => void;
}) {
  const [kind, setKind] = useState<'flow' | 'agent'>(prefill.agentId ? 'agent' : 'flow');
  // undefined = not chosen yet → the prefilled one (?flowId= / ?agentId=) once the list has it
  const [flowChoice, setFlow] = useState<FlowListItem | null | undefined>(undefined);
  const [agentChoice, setAgent] = useState<AgentRow | null | undefined>(undefined);
  const [version, setVersion] = useState<'draft' | 'published'>(prefill.version ?? 'published');
  const [source, setSource] = useState<'manual' | 'contact'>(
    prefill.contactId ? 'contact' : 'manual',
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [testPhone, setTestPhone] = useState('');
  // undefined = not chosen yet → the prefilled one (?contactId=) once loaded
  const [contactChoice, setContact] = useState<Contact | null | undefined>(undefined);
  const [contactSearch, setContactSearch] = useState('');
  const [flowSearch, setFlowSearch] = useState('');
  const contactQ = useDebouncedValue(contactSearch.trim(), 300);
  const flowQ = useDebouncedValue(flowSearch.trim(), 300);

  const flows = useQuery({
    queryKey: ['flows', 'picker', flowQ],
    queryFn: () => flowsApi.list({ q: flowQ || undefined, limit: 20 }),
    enabled: kind === 'flow',
    // the input's own label starts a search: keep the prefilled flow while it runs
    placeholderData: keepPreviousData,
  });
  const agents = useQuery({
    queryKey: ['agents', 'picker'],
    queryFn: () => agentsApi.list({ activeOnly: true, limit: 50 }),
    enabled: kind === 'agent',
  });
  const contacts = useQuery({
    queryKey: ['contacts', 'picker', contactQ],
    queryFn: () => contactsApi.list({ q: contactQ || undefined, limit: 10 }),
    enabled: source === 'contact',
  });

  const prefilledContact = useQuery({
    queryKey: contactKeys.detail(prefill.contactId ?? ''),
    queryFn: () => contactsApi.get(prefill.contactId ?? ''),
    enabled: Boolean(prefill.contactId) && contactChoice === undefined,
  });
  const contact = contactChoice !== undefined ? contactChoice : (prefilledContact.data ?? null);
  const flow =
    flowChoice !== undefined
      ? flowChoice
      : (flows.data?.data.find((f) => f.id === prefill.flowId) ?? null);
  const agent =
    agentChoice !== undefined
      ? agentChoice
      : (agents.data?.data.find((a) => a.id === prefill.agentId) ?? null);

  const flowId = kind === 'flow' && flow ? flow.id : '';
  const agentId = kind === 'agent' && agent ? agent.id : '';
  const flowVariables = useQuery({
    queryKey: flowKeys.variables(flowId),
    queryFn: () => flowsApi.variables(flowId),
    enabled: Boolean(flowId),
  });
  const agentDetail = useQuery({
    queryKey: agentKeys.detail(agentId),
    queryFn: () => agentsApi.get(agentId),
    enabled: Boolean(agentId),
  });
  const fields =
    kind === 'flow'
      ? (flowVariables.data ?? [])
          .filter((v) => v.source !== 'system' && v.name !== 'phone_last4')
          .map((v) => ({ name: v.name, label: v.label }))
      : (agentDetail.data?.allowedVariables ?? [])
          .filter((name) => name !== 'phone_last4')
          .map((name) => ({ name, label: name }));

  const published = flow?.publishedVersion ?? null;
  const effectiveVersion = version === 'published' && published === null ? 'draft' : version;
  const ready = kind === 'flow' ? Boolean(flow) : Boolean(agent);
  const start = () => {
    const target: StartWebCallInput =
      kind === 'flow' && flow
        ? { flowId: flow.id, version: effectiveVersion }
        : { agentId: agent?.id ?? '' };
    const customer: StartWebCallInput =
      source === 'contact' && contact
        ? { contactId: contact.id }
        : {
            variables: Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim())),
            ...(testPhone ? { testPhone } : {}),
          };
    onStart({ ...target, ...customer });
  };

  return (
    <Stack spacing={2} component="section" aria-label="Call setup">
      <RadioGroup
        row
        value={kind}
        onChange={(e) => setKind(e.target.value as 'flow' | 'agent')}
        aria-label="What to call with"
      >
        <FormControlLabel value="flow" control={<Radio size="small" />} label="A call flow" />
        <FormControlLabel
          value="agent"
          control={<Radio size="small" />}
          label="An AI agent alone"
        />
      </RadioGroup>
      {kind === 'flow' ? (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Autocomplete
            sx={{ flex: 1 }}
            options={(flows.data?.data ?? []).filter((f) => f.status !== 'archived')}
            value={flow}
            onChange={(_e, v) => setFlow(v)}
            onInputChange={(_e, v) => setFlowSearch(v)}
            filterOptions={(x) => x}
            loading={flows.isFetching}
            getOptionLabel={(f) => f.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => <TextField {...params} label="Flow" size="small" />}
          />
          <TextField
            select
            size="small"
            label="Version"
            sx={{ minWidth: 180 }}
            value={effectiveVersion}
            onChange={(e) => setVersion(e.target.value as 'draft' | 'published')}
          >
            {published !== null && <MenuItem value="published">Published (v{published})</MenuItem>}
            <MenuItem value="draft">Saved draft</MenuItem>
          </TextField>
        </Stack>
      ) : (
        <Autocomplete
          options={agents.data?.data ?? []}
          value={agent}
          onChange={(_e, v) => setAgent(v)}
          loading={agents.isFetching}
          getOptionLabel={(a) => a.name}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(params) => <TextField {...params} label="AI agent" size="small" />}
        />
      )}
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
          options={
            contact && !(contacts.data?.data ?? []).some((c) => c.id === contact.id)
              ? [contact, ...(contacts.data?.data ?? [])]
              : (contacts.data?.data ?? [])
          }
          value={contact}
          onChange={(_e, v) => setContact(v)}
          onInputChange={(_e, v) => setContactSearch(v)}
          filterOptions={(x) => x}
          loading={contacts.isFetching}
          getOptionLabel={(c) => `${c.name ?? 'No name'} · ••••${c.phoneE164.slice(-4)}`}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(params) => <TextField {...params} label="Contact" size="small" />}
        />
      ) : (
        <Stack spacing={1.5}>
          {fields.map((f) => (
            <TextField
              key={f.name}
              size="small"
              label={`{{${f.name}}}`}
              placeholder={f.label}
              value={values[f.name] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              error={fieldErrors.has(`variables.${f.name}`)}
              helperText={fieldErrors.get(`variables.${f.name}`)}
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
            helperText={
              fieldErrors.get('testPhone') ?? 'Only API steps and functions see it — never shown'
            }
          />
        </Stack>
      )}
      <MicCheck />
      <Button
        variant="contained"
        onClick={start}
        disabled={busy || !ready || (source === 'contact' && !contact)}
      >
        Start call
      </Button>
    </Stack>
  );
}
