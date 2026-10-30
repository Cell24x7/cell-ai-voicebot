import Add from '@mui/icons-material/Add';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import { EmptyState } from '@/components/EmptyState';
import { toApiError } from '@/services/api/errors';
import type { WhatsAppChannel } from '@/services/api/types';

import {
  useCanManageWhatsApp,
  useChannels,
  useWhatsAppConfig,
  useWhatsAppLiveUpdates,
} from '../queries';

import { ChannelCard } from './ChannelCard';
import { PinDialog, RenameDialog } from './ChannelDialogs';
import { ChannelDrawer } from './ChannelDrawer';
import { ConnectWizard } from './ConnectWizard';
import { READ_ONLY_HINT } from './texts';

const REQUIREMENTS = [
  'A Meta (Facebook) business account — created during signup if you have none',
  'A phone number that can receive an SMS or voice call for verification',
  'Not used on the WhatsApp app — unless you choose "Number on the WhatsApp Business app"',
  'A display name that follows Meta’s display name rules',
];

/** The Numbers tab: connect, list, manage (live updates + polling while settling). */
export function NumbersPanel() {
  useWhatsAppLiveUpdates();
  const config = useWhatsAppConfig();
  const notSetUp =
    config.data?.enabled === false ||
    (config.isError && toApiError(config.error).code === 'WHATSAPP_NOT_CONFIGURED');
  const channels = useChannels(Boolean(config.data?.enabled));
  const canManage = useCanManageWhatsApp();
  const [wizard, setWizard] = useState<{ reconnect: WhatsAppChannel | null } | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [rename, setRename] = useState<WhatsAppChannel | null>(null);
  const [pin, setPin] = useState<WhatsAppChannel | null>(null);

  if (notSetUp) {
    return (
      <Alert severity="info">
        WhatsApp isn&apos;t set up on this server. Ask the platform team to configure the Meta app.
      </Alert>
    );
  }
  if (config.isError) {
    return (
      <Alert severity="error">Couldn&apos;t load the WhatsApp settings. Reload the page.</Alert>
    );
  }
  if (!config.data || !channels.data) return <Skeleton height={160} aria-label="Loading numbers" />;

  const { items, limit } = channels.data;
  const active = items.filter((c) => c.status !== 'disconnected').length;
  const full = active >= limit;
  const connectButton = canManage && (
    <Tooltip title={full ? `This account can connect up to ${String(limit)} numbers.` : ''}>
      <span>
        <Button
          variant="contained"
          startIcon={<Add />}
          disabled={full}
          onClick={() => setWizard({ reconnect: null })}
        >
          Connect WhatsApp
        </Button>
      </span>
    </Tooltip>
  );

  return (
    <>
      {items.length === 0 ? (
        <EmptyState
          title="No WhatsApp number connected yet"
          description="Connect your WhatsApp Business number to chat with customers, send templates and call them from this app."
          action={
            <Stack spacing={2} sx={{ alignItems: 'center' }}>
              <Box component="ul" sx={{ textAlign: 'left', m: 0, pl: 3, color: 'text.secondary' }}>
                {REQUIREMENTS.map((r) => (
                  <Typography component="li" variant="body2" key={r}>
                    {r}
                  </Typography>
                ))}
              </Box>
              {connectButton || (
                <Typography variant="body2" color="text.secondary">
                  {READ_ONLY_HINT}
                </Typography>
              )}
            </Stack>
          }
        />
      ) : (
        <Stack spacing={2}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {active} of {limit} numbers connected
              {canManage ? '' : ` · ${READ_ONLY_HINT}`}
            </Typography>
            {connectButton}
          </Stack>
          {items.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              canManage={canManage}
              onDetails={() => setDetails(channel.id)}
              onRename={() => setRename(channel)}
              onPin={() => setPin(channel)}
              onReconnect={() => setWizard({ reconnect: channel })}
            />
          ))}
        </Stack>
      )}
      {wizard && (
        <ConnectWizard
          open
          config={config.data}
          reconnect={wizard.reconnect}
          onClose={() => setWizard(null)}
        />
      )}
      {rename && <RenameDialog channel={rename} onClose={() => setRename(null)} />}
      {pin && <PinDialog channel={pin} onClose={() => setPin(null)} />}
      <ChannelDrawer channelId={details} config={config.data} onClose={() => setDetails(null)} />
    </>
  );
}
