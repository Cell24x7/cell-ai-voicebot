import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import { getErrorMessage } from '@/services/api/errors';
import { INBOX_SIMULATOR_KINDS, type InboxSimulatorKind } from '@/services/api/inbox';

import { useSimulateCustomer } from '../queries';

const label = (kind: string) => kind.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
/** Kinds the customer sends (the rest act on this conversation). */
const fromCustomer = (kind: InboxSimulatorKind) => kind.startsWith('inbound_');
const withText = (kind: InboxSimulatorKind) =>
  kind === 'inbound_text' || kind === 'inbound_reply' || kind === 'inbound_forwarded';

/** DEV ONLY (fake Meta): make the customer write, react, opt out… or age / expire this chat. */
export function SimulateCustomerDrawer({
  channelId,
  conversationId,
  from: defaultFrom,
  onClose,
}: {
  channelId: string;
  conversationId: string;
  from: string;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<InboxSimulatorKind>('inbound_text');
  const [from, setFrom] = useState(defaultFrom);
  const [text, setText] = useState('');
  const [days, setDays] = useState('91');
  const simulate = useSimulateCustomer();
  const run = () =>
    simulate.mutate({
      channelId,
      kind,
      options: fromCustomer(kind)
        ? { from, ...(withText(kind) && text.trim() ? { text: text.trim() } : {}) }
        : { conversationId, ...(kind === 'age_messages' ? { days: Number(days) || 91 } : {}) },
    });
  return (
    <Drawer anchor="right" open onClose={onClose}>
      <Stack
        spacing={2}
        sx={{ p: 3, width: { xs: '100vw', sm: 360 } }}
        aria-label="Simulate customer"
        component="section"
      >
        <Typography variant="h6">Simulate customer</Typography>
        <Typography variant="body2" color="text.secondary">
          Development only — sends a signed fake Meta webhook.
        </Typography>
        <TextField
          select
          label="Event"
          value={kind}
          onChange={(e) => setKind(e.target.value as InboxSimulatorKind)}
        >
          {INBOX_SIMULATOR_KINDS.map((k) => (
            <MenuItem key={k} value={k}>
              {label(k)}
            </MenuItem>
          ))}
        </TextField>
        {fromCustomer(kind) && (
          <TextField
            label="Customer number"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        )}
        {withText(kind) && (
          <TextField
            label="Text (optional)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            multiline
          />
        )}
        {kind === 'age_messages' && (
          <TextField
            label="Days back"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            type="number"
          />
        )}
        {simulate.isSuccess && (
          <Alert severity="success">Sent — the chat updates in a moment.</Alert>
        )}
        {simulate.isError && <Alert severity="error">{getErrorMessage(simulate.error)}</Alert>}
        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={run} disabled={simulate.isPending}>
            Send event
          </Button>
          <Button onClick={onClose}>Close</Button>
        </Stack>
      </Stack>
    </Drawer>
  );
}
