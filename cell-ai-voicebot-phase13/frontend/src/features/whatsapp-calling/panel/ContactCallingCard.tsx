import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import { useChannels } from '@/features/whatsapp/queries';
import type { Contact } from '@/services/api/types';

import { CallButton } from '../live/CallButton';
import { useCanCall } from '../permissions';

import { CallingPanelSection } from './CallingPanelSection';

/**
 * Contact page (Phase 18B): ask for WhatsApp call permission and call from Contacts,
 * not only from a chat. A contact without a chat counts as outside the 24-hour window,
 * so a request uses the approved permission template.
 */
export function ContactCallingCard({
  contact,
}: {
  contact: Pick<Contact, 'id' | 'phoneE164' | 'name'>;
}) {
  const channels = useChannels();
  const canCall = useCanCall();
  const enabled = (channels.data?.items ?? []).filter(
    (c) => c.status === 'connected' && c.calling.status === 'enabled',
  );
  const [picked, setPicked] = useState('');
  const channel = enabled.find((c) => c.id === picked) ?? enabled[0];
  if (!channel) return null;
  return (
    <Card variant="outlined" component="section" aria-label="WhatsApp calling">
      <CardContent>
        <Stack spacing={1.5}>
          <Typography variant="subtitle1" component="h2">
            WhatsApp calling
          </Typography>
          {enabled.length > 1 && (
            <TextField
              select
              size="small"
              label="From number"
              value={channel.id}
              onChange={(e) => setPicked(e.target.value)}
              sx={{ maxWidth: 320 }}
            >
              {enabled.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.label}
                </MenuItem>
              ))}
            </TextField>
          )}
          <CallingPanelSection
            key={channel.id}
            channelId={channel.id}
            contactId={contact.id}
            windowExpiresAt={null}
            initial={null}
            actions={
              canCall ? (
                <CallButton
                  channelId={channel.id}
                  contactId={contact.id}
                  phoneE164={contact.phoneE164}
                  label={contact.name ?? contact.phoneE164}
                  conversationId={null}
                  windowExpiresAt={null}
                />
              ) : undefined
            }
          />
        </Stack>
      </CardContent>
    </Card>
  );
}
