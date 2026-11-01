import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/services/api/errors';
import type * as WebhooksModule from '@/services/api/webhooks';
import { webhooksApi } from '@/services/api/webhooks';
import { signInAs } from '@/test/auth';
import { pick } from '@/test/inspector';
import { fakeDelivery, fakeEndpoint } from '@/test/integrations';
import { renderWithProviders } from '@/test/render';

import { WebhooksTab } from './WebhooksTab';

vi.mock('@/services/api/webhooks', async (importOriginal) => ({
  ...(await importOriginal<typeof WebhooksModule>()),
  webhooksApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    test: vi.fn(),
    rotateSecret: vi.fn(),
    enable: vi.fn(),
    deliveries: vi.fn(),
    replay: vi.fn(),
    devReceiver: vi.fn(),
  },
}));

const api = vi.mocked(webhooksApi);
const httpError = (message: string) =>
  new ApiError({ status: 409, code: 'CONFLICT_INVALID_STATE', message, kind: 'http' });
const show = () => renderWithProviders({ routes: [{ path: '/', element: <WebhooksTab /> }] });
const row = (text: string) => screen.getByRole('row', { name: new RegExp(text) });

beforeEach(() => {
  vi.clearAllMocks();
  signInAs('owner');
  api.list.mockResolvedValue([fakeEndpoint()]);
  api.deliveries.mockResolvedValue({ items: [], nextCursor: null });
  api.devReceiver.mockRejectedValue(new Error('404 — mocks off'));
});

