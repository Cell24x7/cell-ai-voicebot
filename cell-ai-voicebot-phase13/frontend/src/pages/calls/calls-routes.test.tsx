import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

describe('/calls routes', () => {
  it('list + lazy detail for calls.read, lazy tester for calls.trigger; others get 403', async () => {
    signInAs('viewer');
    const list = renderWithProviders({ route: '/calls' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Calls' })).toBeInTheDocument();
    list.unmount();
    const denied = renderWithProviders({ route: '/calls/test' }); // viewers can't start calls
    expect(await screen.findByText(/permission/i)).toBeInTheDocument();
    denied.unmount();
    signInAs('agent');
    const tester = renderWithProviders({ route: '/calls/test' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Test call' })).toBeInTheDocument();
    tester.unmount();
    const detail = renderWithProviders({ route: '/calls/c1' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Call' })).toBeInTheDocument();
    detail.unmount();
    signInAs('viewer', { permissions: ['account.read'] });
    renderWithProviders({ route: '/calls' });
    expect(await screen.findByText(/permission/i)).toBeInTheDocument();
  });
});
