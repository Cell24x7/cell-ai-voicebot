import Alert from '@mui/material/Alert';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router';

import { CopyButton } from '@/components/CopyButton';
import { usePermission } from '@/features/auth/hooks';
import { teamKeys } from '@/features/team/keys';
import { teamApi } from '@/services/api/team';
import type { Call } from '@/services/api/types';
import { formatInAccountTz } from '@/utils/datetime';

/** Meta's call events in words (ids, statuses only — never SDP). */
const TIMELINE_LABELS: Record<string, string> = {
  queued: 'Call created',
  dialed: 'Sent to WhatsApp',
  connect: 'WhatsApp connected the call',
  ringing: 'Ringing on the phone',
  accepted: 'Answered',
  rejected: 'Declined on the phone',
  terminate: 'Call ended at WhatsApp',
  connect_failed: 'WhatsApp could not connect',
  owner_lost: 'Server restarted during the call',
  // SAC-T12
  connect_uncertain: 'WhatsApp did not answer in time (not called again)',
  meta_error: 'Meta rejected a call action',
  sdp_shape: 'Call audio offer prepared',
  late_terminate: 'The late call was ended at WhatsApp',
  busy_refused: 'Every line was busy',
};

/** Call detail → WhatsApp: direction, who answered / took over, Meta's timeline. */
export function CallWhatsAppDetails({ call, timezone }: { call: Call; timezone: string }) {
  const wa = call.whatsapp;
  const canTeam = usePermission('team.read');
  const query = { status: 'active' as const, limit: 100 };
  const team = useQuery({
    queryKey: teamKeys.list(query),
    queryFn: () => teamApi.list(query),
    enabled: canTeam && Boolean(wa?.answeredBy ?? wa?.transferredTo ?? call.agentUserId),
  });
  if (!wa) return null;
  const name = (id: string | null) =>
    id ? (team.data?.data.find((m) => m.id === id)?.name ?? 'A team member') : null;
  const answered = name(wa.answeredBy ?? (call.mode === 'human' ? call.agentUserId : null));
  const transferred = name(wa.transferredTo);
  const metaError = call.error?.meta;
  const row = (label: string, value: string) => (
    <Stack direction="row" spacing={1}>
      <Typography variant="body2" color="text.secondary" sx={{ width: 140, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Stack>
  );
  return (
    <Paper variant="outlined" sx={{ p: 2 }} component="section" aria-label="WhatsApp">
      <Typography variant="subtitle1" component="h2" gutterBottom>
        WhatsApp call
      </Typography>
      <Stack spacing={0.5}>
        {metaError && (
          <Alert
            severity="error"
            action={
              metaError.fbtraceId ? (
                <CopyButton value={metaError.fbtraceId} label="Copy Meta trace id" />
              ) : undefined
            }
          >
            <strong>
              Meta error{metaError.op ? ` · ${metaError.op}` : ''}
              {metaError.metaCode
                ? ` · ${metaError.metaCode}${metaError.metaSubcode ? `/${metaError.metaSubcode}` : ''}`
                : ''}
            </strong>
            <br />
            {metaError.message}
            {metaError.fbtraceId ? (
              <>
                <br />
                fbtraceId: {metaError.fbtraceId}
              </>
            ) : null}
          </Alert>
        )}
        {row(
          'Direction',
          wa.direction === 'USER_INITIATED' ? 'The customer called' : 'Your business called',
        )}
        {row('Talked with', call.mode === 'ai' && !transferred ? 'AI' : 'Team member')}
        {answered && row('Answered by', answered)}
        {transferred && row('Taken over by', transferred)}
        {typeof call.metrics.firstAudioMs === 'number' &&
          row('First word after', `${(call.metrics.firstAudioMs / 1000).toFixed(1)} s`)}
        {wa.metaDuration !== null &&
          row('WhatsApp time', `${String(wa.metaDuration)} s (charged in 6-second steps)`)}
        {wa.conversationId && (
          <Link component={RouterLink} to={`/inbox/${wa.conversationId}`} variant="body2">
            Open the chat
          </Link>
        )}
      </Stack>
      {wa.timeline.length > 0 && (
        <List dense aria-label="WhatsApp timeline">
          {wa.timeline.map((t) => (
            <ListItem key={`${t.event}-${t.at}`} disableGutters>
              <ListItemText
                primary={TIMELINE_LABELS[t.event] ?? t.event.replace(/_/g, ' ')}
                secondary={
                  <>
                    {formatInAccountTz(t.at, timezone)}
                    {t.event === 'meta_error' && t.data && typeof t.data.metaCode === 'number'
                      ? ` · Meta ${t.data.metaCode}`
                      : ''}
                    {t.event === 'sdp_shape' && t.data ? ` · ${JSON.stringify(t.data)}` : ''}
                  </>
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </Paper>
  );
}
