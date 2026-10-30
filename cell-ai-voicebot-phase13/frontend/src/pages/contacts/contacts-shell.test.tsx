import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useContactsLiveUpdates } from '@/features/contacts/useContactsLiveUpdates';
import { RealtimeContext } from '@/services/realtime/context';
import type { RealtimeClient } from '@/services/realtime/ws-client';
import { fakeSession, signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))) },
}));
vi.mock('@/services/api/system', () => ({
  getSystemInfo: vi.fn(() => new Promise(() => undefined)),
}));
vi.mock('@/services/api/contacts', () => ({
  contactsApi: {
    list: vi.fn(() => new Promise(() => undefined)),
    tags: vi.fn(() => new Promise(() => undefined)),
  },
}));
vi.mock('@/services/api/custom-fields', () => ({
  customFieldsApi: { list: vi.fn(() => new Promise(() => undefined)) },
}));
vi.mock('@/services/api/contact-lists', () => ({
  contactListsApi: { list: vi.fn(() => new Promise(() => undefined)) },
}));
vi.mock('@/services/api/segments', () => ({
  segmentsApi: { list: vi.fn(() => new Promise(() => undefined)) },
}));

afterEach(() => vi.clearAllMocks());

describe('contacts shell', () => {
  it('redirects /contacts and unknown tabs to the contacts tab', async () => {
    signInAs('agent');
    renderWithProviders({ route: '/contacts' });
    expect(
      await screen.findByRole('tab', { name: 'Contacts', selected: true }),
    ).toBeInTheDocument();
    renderWithProviders({ route: '/contacts/nope' });
    expect(
      (await screen.findAllByRole('tab', { name: 'Contacts', selected: true })).length,
    ).toBeGreaterThan(0);
  });

  it('switches tabs through the URL', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/contacts/all' });
    await userEvent.click(await screen.findByRole('tab', { name: 'Do-not-call' }));
    expect(screen.getByRole('tab', { name: 'Do-not-call', selected: true })).toBeInTheDocument();
    for (const name of ['Lists', 'Segments', 'Fields']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
  });

  it('shows Import only with contacts.import; needs contacts.read', async () => {
    signInAs('manager');
    renderWithProviders({ route: '/contacts/all' });
    expect(await screen.findByRole('link', { name: 'Import contacts' })).toHaveAttribute(
      'href',
      '/contacts/import',
    );
    expect(screen.getByRole('link', { name: 'Imports & exports' })).toBeInTheDocument();

    signInAs('viewer');
    renderWithProviders({ route: '/contacts/all' });
    expect(screen.getAllByRole('link', { name: 'Imports & exports' }).length).toBeGreaterThan(0);

    signInAs('owner', {
      permissions: fakeSession('owner').permissions.filter((p) => p !== 'contacts.read'),
    });
    renderWithProviders({ route: '/contacts/all' });
    expect(
      (await screen.findAllByRole('heading', { level: 1, name: '403' })).length,
    ).toBeGreaterThan(0);
  });
});

describe('useContactsLiveUpdates', () => {
  const setup = () => {
    const handlers = new Map<string, (e: unknown) => void>();
    const client = {
      on: (type: string, handler: (e: unknown) => void) => {
        handlers.set(type, handler);
        return () => handlers.delete(type);
      },
    } as unknown as RealtimeClient;
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    function Probe() {
      useContactsLiveUpdates();
      return null;
    }
    const wrap = (children: ReactNode) => (
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider>
          <RealtimeContext value={client}>{children}</RealtimeContext>
        </SnackbarProvider>
      </QueryClientProvider>
    );
    render(wrap(<Probe />));
    const emit = (type: string, data: unknown) =>
      act(() => handlers.get(type)?.({ id: 'e', type, ts: 'x', data }));
    return { emit, invalidate };
  };

  it('refetches contact data on contacts.changed and reports bulk results', async () => {
    const { emit, invalidate } = setup();
    emit('contacts.changed', { reason: 'import' });
    expect(invalidate.mock.calls.map((c) => (c[0] as { queryKey: string[] }).queryKey[0])).toEqual([
      'contacts',
      'contact-lists',
      'segments',
      'dnd',
      'custom-fields',
    ]);
    emit('contacts.bulk_completed', { action: 'add_tags', count: 12 });
    expect(await screen.findByText('Tags added: 12 contacts')).toBeInTheDocument();
    emit('contacts.bulk_completed', { action: 'mystery', count: 1 });
    expect(await screen.findByText('Done: 1 contacts')).toBeInTheDocument();
  });
});
