import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { enqueueSnackbar, SnackbarProvider } from 'notistack';
import { useState, type ReactNode } from 'react';

import { ConfirmProvider } from '@/components/ConfirmProvider';
import { getWsTicket } from '@/features/auth/session';
import { useAuthStore } from '@/features/auth/store';
import { RealtimeProvider } from '@/services/realtime';
import { theme } from '@/theme';

import { createQueryClient } from './query-client';

interface ProvidersProps {
  children: ReactNode;
}

const notify = (message: string, variant: 'error') => {
  enqueueSnackbar(message, { variant });
};

/**
 * Realtime only while signed in; a new user / account (login, impersonation)
 * gets a fresh connection (key).
 */
function AuthRealtime({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const identity = useAuthStore((s) =>
    s.session ? `${s.session.account.id}:${s.session.user.id}` : 'none',
  );
  return (
    <RealtimeProvider key={identity} getTicket={status === 'authenticated' ? getWsTicket : null}>
      {children}
    </RealtimeProvider>
  );
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(() => createQueryClient({ notify }));

  return (
    <ThemeProvider theme={theme} defaultMode="light">
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider maxSnack={3} autoHideDuration={4000} preventDuplicate>
          <ConfirmProvider>
            <AuthRealtime>{children}</AuthRealtime>
          </ConfirmProvider>
        </SnackbarProvider>
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
