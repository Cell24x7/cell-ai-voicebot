import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';
import BlockOutlined from '@mui/icons-material/BlockOutlined';
import CategoryOutlined from '@mui/icons-material/CategoryOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined';
import ForumOutlined from '@mui/icons-material/ForumOutlined';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import LinkOffOutlined from '@mui/icons-material/LinkOffOutlined';
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined';
import PauseCircleOutlined from '@mui/icons-material/PauseCircleOutlined';
import PhoneDisabledOutlined from '@mui/icons-material/PhoneDisabledOutlined';
import PhoneEnabledOutlined from '@mui/icons-material/PhoneEnabledOutlined';
import PhoneMissedOutlined from '@mui/icons-material/PhoneMissedOutlined';
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined';
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined';
import Alert from '@mui/material/Alert';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { RelativeTime } from '@/components/RelativeTime';
import { notificationKeys } from '@/features/wallet/keys';
import { getErrorMessage } from '@/services/api/errors';
import { notificationsApi } from '@/services/api/notifications';
import type { Notification } from '@/services/api/types';
import { useWsEvent } from '@/services/realtime';

const LATEST = 20;

/** Campaign, WhatsApp, inbox and template notifications get an icon (the text and link come from the server). */
const TYPE_ICONS: Partial<
  Record<
    Notification['type'],
    { icon: typeof CheckCircleOutlined; color: 'success' | 'warning' | 'info'; label: string }
  >
> = {
  'campaign.completed': { icon: CheckCircleOutlined, color: 'success', label: 'Campaign finished' },
  'campaign.paused': { icon: PauseCircleOutlined, color: 'warning', label: 'Campaign paused' },
  'campaign.run_skipped': { icon: EventBusyOutlined, color: 'info', label: 'Run skipped' },
  'inbox.message_received': {
    icon: ForumOutlined,
    color: 'success',
    label: 'New WhatsApp message',
  },
  'inbox.conversation_assigned': {
    icon: GroupOutlined,
    color: 'info',
    label: 'Conversation assigned to you',
  },
  'whatsapp.channel_needs_reconnect': {
    icon: LinkOffOutlined,
    color: 'warning',
    label: 'Reconnect WhatsApp',
  },
  'whatsapp.channel_restricted': {
    icon: BlockOutlined,
    color: 'warning',
    label: 'WhatsApp restricted',
  },
  'whatsapp.quality_low': {
    icon: ReportProblemOutlined,
    color: 'warning',
    label: 'WhatsApp quality low',
  },
  'whatsapp.name_approved': {
    icon: VerifiedOutlined,
    color: 'success',
    label: 'Display name approved',
  },
  'whatsapp.name_rejected': {
    icon: ReportProblemOutlined,
    color: 'warning',
    label: 'Display name rejected',
  },
  'whatsapp.channel_disconnected_by_admin': {
    icon: LinkOffOutlined,
    color: 'warning',
    label: 'WhatsApp disconnected',
  },
  'template.approved': { icon: VerifiedOutlined, color: 'success', label: 'Template approved' },
  'template.rejected': {
    icon: ReportProblemOutlined,
    color: 'warning',
    label: 'Template rejected',
  },
  'template.paused': { icon: PauseCircleOutlined, color: 'warning', label: 'Template paused' },
  'template.disabled': { icon: BlockOutlined, color: 'warning', label: 'Template disabled' },
  'template.category_changed': {
    icon: CategoryOutlined,
    color: 'info',
    label: 'Template category changed',
  },
  'template.quality_low': {
    icon: ReportProblemOutlined,
    color: 'warning',
    label: 'Template quality low',
  },
  'wallet.whatsapp_late_charge': {
    icon: AccountBalanceWalletOutlined,
    color: 'warning',
    label: 'WhatsApp charge after a release',
  },
  // Phase 12 — WhatsApp calling
  'call.whatsapp_missed': {
    icon: PhoneMissedOutlined,
    color: 'warning',
    label: 'Missed WhatsApp call',
  },
  'whatsapp.call_permission_granted': {
    icon: PhoneEnabledOutlined,
    color: 'success',
    label: 'Customer allowed calls',
  },
  'whatsapp.call_permission_declined': {
    icon: PhoneDisabledOutlined,
    color: 'info',
    label: 'Customer declined calls',
  },
  'whatsapp.call_permission_revoked': {
    icon: PhoneDisabledOutlined,
    color: 'warning',
    label: 'Call permission revoked',
  },
  'whatsapp.calling_restricted': {
    icon: ReportProblemOutlined,
    color: 'warning',
    label: 'WhatsApp paused calling',
  },
};

