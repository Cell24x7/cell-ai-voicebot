import {
  Alert,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useEffect, useRef, useState } from 'react';

import { usePermission, useSession } from '@/features/auth/hooks';
import { useDispositions } from '@/features/insights/queries';
import { clearCall, isBusy, placeTeamCall } from '@/features/whatsapp-calling/live/controller';
import { useLiveCallStore } from '@/features/whatsapp-calling/live/store';
import { callsApi } from '@/services/api/calls';
import { campaignsApi, type TeamSession } from '@/services/api/campaigns';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import type { Campaign } from '@/services/api/types';
import { useWsEvent } from '@/services/realtime/hooks';

import {
  AGENT_STATE_LABELS,
  HEARTBEAT_MS,
  STATE_COLOR,
  WAIT_RETRY_MS,
  WAIT_TEXT,
  sessionKey,
} from './team-labels';

/** Live board of the campaign's calling session (supervisors and agents). */
function AgentBoard({ board }: { board: TeamSession }) {
  if (!board.agents.length)
    return (
      <Typography variant="body2" color="text.secondary">
        Waiting for agents — nobody has joined the calling session yet.
      </Typography>
    );
  return (
    <Table size="small" aria-label="Agents in the calling session">
      <TableHead>
        <TableRow>
          <TableCell>Team member</TableCell>
          <TableCell>Now</TableCell>
          <TableCell>Since</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {board.agents.map((a) => (
          <TableRow key={a.userId}>
            <TableCell>{a.name}</TableCell>
            <TableCell>
              <Chip size="small" color={STATE_COLOR[a.state]} label={AGENT_STATE_LABELS[a.state]} />
            </TableCell>
            <TableCell>{new Date(a.since).toLocaleTimeString()}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** After the call: outcome + note, saved by the agent (or the wrap-up timer). */
function WrapUpForm({
  campaignId,
  callId,
  wrapUpSec,
  onDone,
}: {
  campaignId: string;
  callId: string;
  wrapUpSec: number;
  onDone: () => void;
}) {
  const dispositions = useDispositions();
  const [disposition, setDisposition] = useState('');
  const [note, setNote] = useState('');
  const [left, setLeft] = useState(wrapUpSec);
  const save = useMutation({
    mutationFn: (body: { disposition: string | null; note: string | null }) =>
      campaignsApi.wrapUp(campaignId, callId, body),
    meta: { silent: true },
    onSuccess: () => onDone(),
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  const touched = Boolean(disposition || note);
  const { mutate } = save;
  useEffect(() => {
    // the timer moves on only while nothing is typed (a started note is never lost)
    if (touched || wrapUpSec <= 0) return undefined;
    if (left <= 0) {
      mutate({ disposition: null, note: null });
      return undefined;
    }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left, touched, wrapUpSec, mutate]);
  return (
    <Stack spacing={2} component="section" aria-label="Call outcome">
      <Typography variant="subtitle2">How did the call go?</Typography>
      <TextField
        select
        size="small"
        label="Outcome"
        value={disposition}
        onChange={(e) => setDisposition(e.target.value)}
        sx={{ maxWidth: 320 }}
      >
        <MenuItem value="">No outcome</MenuItem>
        {(dispositions.data ?? [])
          .filter((d) => d.active)
          .map((d) => (
            <MenuItem key={d.key} value={d.key}>
              {d.label}
            </MenuItem>
          ))}
      </TextField>
      <TextField
        size="small"
        label="Note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        multiline
        minRows={2}
        slotProps={{ htmlInput: { maxLength: 2000 } }}
      />
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Button
          variant="contained"
          disabled={save.isPending}
          onClick={() => save.mutate({ disposition: disposition || null, note: note || null })}
        >
          Save and next call
        </Button>
        {!touched && wrapUpSec > 0 && (
          <Typography variant="caption" color="text.secondary">
            Next call in {left} s
          </Typography>
        )}
      </Stack>
    </Stack>
  );
}

/**
 * CM — team calling on the campaign page: join the calling session (microphone first), get
 * the next customer one at a time, save the outcome, pause or leave; supervisors see who is
 * doing what.
 */
export function TeamCallingPanel({ campaign }: { campaign: Campaign }) {
  const id = campaign.id;
  const me = useSession()?.user.id;
  const canCall = usePermission('calls.trigger');
  const queryClient = useQueryClient();
  const board = useQuery({
    queryKey: sessionKey(id),
    queryFn: () => campaignsApi.session(id),
    refetchInterval: 15_000,
  });
  useWsEvent('campaign.session', (event) => {
    if (event.data.campaignId === id)
      void queryClient.invalidateQueries({ queryKey: sessionKey(id) });
  });
  const active = useLiveCallStore((s) => s.active);
  const [joined, setJoined] = useState(false);
  const [paused, setPaused] = useState(false);
  const [waiting, setWaiting] = useState<string | null>(null);
  /** Bumped on every "wait" answer: the same reason again still schedules a retry. */
  const [round, setRound] = useState(0);
  const [teamCallId, setTeamCallId] = useState<string | null>(null);
  const asking = useRef(false);
  const running = campaign.status === 'running';
  const listed =
    !campaign.team?.agentUserIds || (me ? campaign.team.agentUserIds.includes(me) : false);
  const mine = board.data?.agents.find((a) => a.userId === me);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: sessionKey(id) });

  const gone = (err: unknown) => {
    if (toApiError(err).code === 'AGENT_SESSION_GONE') {
      setJoined(false);
      enqueueSnackbar('Your calling session ended — join again to keep calling', {
        variant: 'warning',
      });
      return true;
    }
    return false;
  };
  const act = useMutation({
    mutationFn: (action: 'join' | 'leave' | 'pause' | 'ready') =>
      campaignsApi.sessionAction(id, action),
    meta: { silent: true },
    onSuccess: (data, action) => {
      queryClient.setQueryData(sessionKey(id), data);
      if (action === 'join') setJoined(true);
      if (action === 'leave') setJoined(false);
      if (action === 'pause') setPaused(true);
      if (action === 'ready' || action === 'join') setPaused(false);
    },
    onError: (err) => {
      if (!gone(err)) enqueueSnackbar(getErrorMessage(err), { variant: 'error' });
    },
  });

  // heartbeat while joined (30 s of silence = away, no calls)
  useEffect(() => {
    if (!joined) return undefined;
    const t = setInterval(() => {
      campaignsApi.sessionAction(id, 'heartbeat').catch((err: unknown) => gone(err));
    }, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [joined, id]);

  // leave on page close / unmount (best effort; the heartbeat timeout covers the rest)
  useEffect(() => {
    if (!joined) return undefined;
    return () => {
      void campaignsApi.sessionAction(id, 'leave').catch(() => undefined);
    };
  }, [joined, id]);

  // the team call ended (or its bar was closed) → the outcome form
  const liveTeamCall =
    Boolean(teamCallId) &&
    active?.callId === teamCallId &&
    active.phase !== 'ended' &&
    active.phase !== 'failed';
  const wrapping = teamCallId && !liveTeamCall ? teamCallId : null;

  // ready, free and not wrapping up → ask for the next customer
  const askNext = async () => {
    if (asking.current || isBusy()) return;
    asking.current = true;
    try {
      const next = await placeTeamCall({
        next: () => campaignsApi.nextCall(id),
        hangup: (callId) => callsApi.hangup(callId),
        recording: false,
      });
      if (!next) return;
      if (next.kind === 'wait') {
        setWaiting(WAIT_TEXT[next.reason]);
        setRound((r) => r + 1);
      } else {
        setWaiting(null);
        setTeamCallId(next.callId);
      }
    } catch (err) {
      if (!gone(err)) {
        setWaiting(getErrorMessage(err));
        setRound((r) => r + 1);
      }
    } finally {
      asking.current = false;
      refresh();
    }
  };
  const canAsk = joined && running && !paused && !teamCallId && !active;
  useEffect(() => {
    if (!canAsk) return undefined;
    const t = setTimeout(() => void askNext(), waiting ? WAIT_RETRY_MS : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAsk, waiting, round]);

  return (
    <Paper variant="outlined" sx={{ p: 2 }} component="section" aria-label="Team calling">
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="subtitle1" component="h2" sx={{ flex: 1 }}>
            Team calling
          </Typography>
          {board.data && (
            <Typography variant="body2" color="text.secondary">
              {board.data.ready} ready · {board.data.onCall} on a call
            </Typography>
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Your team talks on this campaign. Join the calling session to get the next customer, one
          at a time, in this browser (no AI minutes).
        </Typography>
        {canCall && listed && !joined && (
          <div>
            <Button
              variant="contained"
              disabled={!running || act.isPending || Boolean(active)}
              onClick={() => act.mutate('join')}
            >
              Join calling session
            </Button>
            {!running && (
              <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                Start or resume the campaign first.
              </Typography>
            )}
          </div>
        )}
        {canCall && !listed && (
          <Alert severity="info">You aren’t one of this campaign’s callers.</Alert>
        )}
        {joined && (
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="body2">You:</Typography>
              <Chip
                size="small"
                color={STATE_COLOR[mine?.state ?? 'ready']}
                label={AGENT_STATE_LABELS[mine?.state ?? 'ready']}
              />
              {liveTeamCall && active && (
                <Typography variant="body2">· Talking with {active.label}</Typography>
              )}
              <span style={{ flex: 1 }} />
              {paused ? (
                <Button size="small" onClick={() => act.mutate('ready')}>
                  I’m back
                </Button>
              ) : (
                <Button
                  size="small"
                  disabled={Boolean(teamCallId)}
                  onClick={() => act.mutate('pause')}
                >
                  Take a break
                </Button>
              )}
              <Button
                size="small"
                color="error"
                disabled={Boolean(teamCallId)}
                onClick={() => act.mutate('leave')}
              >
                Leave
              </Button>
            </Stack>
            {waiting && !teamCallId && !wrapping && !paused && (
              <Alert severity="info">{waiting}</Alert>
            )}
            {wrapping && (
              <WrapUpForm
                key={wrapping}
                campaignId={id}
                callId={wrapping}
                wrapUpSec={campaign.team?.wrapUpSec ?? 0}
                onDone={() => {
                  if (useLiveCallStore.getState().active?.callId === wrapping) clearCall();
                  setTeamCallId(null);
                  setWaiting(null);
                  refresh();
                }}
              />
            )}
          </Stack>
        )}
        {board.error ? (
          <Alert severity="error">{getErrorMessage(board.error)}</Alert>
        ) : board.data ? (
          <AgentBoard board={board.data} />
        ) : null}
      </Stack>
    </Paper>
  );
}
