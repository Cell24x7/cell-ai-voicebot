import CallOutlined from '@mui/icons-material/CallOutlined';
import ForumOutlined from '@mui/icons-material/ForumOutlined';
import PhoneInTalkOutlined from '@mui/icons-material/PhoneInTalkOutlined';
import {
  Card,
  CardActionArea,
  CardContent,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';

import { useCanWriteWaCampaigns } from '@/features/whatsapp-campaigns/permissions';

import { campaignCreatePath } from './create-path';
import { useCanWriteCampaigns } from './permissions';

interface TypeCard {
  key: 'phone' | 'whatsapp-call' | 'whatsapp';
  title: string;
  body: string;
  icon: ReactNode;
  allowed: boolean;
}

/** "New campaign": pick one of the three campaign types first, then its wizard. */
export function NewCampaignDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const canCalls = useCanWriteCampaigns();
  const canMessages = useCanWriteWaCampaigns();
  const cards: TypeCard[] = [
    {
      key: 'phone',
      title: 'SIP / Normal call',
      body: 'Phone calls with an AI flow or agent, or one recorded voice / IVR message to everyone.',
      icon: <CallOutlined />,
      allowed: canCalls,
    },
    {
      key: 'whatsapp-call',
      title: 'WhatsApp call',
      body: 'WhatsApp calls with a published flow or an active AI agent, to people who allowed calls.',
      icon: <PhoneInTalkOutlined />,
      allowed: canCalls,
    },
    {
      key: 'whatsapp',
      title: 'WhatsApp bulk message',
      body: 'Send an approved WhatsApp template to many contacts. Only templates are sent.',
      icon: <ForumOutlined />,
      allowed: canMessages,
    },
  ];
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" aria-labelledby="new-campaign">
      <DialogTitle id="new-campaign">What kind of campaign?</DialogTitle>
      <DialogContent>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ pt: 1 }}>
          {cards.map((c) => (
            <Card key={c.key} variant="outlined" sx={{ flex: 1, opacity: c.allowed ? 1 : 0.5 }}>
              <CardActionArea
                disabled={!c.allowed}
                aria-label={c.title}
                sx={{ height: '100%', alignItems: 'flex-start' }}
                onClick={() => {
                  onClose();
                  void navigate(campaignCreatePath(c.key));
                }}
              >
                <CardContent>
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      {c.icon}
                      <Typography variant="subtitle1">{c.title}</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {c.body}
                    </Typography>
                    {!c.allowed && (
                      <Typography variant="caption" color="text.secondary">
                        Your role can’t create this kind of campaign.
                      </Typography>
                    )}
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