function TypeIcon({ type }: { type: Notification['type'] }) {
  const t = TYPE_ICONS[type];
  if (!t) return null;
  const Icon = t.icon;
  return (
    <Icon fontSize="small" color={t.color} titleAccess={t.label} sx={{ mt: 0.25, flexShrink: 0 }} />
  );
}

/** Visually hidden, still read by screen readers. */
const SR_ONLY = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

/** Header bell: unread badge, latest 20, mark read / all, live via `notification.created`. */
export function NotificationsBell() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = Boolean(anchor);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const unread = useQuery({
    queryKey: notificationKeys.unread,
    queryFn: notificationsApi.unreadCount,
    staleTime: 30_000,
  });
  const latest = useQuery({
    queryKey: notificationKeys.latest,
    queryFn: () => notificationsApi.list({ limit: LATEST }),
    enabled: open,
  });

  useWsEvent('notification.created', () => {
    queryClient.setQueryData<number>(notificationKeys.unread, (n) => (n ?? 0) + 1);
    void queryClient.invalidateQueries({ queryKey: notificationKeys.latest });
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  };
  const readOne = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSettled: refresh,
  });
  const readAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => queryClient.setQueryData<number>(notificationKeys.unread, 0),
    onError: (error) => enqueueSnackbar(getErrorMessage(error), { variant: 'error' }),
    onSettled: refresh,
  });

  const count = unread.data ?? 0;
  const label = count ? `Notifications, ${count} unread` : 'Notifications';
  const items = latest.data?.data ?? [];

  const choose = (n: Notification) => {
    setAnchor(null);
    if (!n.readAt) readOne.mutate(n.id);
    if (n.link?.startsWith('/')) void navigate(n.link);
  };

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton aria-label={label} onClick={(e) => setAnchor(e.currentTarget)} sx={{ ml: 0.5 }}>
          <Badge badgeContent={count} color="error" max={99}>
            <NotificationsNoneOutlined />
          </Badge>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { width: 360, maxWidth: 'calc(100vw - 32px)' } } }}
      >
        <Box
          sx={{
            px: 2,
            py: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="subtitle2">Notifications</Typography>
          <Button
            size="small"
            disabled={!count || readAll.isPending}
            onClick={() => readAll.mutate()}
          >
            Mark all read
          </Button>
        </Box>
        <Divider />
        {latest.isPending && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} aria-label="Loading notifications" />
          </Box>
        )}
        {latest.isError && (
          <Alert
            severity="error"
            sx={{ m: 1 }}
            action={
              <Button color="inherit" size="small" onClick={() => void latest.refetch()}>
                Retry
              </Button>
            }
          >
            {getErrorMessage(latest.error)}
          </Alert>
        )}
        {latest.isSuccess && !items.length && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 2 }}>
            You're all caught up.
          </Typography>
        )}
        {items.map((n) => (
          <MenuItem
            key={n.id}
            onClick={() => choose(n)}
            sx={{ whiteSpace: 'normal', alignItems: 'flex-start', gap: 1 }}
          >
            <Box
              aria-hidden
              sx={{
                mt: 0.75,
                width: 8,
                height: 8,
                flexShrink: 0,
                borderRadius: '50%',
                bgcolor: n.readAt ? 'transparent' : 'primary.main',
              }}
            />
            <TypeIcon type={n.type} />
            <ListItemText
              primary={
                <>
                  {n.title}
                  {!n.readAt && (
                    <Box component="span" sx={SR_ONLY}>
                      {' '}
                      (unread)
                    </Box>
                  )}
                </>
              }
              secondary={
                <>
                  {n.body}
                  <br />
                  <RelativeTime value={n.createdAt} />
                </>
              }
              slotProps={{
                primary: { sx: { fontWeight: n.readAt ? 400 : 600 } },
                secondary: { component: 'span' },
              }}
            />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
