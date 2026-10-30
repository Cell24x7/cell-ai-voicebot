import RestartAltOutlined from '@mui/icons-material/RestartAltOutlined';
import SendOutlined from '@mui/icons-material/SendOutlined';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router';

import { RelativeTime } from '@/components/RelativeTime';
import { walletKeys } from '@/features/wallet/keys';
import { useCanTopUp } from '@/features/wallet/queries';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { agentsApi } from '@/services/api/agents';
import { contactsApi } from '@/services/api/contacts';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import { playgroundApi, type StartSessionInput } from '@/services/api/playground';
import type {
  Contact,
  PlaygroundReply,
  PlaygroundSession,
  PlaygroundTurn,
} from '@/services/api/types';
import { formatCurrencyMicros } from '@/utils/format';

import type { EditorTabProps } from '../editor/editor-context';
import { playgroundKeys } from '../keys';

import { OutcomePanel } from './OutcomePanel';
import { TurnView } from './TurnView';

const MAX = 2000;

interface Pending {
  text: string;
  clientTurnId: string;
  state: 'sending' | 'failed';
  error?: string;
}

const newId = (): string => crypto.randomUUID();

/** Agent → Playground: text conversations with the agent (charged per turn). */
export function PlaygroundTab({ agent, catalog, readOnly, onAgentChange }: EditorTabProps) {
  const queryClient = useQueryClient();
  const canTopUp = useCanTopUp();
  const sessions = useQuery({
    queryKey: playgroundKeys.sessions(agent.id),
    queryFn: () => playgroundApi.list(agent.id),
  });
  const [picked, setPicked] = useState<string | null>(null);
  const currentId = picked ?? sessions.data?.[0]?.id ?? null;
  const session = useQuery({
    queryKey: playgroundKeys.session(agent.id, currentId ?? ''),
    queryFn: () => playgroundApi.get(agent.id, currentId ?? ''),
    enabled: Boolean(currentId),
  });
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  // variables for a new session
  const [source, setSource] = useState<'manual' | 'contact'>('manual');
  const [values, setValues] = useState<Record<string, string>>({});
  const [testPhone, setTestPhone] = useState('');
  const [contact, setContact] = useState<Contact | null>(null);
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const contacts = useQuery({
    queryKey: ['contacts', 'picker', q],
    queryFn: () => contactsApi.list({ q: q || undefined, limit: 10 }),
    enabled: !readOnly && source === 'contact',
  });

  const adopt = (next: PlaygroundSession) => {
    queryClient.setQueryData(playgroundKeys.session(agent.id, next.id), next);
    void queryClient.invalidateQueries({ queryKey: playgroundKeys.sessions(agent.id) });
    setPicked(next.id);
    setPending(null);
  };
  const start = useMutation({
    mutationFn: (body: StartSessionInput) => playgroundApi.start(agent.id, body),
    onSuccess: adopt,
  });
  const reset = useMutation({
    mutationFn: (sid: string) => playgroundApi.reset(agent.id, sid),
    onSuccess: adopt,
  });
  const send = useMutation({
    mutationFn: (p: Pending) =>
      playgroundApi.send(agent.id, currentId ?? '', { text: p.text, clientTurnId: p.clientTurnId }),
    onSuccess: (reply: PlaygroundReply) => {
      const key = playgroundKeys.session(agent.id, currentId ?? '');
      const current = queryClient.getQueryData<PlaygroundSession>(key);
      if (current) {
        const known = new Set(current.turns.map((t) => t.id));
        queryClient.setQueryData<PlaygroundSession>(key, {
          ...current,
          turns: [
            ...current.turns,
            ...[reply.userTurn, reply.turn].filter((t) => !known.has(t.id)),
          ],
          outcome: reply.outcome,
          status: reply.status,
          costMicros: current.costMicros + (reply.replay ? 0 : reply.turn.costMicros),
        });
      }
      setPending(null);
      void queryClient.invalidateQueries({ queryKey: playgroundKeys.sessions(agent.id) });
      void queryClient.invalidateQueries({ queryKey: walletKeys.all });
    },
    onError: (err, p) => {
      const e = toApiError(err);
      setPending({
        ...p,
        state: 'failed',
        error:
          e.code === 'AI_SPEND_CAP_REACHED'
            ? 'This agent reached its spending cap.'
            : getErrorMessage(err),
      });
    },
  });
  const turnOn = useMutation({
    mutationFn: () => agentsApi.setActive(agent.id, true),
    onSuccess: onAgentChange,
  });

  const data = session.data;
  const turns = data?.turns ?? [];
  const ended = data?.status === 'ended';
  const lastReply = [...turns].reverse().find((t) => t.role === 'assistant');
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [turns.length, pending?.state]);

  // a message typed while a new conversation starts would land in the old one
  const switching = start.isPending || reset.isPending;
  const submit = () => {
    const body = text.trim();
    if (!body || !currentId || send.isPending || switching) return;
    const p: Pending = { text: body, clientTurnId: newId(), state: 'sending' };
    setPending(p);
    setText('');
    send.mutate(p);
  };
  const retry = () => {
    if (!pending) return;
    const p: Pending = { ...pending, state: 'sending', error: undefined };
    setPending(p);
    send.mutate(p);
  };
  const startSession = () => {
    if (source === 'contact' && contact) {
      start.mutate({ contactId: contact.id });
      return;
    }
    const phone = testPhone.trim();
    start.mutate({
      variables: values,
      ...(/^\+[1-9]\d{6,14}$/.test(phone) ? { testPhone: phone } : {}),
    });
  };
  const pendingTurn: PlaygroundTurn | null = pending
    ? {
        id: 'pending',
        clientTurnId: pending.clientTurnId,
        role: 'user',
        text: pending.text,
        toolCalls: [],
        knowledge: [],
        inputTokens: 0,
        outputTokens: 0,
        costMicros: 0,
        billing: 'none',
        guardrail: null,
        fallback: null,
        at: new Date(0).toISOString(),
      }
    : null;

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 3 }}>
        <Stack spacing={2}>
          {!readOnly && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Typography variant="subtitle2">New conversation</Typography>
                <RadioGroup
                  value={source}
                  onChange={(e) => setSource(e.target.value as 'manual' | 'contact')}
                  aria-label="Customer data from"
                >
                  <FormControlLabel
                    value="manual"
                    control={<Radio size="small" />}
                    label="Type values"
                  />
                  <FormControlLabel
                    value="contact"
                    control={<Radio size="small" />}
                    label="A contact"
                  />
                </RadioGroup>
                {source === 'contact' ? (
                  <Autocomplete
                    options={contacts.data?.data ?? []}
                    value={contact}
                    onChange={(_e, v) => setContact(v)}
                    onInputChange={(_e, v) => setSearch(v)}
                    filterOptions={(x) => x}
                    getOptionLabel={(c) => `${c.name ?? 'No name'} · ••••${c.phoneE164.slice(-4)}`}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    renderInput={(params) => <TextField {...params} label="Contact" size="small" />}
                  />
                ) : (
                  <>
                    {agent.allowedVariables
                      .filter((v) => v !== 'phone_last4')
                      .map((name) => (
                        <TextField
                          key={name}
                          label={`{{${name}}}`}
                          size="small"
                          value={values[name] ?? ''}
                          onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
                          slotProps={{ htmlInput: { maxLength: 200 } }}
                        />
                      ))}
                    <TextField
                      label="Test phone (optional)"
                      size="small"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value.replace(/[^\d+]/g, ''))}
                      helperText="Only your functions see it — never the AI"
                    />
                  </>
                )}
                <Button
                  variant="contained"
                  onClick={startSession}
                  disabled={start.isPending || (source === 'contact' && !contact)}
                >
                  Start new conversation
                </Button>
                {start.isError && <Alert severity="error">{getErrorMessage(start.error)}</Alert>}
              </Stack>
            </Paper>
          )}
          <Paper variant="outlined" sx={{ p: 1 }}>
            <Typography variant="subtitle2" sx={{ px: 1, pt: 1 }}>
              Recent conversations
            </Typography>
            {sessions.isError && (
              <Alert
                severity="error"
                action={<Button onClick={() => void sessions.refetch()}>Retry</Button>}
              >
                {getErrorMessage(sessions.error)}
              </Alert>
            )}
            {sessions.data?.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                None yet.
              </Typography>
            )}
            <List dense aria-label="Recent conversations">
              {(sessions.data ?? []).map((s) => (
                <ListItemButton
                  key={s.id}
                  selected={s.id === currentId}
                  onClick={() => setPicked(s.id)}
                >
                  <ListItemText
                    primary={s.lastText ?? 'No messages'}
                    secondary={
                      <>
                        {s.turns} turns · {s.status === 'ended' ? 'ended · ' : ''}
                        <RelativeTime value={s.updatedAt} />
                      </>
                    }
                    slotProps={{ primary: { noWrap: true } }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        </Stack>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Paper
          variant="outlined"
          sx={{ p: 2, display: 'flex', flexDirection: 'column', minHeight: 420 }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
            <Typography variant="subtitle2" sx={{ flex: 1 }}>
              Conversation
            </Typography>
            {catalog?.provider === 'fake' && (
              <Chip size="small" color="warning" label="Test mode — fake AI" />
            )}
            {data && (
              <Chip
                size="small"
                variant="outlined"
                label={`Cost ${formatCurrencyMicros(data.costMicros)}`}
              />
            )}
            {data && !readOnly && (
              <Button
                size="small"
                startIcon={<RestartAltOutlined />}
                onClick={() => reset.mutate(data.id)}
                disabled={reset.isPending}
              >
                Reset
              </Button>
            )}
          </Stack>
          {lastReply?.fallback === 'walletEmpty' && (
            <Alert
              severity="warning"
              sx={{ mb: 1 }}
              action={
                canTopUp && (
                  <Button component={RouterLink} to="/wallet?add=1" size="small">
                    Add money
                  </Button>
                )
              }
            >
              The wallet is empty — the agent answered with its wallet-empty message.
            </Alert>
          )}
          {lastReply?.fallback === 'capReached' && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              This agent reached its spending cap.{' '}
              <Link component={RouterLink} to={`/agents/${agent.id}/limits`}>
                Change the limits
              </Link>
            </Alert>
          )}
          {lastReply?.fallback === 'agentOff' && (
            <Alert
              severity="warning"
              sx={{ mb: 1 }}
              action={
                !readOnly && (
                  <Button
                    size="small"
                    onClick={() => turnOn.mutate()}
                    disabled={turnOn.isPending || agent.isActive}
                  >
                    Turn on
                  </Button>
                )
              }
            >
              {agent.isActive
                ? 'The agent is on now — send the message again.'
                : 'This agent is off, so it answered with its "agent off" message.'}
            </Alert>
          )}
          {lastReply?.fallback === 'aiFailed' && (
            <Alert severity="error" sx={{ mb: 1 }}>
              The AI could not answer{lastReply.guardrail ? ' (its reply broke a rule twice)' : ''}{' '}
              — the "AI failed" message was used.
            </Alert>
          )}
          {session.isError && (
            <Alert
              severity="error"
              action={<Button onClick={() => void session.refetch()}>Retry</Button>}
            >
              {getErrorMessage(session.error)}
            </Alert>
          )}
          <Stack
            spacing={1.5}
            sx={{ flex: 1, overflowY: 'auto', maxHeight: 520, py: 1 }}
            role="list"
            aria-label="Messages"
          >
            {!currentId && (
              <Typography variant="body2" color="text.secondary">
                {readOnly ? 'No conversations yet.' : 'Start a conversation to test this agent.'}
              </Typography>
            )}
            {turns.map((t) => (
              <TurnView key={t.id} turn={t} />
            ))}
            {pendingTurn &&
              !turns.some((t) => t.role === 'user' && t.clientTurnId === pending?.clientTurnId) && (
                <TurnView turn={pendingTurn} pending={pending?.state} />
              )}
            {pending?.state === 'sending' && (
              <Typography variant="caption" color="text.secondary" role="status">
                Agent is typing…
              </Typography>
            )}
            {pending?.state === 'failed' && (
              <Alert severity="error" action={<Button onClick={retry}>Retry</Button>}>
                Not sent: {pending.error}
              </Alert>
            )}
            <div ref={endRef} />
          </Stack>
          {!readOnly && currentId && (
            <Box sx={{ pt: 1 }}>
              {ended ? (
                <Alert severity="info">
                  This conversation has ended — start a new one or press Reset.
                </Alert>
              ) : (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-end' }}>
                  <TextField
                    label="Message"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        submit();
                      }
                    }}
                    multiline
                    maxRows={5}
                    fullWidth
                    size="small"
                    disabled={pending?.state === 'sending' || switching}
                    helperText={`${text.length} / ${MAX} · Enter to send, Shift+Enter for a new line`}
                    slotProps={{ htmlInput: { maxLength: MAX } }}
                  />
                  <Button
                    variant="contained"
                    onClick={submit}
                    disabled={!text.trim() || pending?.state === 'sending' || switching}
                    aria-label="Send"
                    sx={{ mb: 3 }}
                  >
                    <SendOutlined fontSize="small" />
                  </Button>
                </Stack>
              )}
            </Box>
          )}
        </Paper>
      </Grid>

      <Grid size={{ xs: 12, md: 3 }}>
        <Stack spacing={2}>
          {data && <OutcomePanel outcome={data.outcome} ended={ended} />}
          {data && Object.keys(data.variables).length > 0 && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                What the AI knows
              </Typography>
              {Object.entries(data.variables).map(([k, v]) => (
                <Typography key={k} variant="body2">
                  <code>{`{{${k}}}`}</code> {v || '—'}
                </Typography>
              ))}
              {data.hasTestPhone && (
                <Typography variant="caption" color="text.secondary">
                  A test phone is set for functions.
                </Typography>
              )}
            </Paper>
          )}
        </Stack>
      </Grid>
    </Grid>
  );
}
