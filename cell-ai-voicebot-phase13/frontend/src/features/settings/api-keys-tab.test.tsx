import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiKeysModule from '@/services/api/api-keys';
import { apiKeysApi } from '@/services/api/api-keys';
import { ApiError } from '@/services/api/errors';
import { signInAs } from '@/test/auth';
import { fakeApiKey, fakeRequestLog } from '@/test/integrations';
import { renderWithProviders } from '@/test/render';

import { ApiKeysTab } from './ApiKeysTab';

vi.mock('@/services/api/api-keys', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiKeysModule>()),
  apiKeysApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    revoke: vi.fn(),
    requests: vi.fn(),
    whoami: vi.fn(),
  },
}));

const api = vi.mocked(apiKeysApi);
const httpError = (status: number, message: string) =>
  new ApiError({ status, code: 'AUTH_INVALID_TOKEN', message, kind: 'http' });
const show = () => renderWithProviders({ routes: [{ path: '/', element: <ApiKeysTab /> }] });
const row = (text: string) => screen.getByRole('row', { name: new RegExp(`^${text}`) });

beforeEach(() => {
  vi.clearAllMocks();
  signInAs('owner');
  api.list.mockResolvedValue([
    fakeApiKey({ requests24h: 12, requests7d: 340, ipAllowlist: ['203.0.113.0/24', '10.0.0.1'] }),
    fakeApiKey({
      id: 'k2',
      name: 'Old key',
      prefix: 'cav_live_zz99',
      expiresAt: '2026-01-01T00:00:00.000Z',
    }),
    fakeApiKey({
      id: 'k3',
      name: 'Gone key',
      revokedAt: '2026-10-01T00:00:00.000Z',
    }),
  ]);
});

