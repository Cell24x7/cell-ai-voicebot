import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { adminSystemApi } from '@/services/api/admin-system';
import type { SystemStatus } from '@/services/api/types';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/admin-system', () => ({ adminSystemApi: { status: vi.fn() } }));
vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))), me: vi.fn() },
}));

const api = vi.mocked(adminSystemApi);
afterEach(() => vi.clearAllMocks());

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const healthy = (): SystemStatus => ({
  commit: 'abcdef1234567890abcdef1234567890abcdef12',
  builtAt: hoursAgo(2),
  env: 'production',
  uptimeSec: 3_600,
  mongo: { ok: true, primary: true, version: '8.2.1' },
  redis: { ok: true, usedMemoryMb: 12 },
  queues: {
    whatsapp: { waiting: 3, active: 1, delayed: 0, failed: 2 },
    webhooks: { waiting: 0, active: 0, delayed: 0, failed: 0 },
  },
  lastBackup: { at: hoursAgo(5), ok: true, bytes: 5_242_880 },
  lastRestoreDrill: { at: hoursAgo(48), rtoMinutes: 38 },
  lastRelease: {
    at: hoursAgo(2),
    tag: 'release-20261102-abcdef1',
    backend: 'a'.repeat(40),
    frontend: 'b'.repeat(40),
  },
  certificate: { daysLeft: 40 },
  superadminsWithoutMfa: 0,
});

const open = () => {
  signInAs('superadmin');
  renderWithProviders({ route: '/admin/system' });
};

describe('Admin → System', () => {
  it('shows the build, services, backups and queues when all is well', async () => {
    api.status.mockResolvedValue(healthy());
    open();
    expect(await screen.findByText('abcdef123456')).toBeInTheDocument();
    expect(screen.getByText('release-20261102-abcdef1', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('40 days left')).toBeInTheDocument();
    expect(screen.getByText('Every superadmin')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText(/38 min to restore/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Queues' })).toHaveTextContent('whatsapp');
  });

  it('marks what needs attention', async () => {
    api.status.mockResolvedValue({
      ...healthy(),
      commit: 'unknown',
      builtAt: 'unknown',
      mongo: { ok: true, primary: false, version: null },
      redis: { ok: false, usedMemoryMb: null },
      queues: { whatsapp: { waiting: -1, active: -1, delayed: -1, failed: -1 } },
      lastBackup: { at: hoursAgo(30), ok: false, bytes: 0 },
      lastRestoreDrill: null,
      lastRelease: null,
      certificate: null,
      superadminsWithoutMfa: 2,
    });
    open();
    expect(await screen.findByText('No primary')).toBeInTheDocument();
    expect(screen.getAllByText('unknown')).toHaveLength(2);
    expect(screen.getByText('Not reachable')).toBeInTheDocument();
    expect(screen.getByText('Failed', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(screen.getByText('Not readable')).toBeInTheDocument();
    expect(screen.getByText('2 superadmins without it')).toBeInTheDocument();
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
    expect(screen.getByText('Not checked')).toBeInTheDocument();
  });

  it('says so when the status cannot be loaded, and has no backup yet', async () => {
    api.status.mockRejectedValueOnce(new Error('down'));
    open();
    expect(await screen.findByText('The status could not be loaded.')).toBeInTheDocument();
  });

  it('a database that is not reachable and no backup recorded', async () => {
    api.status.mockResolvedValue({
      ...healthy(),
      mongo: { ok: false, primary: false, version: null },
      lastBackup: null,
    });
    open();
    expect(await screen.findByText('Not reachable')).toBeInTheDocument();
    expect(screen.getByText('None recorded', { selector: 'span' })).toBeInTheDocument();
  });
});
