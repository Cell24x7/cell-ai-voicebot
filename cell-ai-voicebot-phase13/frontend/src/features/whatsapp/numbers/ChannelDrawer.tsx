import Close from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { enqueueSnackbar } from 'notistack';
import { useState, type ReactNode } from 'react';

import { CopyButton } from '@/components/CopyButton';
import { RelativeTime } from '@/components/RelativeTime';
import { CallingSection } from '@/features/whatsapp-calling/settings/CallingSection';
import { toApiError } from '@/services/api/errors';
import type { WhatsAppConfig } from '@/services/api/types';
import { SIMULATOR_KINDS } from '@/services/api/whatsapp';

import { CHANNEL_STATUS_LABELS, whatsappErrorMessage } from '../labels';
import { useChannel, useSimulateEvent } from '../queries';

import { BusinessProfileSection } from './BusinessProfileSection';
import { KIND_LABELS, showSimulator } from './texts';

function Row({ label, value, copy }: { label: string; value: ReactNode; copy?: string | null }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minHeight: 36 }}>
      <Typography variant="body2" color="text.secondary" sx={{ width: 170, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ wordBreak: 'break-all' }}>
        {value ?? '—'}
      </Typography>
      {copy && <CopyButton value={copy} label={`Copy ${label}`} />}
    </Stack>
  );
}

function SimulatorMenu({ channelId }: { channelId: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const simulate = useSimulateEvent();
  return (
    <>
      <Button size="small" variant="outlined" onClick={(e) => setAnchor(e.currentTarget)}>
        Send test event
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {SIMULATOR_KINDS.map((kind) => (
          <MenuItem
            key={kind}
            onClick={() => {
              setAnchor(null);
              simulate.mutate(
                { id: channelId, kind },
                {
                  onSuccess: () =>
                    enqueueSnackbar(`Test event sent: ${KIND_LABELS[kind]}`, { variant: 'info' }),
                  onError: (err) =>
                    enqueueSnackbar(whatsappErrorMessage(toApiError(err)), { variant: 'error' }),
                },
              );
            }}
          >
            {KIND_LABELS[kind]}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/** "Number details": ids, Meta statuses, token check, webhook health, history. */
export function ChannelDrawer({
  channelId,
  config,
  onClose,
}: {
  channelId: string | null;
  config: WhatsAppConfig | undefined;
  onClose: () => void;
}) {
  const detail = useChannel(channelId);
  const c = detail.data;
  return (
    <Drawer
      anchor="right"
      open={Boolean(channelId)}
      onClose={onClose}
      slotProps={{
        paper: {
          role: 'dialog',
          'aria-label': 'Number details',
          sx: { width: { xs: '100%', sm: 480 } },
        },
      }}
    >
      <Box sx={{ p: 2 }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" component="h2">
            Number details
          </Typography>
          <IconButton aria-label="Close details" onClick={onClose}>
            <Close />
          </IconButton>
        </Stack>
        {!c && <Skeleton height={200} />}
        {c && (
          <Stack spacing={1} sx={{ mt: 1 }}>
            <Typography variant="subtitle1">{c.label}</Typography>
            <Row label="Status" value={CHANNEL_STATUS_LABELS[c.status]} />
            <Row label="WhatsApp account id" value={c.wabaId} copy={c.wabaId} />
            <Row label="Phone number id" value={c.phoneNumberId} copy={c.phoneNumberId} />
            <Row label="Business id" value={c.businessId} copy={c.businessId} />
            <Row label="Business verification" value={c.businessVerificationStatus} />
            <Row label="Account review" value={c.wabaReviewStatus} />
            <Row label="Currency" value={c.wabaCurrency} />
            <Row label="Throughput" value={c.throughputLevel} />
            <Row label="Token checked" value={<RelativeTime value={c.tokenCheckedAt} />} />
            {(c.status === 'connected' || c.status === 'restricted') && (
              <>
                <Divider />
                <BusinessProfileSection channelId={c.id} />
              </>
            )}
            {c.status !== 'disconnected' && (
              <>
                <Divider />
                <CallingSection channelId={c.id} />
              </>
            )}
            <Divider />
            <Typography variant="subtitle2">Webhook health</Typography>
            <Row label="Last event" value={<RelativeTime value={c.webhook.lastEventAt} />} />
            <Row label="Last field" value={c.webhook.lastField} />
            <Row
              label="Events (24 h)"
              value={
                <>
                  {c.events24h.total}
                  {Object.entries(c.events24h.byField).map(([field, n]) => (
                    <Typography
                      key={field}
                      variant="caption"
                      component="div"
                      color="text.secondary"
                    >
                      {field}: {n}
                    </Typography>
                  ))}
                </>
              }
            />
            {showSimulator(config) && (
              <Box>
                <SimulatorMenu channelId={c.id} />
              </Box>
            )}
            <Divider />
            <Typography variant="subtitle2">History</Typography>
            <List dense aria-label="History">
              {c.history.map((h) => (
                <ListItem key={`${h.at}-${h.status}`} disableGutters>
                  <ListItemText
                    primary={`${CHANNEL_STATUS_LABELS[h.status]}${h.reason ? ` — ${h.reason}` : ''}`}
                    secondary={<RelativeTime value={h.at} />}
                  />
                </ListItem>
              ))}
            </List>
          </Stack>
        )}
      </Box>
    </Drawer>
  );
}