describe('API keys tab (Phase 15)', () => {
  it('shows usage, IP limits, expiry and status; docs link', async () => {
    show();
    await screen.findByText('Old key');
    expect(within(row('CRM sync')).getByText('12 / 340')).toBeInTheDocument();
    expect(within(row('CRM sync')).getByText(/2 allowed · no expiry/)).toBeInTheDocument();
    expect(within(row('CRM sync')).getByText('Active')).toBeInTheDocument();
    expect(within(row('Old key')).getByText(/Any IP · /)).toBeInTheDocument();
    expect(within(row('Old key')).getByText('Expired')).toBeInTheDocument();
    expect(within(row('Gone key')).getByText('Revoked')).toBeInTheDocument();
    expect(within(row('Gone key')).queryByRole('button', { name: 'Change' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Try it in the API docs' })).toHaveAttribute(
      'href',
      '/api/docs',
    );
  });

  it('creates a key with an IP allowlist and expiry; checks the inputs', async () => {
    api.create.mockResolvedValue({ apiKey: fakeApiKey({ id: 'k9' }), key: 'cav_live_full_secret' });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Create API key' }));
    const dialog = screen.getByRole('dialog', { name: 'Create API key' });
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Zapier');
    expect(within(dialog).getByText('Choose at least one scope')).toBeInTheDocument();
    expect(within(dialog).getByText('Calls')).toBeInTheDocument();
    expect(within(dialog).getByText('Webhooks')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^contacts:write/ }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^webhooks:manage/ }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^webhooks:manage/ }));
    await userEvent.type(within(dialog).getByLabelText('Allowed IPs (optional)'), '1.2.3.999');
    expect(within(dialog).getByText('Not an IP or range: 1.2.3.999')).toBeInTheDocument();
    await userEvent.clear(within(dialog).getByLabelText('Allowed IPs (optional)'));
    await userEvent.type(
      within(dialog).getByLabelText('Allowed IPs (optional)'),
      '203.0.113.0/24{Enter}2001:db8::/32',
    );
    fireEvent.change(within(dialog).getByLabelText('Expires (optional)'), {
      target: { value: '2000-01-01' },
    });
    expect(within(dialog).getByText('Choose a date in the future')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Expires (optional)'), {
      target: { value: '2099-12-31' },
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create key' }));
    expect(await screen.findByLabelText('New API key')).toHaveValue('cav_live_full_secret');
    expect(api.create).toHaveBeenCalledWith({
      name: 'Zapier',
      scopes: ['contacts:write'],
      ipAllowlist: ['203.0.113.0/24', '2001:db8::/32'],
      expiresAt: new Date('2099-12-31T23:59:59').toISOString(),
    });
  });

  it('changes a key (scopes, allowlist, expiry) and shows errors', async () => {
    api.update.mockRejectedValueOnce(httpError(400, 'Not allowed')).mockResolvedValue(fakeApiKey());
    show();
    await userEvent.click(
      within(await screen.findByRole('row', { name: /^CRM sync/ })).getByRole('button', {
        name: 'Change',
      }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Change API key' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('CRM sync');
    expect(within(dialog).getByLabelText('Allowed IPs (optional)')).toHaveValue(
      '203.0.113.0/24\n10.0.0.1',
    );
    expect(within(dialog).getByRole('checkbox', { name: /^calls:read/ })).toBeChecked();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^calls:write/ }));
    await userEvent.clear(within(dialog).getByLabelText('Allowed IPs (optional)'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Not allowed')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/API key saved/)).toBeInTheDocument();
    expect(api.update).toHaveBeenLastCalledWith('k1', {
      name: 'CRM sync',
      scopes: ['calls:read', 'calls:write'],
      ipAllowlist: [],
      expiresAt: null,
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // an existing expiry shows as the date; cancel keeps the key
    await userEvent.click(within(row('Old key')).getByRole('button', { name: 'Change' }));
    expect(screen.getByLabelText('Expires (optional)')).toHaveValue('2026-01-01');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('request log: routes and status, older pages, empty state', async () => {
    api.requests
      .mockResolvedValueOnce({
        items: [
          fakeRequestLog(),
          fakeRequestLog({
            id: 'q2',
            method: 'POST',
            route: '/api/v1/messages/template',
            status: 429,
            ms: 3,
          }),
        ],
        nextCursor: 'c2',
      })
      .mockResolvedValueOnce({
        items: [fakeRequestLog({ id: 'q3', status: 401 })],
        nextCursor: null,
      })
      .mockResolvedValue({ items: [], nextCursor: null });
    show();
    await userEvent.click(
      within(await screen.findByRole('row', { name: /^CRM sync/ })).getByRole('button', {
        name: 'Requests',
      }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Requests — CRM sync' });
    expect(await within(dialog).findByText('GET /api/v1/calls/:id')).toBeInTheDocument();
    expect(within(dialog).getByText('POST /api/v1/messages/template')).toBeInTheDocument();
    expect(within(dialog).getByText('429')).toBeInTheDocument();
    expect(within(dialog).getByText('3 ms')).toBeInTheDocument();
    expect(api.requests).toHaveBeenCalledWith('k1', undefined);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Show older' }));
    expect(await within(dialog).findByText('401')).toBeInTheDocument();
    expect(api.requests).toHaveBeenLastCalledWith('k1', 'c2');
    expect(within(dialog).queryByRole('button', { name: 'Show older' })).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await userEvent.click(within(row('Old key')).getByRole('button', { name: 'Requests' }));
    expect(await screen.findByText('No requests in the last 7 days')).toBeInTheDocument();
  });

  it('test a key: works, fails, never kept', async () => {
    api.whoami
      .mockResolvedValueOnce({
        accountId: 'a1',
        apiKeyId: 'k1',
        scopes: ['calls:read', 'contacts:write'],
      })
      .mockRejectedValueOnce(httpError(401, 'The API key is not valid'));
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Test a key' }));
    const dialog = screen.getByRole('dialog', { name: 'Test a key' });
    const check = within(dialog).getByRole('button', { name: 'Check key' });
    expect(check).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('API key'), ' cav_live_secret ');
    expect(within(dialog).getByLabelText('API key')).toHaveAttribute('type', 'password');
    await userEvent.click(check);
    expect(api.whoami).toHaveBeenCalledWith('cav_live_secret');
    expect(
      await within(dialog).findByText('The key works. Scopes: calls:read, contacts:write'),
    ).toBeInTheDocument();
    // typing again clears the old answer
    await userEvent.type(within(dialog).getByLabelText('API key'), 'x');
    expect(within(dialog).queryByText(/The key works/)).toBeNull();
    await userEvent.click(check);
    expect(await within(dialog).findByText('The API key is not valid')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('impersonating staff and read-only roles can look but not change', async () => {
    signInAs('owner', { impersonation: { by: 'x' } as never });
    const first = show();
    await screen.findByText('Old key');
    expect(screen.queryByRole('button', { name: 'Create API key' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Requests' })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Test a key' })).toBeInTheDocument();
    first.unmount();

    signInAs('viewer');
    show();
    await screen.findByText('Old key');
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
  });
});
