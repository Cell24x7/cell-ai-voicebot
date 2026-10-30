import MenuIcon from '@mui/icons-material/Menu';
import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router';

import { useConfirm } from '@/components/confirm-context';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useSession } from '@/features/auth/hooks';
import { signOut } from '@/features/auth/session';
import { useAuthStore } from '@/features/auth/store';
import { LEGAL_LINKS } from '@/features/legal/links';
import { NotificationsBell } from '@/features/notifications/NotificationsBell';
import { authApi } from '@/services/api/auth';
import { getErrorMessage } from '@/services/api/errors';
import { useWsStatus } from '@/services/realtime';

import { DRAWER_WIDTH } from './Sidebar';

const WS_LABEL: Record<string, { text: string; color: string }> = {
  open: { text: 'Live updates connected', color: 'success.main' },
  connecting: { text: 'Connecting…', color: 'warning.main' },
  reconnecting: { text: 'Reconnecting…', color: 'warning.main' },
  idle: { text: 'Live updates off', color: 'text.disabled' },
  closed: { text: 'Live updates off', color: 'text.disabled' },
};

// WhatsApp call availability (calls.answer): loaded after the shell
const AvailabilityToggle = lazy(() =>
  import('@/features/whatsapp-calling/live/AvailabilityToggle').then((m) => ({
    default: m.AvailabilityToggle,
  })),
);

export function Header({ onMenu }: { onMenu: () => void }) {
  const session = useSession();
  const ws = WS_LABEL[useWsStatus()] ?? { text: 'Live updates off', color: 'text.disabled' };
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const go = (path: string) => {
    setAnchor(null);
    void navigate(path);
  };

  const logout = async () => {
    setAnchor(null);
    await signOut(queryClient);
    void navigate('/login');
  };
  const logoutAll = async () => {
    setAnchor(null);
    const ok = await confirm({
      title: 'Sign out everywhere?',
      message: 'All your sessions on every device will end, including this one.',
      confirmText: 'Sign out everywhere',
      destructive: true,
    });
    if (!ok) return;
    try {
      await authApi.logoutAll();
      useAuthStore.getState().setAnonymous();
      queryClient.clear();
      void navigate('/login');
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    }
  };

  return (
    <AppBar
      position="fixed"
      color="inherit"
      elevation={0}
      sx={{
        borderBottom: 1,
        borderColor: 'divider',
        width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
        ml: { md: `${DRAWER_WIDTH}px` },
      }}
    >
      <Toolbar>
        <IconButton
          edge="start"
          aria-label="Open menu"
          onClick={onMenu}
          sx={{ mr: 1, display: { md: 'none' } }}
        >
          <MenuIcon />
        </IconButton>
        <Typography variant="subtitle1" noWrap sx={{ flexGrow: 1, fontWeight: 600 }}>
          {session?.account.name}
        </Typography>
        <Tooltip title={ws.text}>
          <Box
            role="status"
            aria-label={ws.text}
            sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: ws.color, mx: 1.5 }}
          />
        </Tooltip>
        <Suspense fallback={null}>
          <AvailabilityToggle />
        </Suspense>
        <ThemeToggle />
        <NotificationsBell />
        <IconButton
          aria-label="Account menu"
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{ ml: 1 }}
        >
          <Avatar sx={{ width: 32, height: 32 }}>
            {session?.user.name.slice(0, 1).toUpperCase()}
          </Avatar>
        </IconButton>
        <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
          <Box sx={{ px: 2, py: 1 }}>
            <ListItemText
              primary={session?.user.name}
              secondary={`${session?.user.email ?? ''} · ${session?.role.name ?? ''}`}
            />
          </Box>
          <Divider />
          <MenuItem onClick={() => go('/settings/profile')}>Profile</MenuItem>
          <MenuItem onClick={() => go('/settings/security')}>Security & sessions</MenuItem>
          <Divider />
          {LEGAL_LINKS.slice(0, 3).map((l) => (
            <MenuItem key={l.to} dense onClick={() => go(l.to)}>
              {l.label}
            </MenuItem>
          ))}
          <Divider />
          <MenuItem onClick={() => void logout()}>Sign out</MenuItem>
          {!session?.impersonation && (
            <MenuItem onClick={() => void logoutAll()}>Sign out everywhere</MenuItem>
          )}
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
