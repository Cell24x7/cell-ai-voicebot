import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/render';

import { ticketFromUrl } from './ticket-url';

describe('/dev/realtime (DEV only)', () => {
  it('is routed in development builds', async () => {
    expect(import.meta.env.DEV).toBe(true);
    renderWithProviders({ route: '/dev/realtime' });
    expect(await screen.findByRole('heading', { name: 'Realtime (dev)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
    expect(screen.getByText('status: idle')).toBeInTheDocument();
  });

  it('reads the ticket from a pasted URL', () => {
    expect(ticketFromUrl(' ws://localhost:3100/ws/events?ticket=wst_abc ')).toBe('wst_abc');
    expect(ticketFromUrl('ws://localhost:3100/ws/events')).toBeNull();
    expect(ticketFromUrl('not a url')).toBeNull();
  });
});
