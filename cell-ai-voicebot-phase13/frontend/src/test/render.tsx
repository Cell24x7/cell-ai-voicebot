import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { SnackbarProvider } from 'notistack';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';

import { routes as appRoutes } from '@/app/routes';
import { ConfirmProvider } from '@/components/ConfirmProvider';
import { RealtimeContext } from '@/services/realtime/context';
import type { RealtimeClient } from '@/services/realtime/ws-client';
import { theme } from '@/theme';

interface RenderOptions {
  /** Initial URL, e.g. "/" or "/does-not-exist". */
  route?: string;
  /** Routes to mount; defaults to the real app routes. */
  routes?: RouteObject[];
  /** Custom query client (defaults to one without retries). */
  queryClient?: QueryClient;
  /** Fake realtime client (see `fakeRealtime()` in src/test/realtime.ts). */
  realtime?: RealtimeClient;
}

/** Render the app (or given routes) with the same providers as production, minus devtools. */
export function renderWithProviders({
  route = '/',
  routes = appRoutes,
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
  realtime,
}: RenderOptions = {}): RenderResult {
  const router = createMemoryRouter(routes, { initialEntries: [route] });

  return render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider maxSnack={3}>
          <ConfirmProvider>
            {realtime ? (
              <RealtimeContext value={realtime}>
                <RouterProvider router={router} />
              </RealtimeContext>
            ) : (
              <RouterProvider router={router} />
            )}
          </ConfirmProvider>
        </SnackbarProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}