describe('Webhooks tab', () => {
  it('lists endpoints with state and last delivery; empty and error states', async () => {
    api.list.mockResolvedValueOnce([
      fakeEndpoint(),
      fakeEndpoint({
        id: 'we2',
        description: '',
        url: 'https://b.test/h',
        events: ['call.completed', 'contact.opted_out'],
        active: false,
        disabledReason: 'manual',
        lastDeliveryAt: null,
      }),
      fakeEndpoint({
        id: 'we3',
        description: 'Old',
        active: false,
        disabledReason: 'failing',
        lastDeliveryStatus: 'failed',
      }),
    ]);
    const first = show();
    expect(await screen.findByText('https://b.test/h')).toBeInTheDocument();
    expect(within(row('CRM')).getByText('All events')).toBeInTheDocument();
    expect(within(row('CRM')).getByText('Active')).toBeInTheDocument();
    expect(within(row('CRM')).getByText(/Delivered/)).toBeInTheDocument();
    expect(within(row('b.test')).getByText('2 events')).toBeInTheDocument();
    expect(within(row('b.test')).getByText('Paused')).toBeInTheDocument();
    expect(within(row('Old')).getByText('Turned off (failing)')).toBeInTheDocument();
    expect(within(row('Old')).getByText(/Failed/)).toBeInTheDocument();
    expect(
      screen.getByText(/Old was turned off because deliveries kept failing/),
    ).toBeInTheDocument();
    first.unmount();

    api.list.mockResolvedValueOnce([]);
    const empty = show();
    expect(await screen.findByText('No webhooks yet')).toBeInTheDocument();
    empty.unmount();

    api.list.mockRejectedValueOnce(new Error('offline'));
    show();
    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('adds a webhook, shows the secret once and validates the form', async () => {
    api.create.mockResolvedValue({ endpoint: fakeEndpoint(), secret: 'whsec_abc123' });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Add webhook' }));
    const dialog = screen.getByRole('dialog', { name: 'Add webhook' });
    const save = within(dialog).getByRole('button', { name: 'Add webhook' });
    expect(save).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('URL'), 'nope');
    expect(within(dialog).getByText(/starting with https/)).toBeInTheDocument();
    await userEvent.clear(within(dialog).getByLabelText('URL'));
    await userEvent.type(within(dialog).getByLabelText('URL'), 'https://crm.test/hook');
    await userEvent.type(within(dialog).getByLabelText('Description (optional)'), ' CRM ');
    await userEvent.click(within(dialog).getByLabelText('All events (also future ones)'));
    expect(save).toBeDisabled();
    await userEvent.click(within(dialog).getByLabelText(/call\.completed/));
    await userEvent.click(within(dialog).getByLabelText(/contact\.opted_out/));
    await userEvent.click(within(dialog).getByLabelText(/contact\.opted_out/));
    await userEvent.click(within(dialog).getByLabelText(/Include personal data/));
    expect(within(dialog).getByText(/Customer data will leave NotifyNow/)).toBeInTheDocument();
    await userEvent.click(save);
    expect(api.create).toHaveBeenCalledWith({
      url: 'https://crm.test/hook',
      description: 'CRM',
      events: ['call.completed'],
      includePersonalData: true,
    });
    const secret = await screen.findByRole('dialog', { name: 'Copy the signing secret now' });
    expect(within(secret).getByLabelText('Signing secret')).toHaveValue('whsec_abc123');
    await userEvent.click(within(secret).getByRole('button', { name: "I've copied it" }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByDisplayValue('whsec_abc123')).not.toBeInTheDocument();
  });

  it('offers the dev receiver only when the mock APIs are on', async () => {
    const url = 'http://127.0.0.1:5100/api/v1/mock/webhook-receiver';
    api.devReceiver.mockResolvedValue(url);
    api.create.mockResolvedValue({ endpoint: fakeEndpoint(), secret: 'whsec_dev' });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Add webhook' }));
    const dialog = screen.getByRole('dialog', { name: 'Add webhook' });
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Use the dev receiver' }),
    );
    expect(within(dialog).getByLabelText('URL')).toHaveValue(url);
    expect(within(dialog).getByLabelText('Description (optional)')).toHaveValue('Dev receiver');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add webhook' }));
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ url, description: 'Dev receiver' }),
    );
  });

  it('hides the dev receiver when the mocks are off', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Add webhook' }));
    await waitFor(() => expect(api.devReceiver).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Use the dev receiver' })).toBeNull();
  });

  it('changes an endpoint (no secret), and shows save errors', async () => {
    api.update.mockRejectedValueOnce(httpError('blocked')).mockResolvedValue(fakeEndpoint());
    show();
    await userEvent.click(
      await within(await screen.findByRole('row', { name: /CRM/ })).findByRole('button', {
        name: 'Change',
      }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Change webhook' });
    expect(within(dialog).getByLabelText('URL')).toHaveValue(fakeEndpoint().url);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.update).toHaveBeenLastCalledWith('we1', expect.objectContaining({ events: ['*'] }));
    await userEvent.click(within(row('CRM')).getByRole('button', { name: 'Change' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('pause, turn on, new secret, remove', async () => {
    api.list.mockResolvedValue([
      fakeEndpoint(),
      fakeEndpoint({
        id: 'we2',
        description: 'Paused one',
        active: false,
        disabledReason: 'manual',
      }),
      fakeEndpoint({ id: 'we3', description: 'Broken', active: false, disabledReason: 'failing' }),
    ]);
    api.update.mockResolvedValue(fakeEndpoint());
    api.enable.mockResolvedValue(fakeEndpoint());
    api.rotateSecret.mockResolvedValue({ endpoint: fakeEndpoint(), secret: 'whsec_new' });
    api.remove.mockRejectedValueOnce(httpError('nope'));
    show();
    await userEvent.click(
      await within(await screen.findByRole('row', { name: /CRM/ })).findByRole('button', {
        name: 'Pause',
      }),
    );
    expect(api.update).toHaveBeenCalledWith('we1', { active: false });
    await userEvent.click(within(row('Paused one')).getByRole('button', { name: 'Turn on' }));
    expect(api.enable).toHaveBeenCalledWith('we2');
    const banner = screen
      .getByText(/Broken was turned off/)
      .closest('[role="alert"]') as HTMLElement;
    await userEvent.click(within(banner).getByRole('button', { name: 'Turn on' }));
    expect(api.enable).toHaveBeenCalledWith('we3');

    await userEvent.click(within(row('CRM')).getByRole('button', { name: 'New secret' }));
    await userEvent.click(screen.getByRole('button', { name: 'New secret' }));
    expect(await screen.findByLabelText('Signing secret')).toHaveValue('whsec_new');
    await userEvent.click(screen.getByRole('button', { name: "I've copied it" }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await userEvent.click(within(row('CRM')).getByRole('button', { name: 'Remove' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }),
    );
    expect(api.remove).toHaveBeenCalledWith('we1');
    expect(await screen.findByText('nope')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await userEvent.click(within(row('CRM')).getByRole('button', { name: 'Remove' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    );
    expect(api.remove).toHaveBeenCalledTimes(1);
  });

  it('sends a test event and shows the answer as text', async () => {
    api.test
      .mockResolvedValueOnce({
        ok: true,
        delivery: fakeDelivery({
          status: 'succeeded',
          responseStatus: 200,
          responseMs: 80,
          responseSnippet: '<script>x</script>',
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        delivery: fakeDelivery({
          responseStatus: null,
          responseMs: null,
          responseSnippet: null,
          error: 'connection refused',
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        delivery: fakeDelivery({
          responseStatus: null,
          responseMs: null,
          responseSnippet: null,
          error: null,
        }),
      })
      .mockRejectedValueOnce(httpError('rate limited'));
    show();
    await userEvent.click(
      await within(await screen.findByRole('row', { name: /CRM/ })).findByRole('button', {
        name: 'Send test',
      }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Send test event' });
    await pick('Event', 'contact.opted_in');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(api.test).toHaveBeenCalledWith('we1', 'contact.opted_in');
    expect(await within(dialog).findByText(/Delivered — HTTP 200 in 80 ms/)).toBeInTheDocument();
    expect(within(dialog).getByText('<script>x</script>')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(
      await within(dialog).findByText(/Not delivered — connection refused/),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(await within(dialog).findByText(/Not delivered — no answer/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(await within(dialog).findByText('rate limited')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('delivery log: filters, details, load older and replay', async () => {
    const firstPage = [
      fakeDelivery(),
      fakeDelivery({
        id: 'wd2',
        type: 'contact.opted_out',
        test: true,
        status: 'succeeded',
        responseStatus: 200,
        responseMs: null,
      }),
      fakeDelivery({
        id: 'wd3',
        status: 'pending',
        responseStatus: null,
        error: 'timeout',
        nextAttemptAt: '2026-10-30T06:00:00.000Z',
        responseSnippet: null,
      }),
    ];
    api.deliveries.mockImplementation((_id, query = {}) =>
      Promise.resolve(
        query.status || query.type
          ? { items: [], nextCursor: null }
          : query.cursor === 'c2'
            ? { items: [fakeDelivery({ id: 'wd4', type: 'campaign.completed' })], nextCursor: null }
            : { items: firstPage, nextCursor: 'c2' },
      ),
    );
    api.replay
      .mockResolvedValueOnce(fakeDelivery())
      .mockRejectedValueOnce(httpError('already scheduled'));
    show();
    await userEvent.click(
      await within(await screen.findByRole('row', { name: /CRM/ })).findByRole('button', {
        name: 'Deliveries',
      }),
    );
    const dialog = screen.getByRole('dialog', { name: /Deliveries — CRM/ });
    expect(await within(dialog).findByText('HTTP 500 · 120 ms')).toBeInTheDocument();
    expect(within(dialog).getByText('HTTP 200 · 0 ms')).toBeInTheDocument();
    expect(within(dialog).getByText('(test)', { exact: false })).toBeInTheDocument();
    expect(within(dialog).getByText('timeout')).toBeInTheDocument();
    expect(within(dialog).getByText('Retrying')).toBeInTheDocument();
    // only finished, non-test deliveries can be replayed
    expect(within(dialog).getAllByRole('button', { name: 'Replay' })).toHaveLength(1);

    const rows = within(dialog).getAllByRole('row');
    await userEvent.click(within(rows[1] as HTMLElement).getByRole('button', { name: 'Details' }));
    const details = within(dialog).getByLabelText('Delivery details');
    expect(within(details).getByText(/2 attempt\(s\)/)).toBeInTheDocument();
    expect(within(details).getByText(/#2 .* timeout/)).toBeInTheDocument();
    expect(within(details).getByText(/#1 .* HTTP 500/)).toBeInTheDocument();
    expect(within(details).getByText('<b>oops</b>')).toBeInTheDocument();
    await userEvent.click(within(rows[3] as HTMLElement).getByRole('button', { name: 'Details' }));
    expect(within(dialog).getByText(/Next try/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Show older' }));
    expect(await within(dialog).findByText('campaign.completed')).toBeInTheDocument();
    expect(api.deliveries).toHaveBeenLastCalledWith('we1', { cursor: 'c2' });

    await userEvent.click(
      within(dialog).getAllByRole('button', { name: 'Replay' })[0] as HTMLElement,
    );
    expect(api.replay).toHaveBeenCalledWith('wd1');
    expect(await screen.findByText(/Sending again/)).toBeInTheDocument();
    await waitFor(() =>
      expect(within(dialog).getAllByRole('button', { name: 'Replay' })[0]).toBeEnabled(),
    );
    await userEvent.click(
      within(dialog).getAllByRole('button', { name: 'Replay' })[0] as HTMLElement,
    );
    expect(await screen.findByText('already scheduled')).toBeInTheDocument();

    await pick('Status', 'Gave up');
    await waitFor(() =>
      expect(api.deliveries).toHaveBeenLastCalledWith('we1', { status: 'gave_up' }),
    );
    await pick('Event', 'whatsapp.call.missed');
    await waitFor(() =>
      expect(api.deliveries).toHaveBeenLastCalledWith('we1', {
        status: 'gave_up',
        type: 'whatsapp.call.missed',
      }),
    );
    expect(await within(dialog).findByText('No deliveries yet')).toBeInTheDocument();
    await pick('Status', 'Any');
    await pick('Event', 'Any');
    // back to the unfiltered (cached) log
    expect(await within(dialog).findByText('campaign.completed')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('read-only for people without integrations.manage and during impersonation', async () => {
    signInAs('owner', {
      permissions: ['integrations.manage'],
      impersonation: { by: 'x' } as never,
    });
    const first = show();
    expect(await screen.findByText('CRM')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add webhook' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send test' })).not.toBeInTheDocument();
    first.unmount();

    api.list.mockResolvedValue([fakeEndpoint({ active: false, disabledReason: 'failing' })]);
    api.deliveries.mockResolvedValue({ items: [fakeDelivery()], nextCursor: null });
    signInAs('viewer');
    show();
    expect(await screen.findByText(/turned off because/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn on' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Deliveries' }));
    expect(await screen.findByText('HTTP 500 · 120 ms')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replay' })).not.toBeInTheDocument();
  });
});
