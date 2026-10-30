import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListSubheader from '@mui/material/ListSubheader';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { lazy, Suspense } from 'react';
import { useLocation } from 'react-router';

import { APP_LOGO_URL, APP_NAME } from '@/app/brand';
import { useCan, useIsPlatformAdmin } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';

import { visibleNavItems, type NavItem } from './nav-config';
import { NavEntry } from './NavEntry';

export const DRAWER_WIDTH = 240;

const isActive = (item: NavItem, pathname: string) =>
  item.path === '/'
    ? pathname === '/'
    : pathname.startsWith(item.path.replace(/\/[^/]+$/, '') || item.path);

// the badge needs the inbox client → its own chunk (the plain item shows meanwhile)
const InboxNavEntry = lazy(async () => ({
  default: (await import('@/features/inbox/InboxNavEntry')).InboxNavEntry,
}));

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const can = useCan();
  const platformAdmin = useIsPlatformAdmin();
  const { pathname } = useLocation();
  const platformAccount = useAuthStore((st) => Boolean(st.session?.account.isPlatform));
  // the platform account has no wallet (billing lives under /admin/billing)
  const items = visibleNavItems(
    (perm) => can(perm) && !(platformAccount && perm.startsWith('wallet.')),
    platformAdmin,
  );
  const main = items.filter((i) => !i.platformOnly);
  const admin = items.filter((i) => i.platformOnly);
  const render = (item: NavItem) => {
    const props = { item, selected: isActive(item, pathname), onNavigate };
    return item.badge === 'inbox-unread' ? (
      <Suspense key={item.key} fallback={<NavEntry {...props} />}>
        <InboxNavEntry {...props} />
      </Suspense>
    ) : (
      <NavEntry key={item.key} {...props} />
    );
  };
  return (
    <nav aria-label="Main">
      <List>{main.map(render)}</List>
      {admin.length > 0 && (
        <>
          <Divider />
          <List subheader={<ListSubheader>Superadmin</ListSubheader>}>{admin.map(render)}</List>
        </>
      )}
    </nav>
  );
}

/** Permanent drawer on ≥ md, temporary (toggle) drawer on small screens. */
export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const brand = (
    <Toolbar sx={{ gap: 1.25 }}>
      <Box
        component="img"
        src={APP_LOGO_URL}
        alt=""
        sx={{ width: 32, height: 32, flexShrink: 0 }}
      />
      <Typography variant="h6" noWrap sx={{ fontWeight: 700 }}>
        {APP_NAME}
      </Typography>
    </Toolbar>
  );
  return (
    <>
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}
      >
        {brand}
        <NavList onNavigate={onClose} />
      </Drawer>
      <Drawer
        variant="permanent"
        open
        sx={{
          display: { xs: 'none', md: 'block' },
          // The paper is position: fixed — the docked root reserves its width in the flex row.
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        {brand}
        <NavList />
      </Drawer>
    </>
  );
}
