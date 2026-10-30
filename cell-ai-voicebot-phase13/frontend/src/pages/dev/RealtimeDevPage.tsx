import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';

import { RealtimeClient, type RealtimeStatus, type WsEventEnvelope } from '@/services/realtime';

import { ticketFromUrl } from './ticket-url';

const MAX_LOG = 50;

/**
 * DEV ONLY (`/dev/realtime`, not in production builds): connect to /ws/events
 * with a ticket URL and watch live events. Tickets are single use — paste a
 * new one to reconnect.
 */
export function RealtimeDevPage() {
  const [url, setUrl] = useState('');
  const [topic, setTopic] = useState('');
  const [status, setStatus] = useState<RealtimeStatus>('idle');
  const [lastError, setLastError] = useState<string | undefined>();
  const [events, setEvents] = useState<WsEventEnvelope[]>([]);
  const clientRef = useRef<RealtimeClient | null>(null);

  useEffect(() => () => clientRef.current?.disconnect(), []);

  const connect = () => {
    clientRef.current?.disconnect();
    const ticket = ticketFromUrl(url);
    const pasted = url.trim();
    const client = new RealtimeClient({
      getTicket: () =>
        ticket ? Promise.resolve(ticket) : Promise.reject(new Error('No ticket in URL')),
      url: (t) => {
        const target = new URL(pasted);
        target.searchParams.set('ticket', t);
        return target.toString();
      },
    });
    client.onStatus(() => {
      setStatus(client.getStatus());
      setLastError(client.getLastError());
    });
    client.onAny((event) => setEvents((prev) => [event, ...prev].slice(0, MAX_LOG)));
    clientRef.current = client;
    client.connect();
  };

  const disconnect = () => {
    clientRef.current?.disconnect();
  };

  const subscribe = () => {
    if (topic.trim()) clientRef.current?.subscribe(topic.trim());
  };

  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Typography variant="h5" component="h1" gutterBottom>
        Realtime (dev)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Backend: <code>npm run ws:dev-ticket</code> → paste the URL (use port 3100 to go through the
        Vite proxy).
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <TextField
          label="Ticket URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          fullWidth
          size="small"
        />
        <Button variant="contained" onClick={connect} disabled={!ticketFromUrl(url)}>
          Connect
        </Button>
        <Button onClick={disconnect}>Disconnect</Button>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: 'center' }}>
        <Chip label={`status: ${status}`} color={status === 'open' ? 'success' : 'default'} />
        {lastError && <Chip label={`error: ${lastError}`} color="error" />}
        <TextField
          label="Topic (call:<id> / campaign:<id>)"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          size="small"
        />
        <Button onClick={subscribe} disabled={status !== 'open'}>
          Subscribe
        </Button>
      </Stack>
      <Paper variant="outlined" sx={{ p: 2, fontFamily: 'monospace', fontSize: 13 }}>
        {events.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No events yet.
          </Typography>
        ) : (
          events.map((event) => (
            <div key={event.id} data-testid="ws-event">
              {event.ts} {event.type} {JSON.stringify(event.data)}
            </div>
          ))
        )}
      </Paper>
    </Container>
  );
}
