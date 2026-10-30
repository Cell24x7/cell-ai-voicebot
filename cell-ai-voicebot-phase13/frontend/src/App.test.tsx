import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type * as SessionModule from '@/features/auth/session';
import { signInAs } from '@/test/auth';

import { App } from './App';

vi.mock('@/services/api/system', () => ({
  getSystemInfo: vi.fn(() =>
    Promise.resolve({
      name: 'cell-ai-voicebot-backend',
      version: '0.0.1',
      node: 'v24',
      env: 'test',
    }),
  ),
}));
vi.mock('@/features/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof SessionModule>()),
  getWsTicket: vi.fn(() => new Promise(() => undefined)),
}));

describe('App', () => {
  it('shows the sign-in page when signed out', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  });

  it('renders the dashboard with all providers when signed in', async () => {
    signInAs('owner');
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(await screen.findByText('cell-ai-voicebot-backend')).toBeInTheDocument();
  });
});
