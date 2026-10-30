import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import { lazy, Suspense, useState } from 'react';
import { Outlet } from 'react-router';

import { useWalletLiveUpdates } from '@/features/wallet/useWalletLiveUpdates';

import { Banners } from './Banners';
import { Header } from './Header';
import { DRAWER_WIDTH, Sidebar } from './Sidebar';

// WhatsApp call bar / incoming popup listener: loaded right after the shell (not in the start bundle)
const CallMounts = lazy(() =>
  import('@/features/whatsapp-calling/live/CallMounts').then((m) => ({ default: m.CallMounts })),
);

/** Signed-in shell: sidebar, header, banners, page content. */
export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  useWalletLiveUpdates();
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Header onMenu={() => setMobileOpen(true)} />
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <Box
        component="main"
        sx={{ flexGrow: 1, width: { md: `calc(100% - ${DRAWER_WIDTH}px)` }, p: { xs: 2, sm: 3 } }}
      >
        <Toolbar />
        <Banners />
        <Outlet />
      </Box>
      <Suspense fallback={null}>
        <CallMounts />
      </Suspense>
    </Box>
  );
}
